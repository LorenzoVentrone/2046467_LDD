import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import state_cache
import database
import rules_engine
from consumer import consume_loop
from websocket_manager import manager
from pipeline_logger import pipeline_logger

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")
KAFKA_BROKER  = os.getenv("KAFKA_BROKER",  "localhost:9092")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.init_db()
    await database.seed_permanent_rules()

    # Startup pipeline log — stored in history so terminal clients see it on connect
    await pipeline_logger.log("PROCESSING", "→ Processing service starting up", "SUCCESS")
    await pipeline_logger.log("PROCESSING", f"→ Kafka broker: {KAFKA_BROKER}")
    await pipeline_logger.log("PROCESSING", f"→ Simulator URL: {SIMULATOR_URL}")
    await pipeline_logger.log("PROCESSING", "→ Database ready — permanent rules seeded")

    task = asyncio.create_task(consume_loop())
    task.add_done_callback(
        lambda t: logger.error("Consumer task died: %s", t.exception())
        if not t.cancelled() and t.exception()
        else None
    )
    yield
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)
    await rules_engine.close_client()


app = FastAPI(title="Mars Processing Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Sensor state ───────────────────────────────────────────────────────────────

@app.get("/api/state")
async def get_state():
    return await state_cache.get_all()


@app.get("/api/sensors/{sensor_id}")
async def get_sensor(sensor_id: str):
    event = await state_cache.get_one(sensor_id)
    if event is None:
        raise HTTPException(status_code=404, detail=f"No data for '{sensor_id}' yet")
    return event


# ── Actuator proxy ─────────────────────────────────────────────────────────────

@app.get("/api/actuators")
async def get_actuators():
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{SIMULATOR_URL}/api/actuators")
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Simulator unreachable: {exc}")
    return resp.json()


class ActuatorCommand(BaseModel):
    state: Literal["ON", "OFF"]


@app.post("/api/actuators/{actuator_id}")
async def set_actuator(actuator_id: str, cmd: ActuatorCommand):
    # ── Pipeline logs for the manual actuator flow ─────────────────────────
    await pipeline_logger.log(
        "PROCESSING",
        f"→ Actuator command received: {actuator_id} → {cmd.state}",
    )
    await pipeline_logger.log(
        "PROCESSING",
        f"→ Proxying to simulator: POST /api/actuators/{actuator_id}",
    )
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.post(
                f"{SIMULATOR_URL}/api/actuators/{actuator_id}",
                json={"state": cmd.state},
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            await pipeline_logger.log(
                "SIMULATOR",
                f"✖ HTTP {exc.response.status_code} from simulator for {actuator_id}",
                "ERROR",
            )
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            await pipeline_logger.log(
                "SIMULATOR",
                f"✖ Simulator unreachable: {exc}",
                "ERROR",
            )
            raise HTTPException(status_code=502, detail=f"Simulator unreachable: {exc}")
    await pipeline_logger.log(
        "SIMULATOR",
        f"✔ {actuator_id} acknowledged: {cmd.state}",
        "SUCCESS",
    )
    return resp.json()


# ── Rules ──────────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    sensor_id: str
    operator: Literal["<", "<=", "=", ">", ">="]
    threshold: float
    unit: str | None = None
    actuator_id: str
    action: Literal["ON", "OFF"]


@app.get("/api/rules")
async def list_rules():
    return await database.list_rules()


@app.post("/api/rules", status_code=201)
async def create_rule(body: RuleCreate):
    rule = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
        "permanent": 0,
    }
    await database.insert_rule(rule)
    return {**rule, "permanent": False}


@app.delete("/api/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str):
    rule = await database.get_rule(rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.get("permanent"):
        raise HTTPException(status_code=403, detail="Cannot delete a permanent safety rule")
    deleted = await database.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")


@app.get("/api/rules/log")
async def get_rule_logs(limit: int = 50):
    """Return recent rule-fired events for the Alerts panel."""
    return await database.get_recent_logs(limit)


# ── Pipeline log ingest (from ingestion-service) ───────────────────────────────

class PipelineLogEntry(BaseModel):
    service: str
    message: str
    level: str = "INFO"


@app.post("/api/pipeline-log", status_code=200)
async def receive_pipeline_log(body: PipelineLogEntry):
    """Accepts log events from other services (e.g. ingestion-service) and
    broadcasts them to all /ws/logs clients."""
    await pipeline_logger.log(
        service=body.service,
        message=body.message,
        level=body.level,
    )
    return {"ok": True}


# ── WebSocket: sensor data & alerts ───────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    await pipeline_logger.log(
        "WEBSOCKET",
        f"→ Dashboard client connected ({len(manager._connections)} total)",
    )
    snapshot = await state_cache.get_all()
    for event in snapshot.values():
        await ws.send_text(json.dumps(event))
    try:
        while True:
            await ws.receive_text()  # keep alive / ignore client messages
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── WebSocket: live pipeline log stream ───────────────────────────────────────

@app.websocket("/ws/logs")
async def websocket_logs(ws: WebSocket):
    """Streams pipeline_log events to the DemoTerminal.
    On connect, replays history so the client sees recent events immediately."""
    await pipeline_logger.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        pipeline_logger.disconnect(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
