import asyncio
import logging
import os
import uuid

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

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")

app = FastAPI(title="Mars Processing Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await database.init_db()
    asyncio.create_task(consume_loop())


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
        resp = await client.get(f"{SIMULATOR_URL}/api/actuators")
        resp.raise_for_status()
        return resp.json()


class ActuatorCommand(BaseModel):
    state: str  # "ON" | "OFF"


@app.post("/api/actuators/{actuator_id}")
async def set_actuator(actuator_id: str, cmd: ActuatorCommand):
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(
            f"{SIMULATOR_URL}/api/actuators/{actuator_id}",
            json={"state": cmd.state},
        )
        resp.raise_for_status()
        return resp.json()


# ── Rules ──────────────────────────────────────────────────────────────────────

class RuleCreate(BaseModel):
    sensor_id: str
    operator: str   # <, <=, =, >, >=
    threshold: float
    unit: str | None = None
    actuator_id: str
    action: str     # ON | OFF


@app.get("/api/rules")
async def list_rules():
    return await database.list_rules()


@app.post("/api/rules", status_code=201)
async def create_rule(body: RuleCreate):
    if body.operator not in ("<", "<=", "=", ">", ">="):
        raise HTTPException(status_code=422, detail="Invalid operator")
    if body.action not in ("ON", "OFF"):
        raise HTTPException(status_code=422, detail="Action must be ON or OFF")
    rule = {
        "id": str(uuid.uuid4()),
        **body.model_dump(),
    }
    await database.insert_rule(rule)
    return rule


@app.delete("/api/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: str):
    deleted = await database.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")


# ── WebSocket ──────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await manager.connect(ws)
    # Send current state snapshot on connect
    snapshot = await state_cache.get_all()
    for event in snapshot.values():
        await ws.send_text(__import__("json").dumps(event))
    try:
        while True:
            await ws.receive_text()  # keep alive / ignore client messages
    except WebSocketDisconnect:
        manager.disconnect(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=False)
