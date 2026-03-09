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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

logger = logging.getLogger(__name__)

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.init_db()
    await database.seed_permanent_rules()
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
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.post(
                f"{SIMULATOR_URL}/api/actuators/{actuator_id}",
                json={"state": cmd.state},
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Simulator unreachable: {exc}")
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


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    snapshot = await state_cache.get_all()
    for event in snapshot.values():
        await ws.send_text(json.dumps(event))
    try:
        while True:
            await ws.receive_text()  # keep alive / ignore client messages
    except WebSocketDisconnect:
        manager.disconnect(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
