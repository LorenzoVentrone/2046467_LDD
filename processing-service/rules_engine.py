import logging
import httpx
import os
from database import get_rules_for_sensor

logger = logging.getLogger(__name__)

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")

OPS = {
    "<":  lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "=":  lambda a, b: a == b,
    ">":  lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
}


async def evaluate(event: dict):
    rules = await get_rules_for_sensor(event["sensor_id"])
    if not rules:
        return

    value = event.get("value")
    if value is None:
        return

    for rule in rules:
        op = OPS.get(rule["operator"])
        if op is None:
            continue
        if op(float(value), float(rule["threshold"])):
            await _trigger_actuator(rule["actuator_id"], rule["action"], rule, event)


async def _trigger_actuator(actuator_id: str, action: str, rule: dict, event: dict):
    url = f"{SIMULATOR_URL}/api/actuators/{actuator_id}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.post(url, json={"state": action})
            resp.raise_for_status()
        logger.info(
            "Rule fired: IF %s %s %s THEN %s → %s (event value=%.2f)",
            rule["sensor_id"], rule["operator"], rule["threshold"],
            actuator_id, action, event["value"],
        )
    except Exception as exc:
        logger.warning("Failed to trigger actuator %s: %s", actuator_id, exc)
