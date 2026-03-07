import logging
import os
import time

import httpx

from database import get_rules_for_sensor

logger = logging.getLogger(__name__)

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")
COOLDOWN_SECONDS = float(os.getenv("RULE_COOLDOWN", "30"))

OPS = {
    "<":  lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "=":  lambda a, b: a == b,
    ">":  lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
}

_http_client: httpx.AsyncClient = httpx.AsyncClient(timeout=5)
_last_fired: dict[str, float] = {}  # rule_id -> monotonic timestamp of last trigger


async def close_client():
    await _http_client.aclose()


async def evaluate(event: dict):
    rules = await get_rules_for_sensor(event["sensor_id"])
    if not rules:
        return

    value = event.get("value")
    if value is None:
        return

    try:
        fvalue = float(value)
    except (TypeError, ValueError) as exc:
        logger.warning("Non-numeric value %r for sensor %s: %s", value, event["sensor_id"], exc)
        return

    now = time.monotonic()
    for rule in rules:
        op = OPS.get(rule["operator"])
        if op is None:
            continue
        if not op(fvalue, float(rule["threshold"])):
            continue
        last = _last_fired.get(rule["id"], 0.0)
        if now - last < COOLDOWN_SECONDS:
            continue
        _last_fired[rule["id"]] = now
        await _trigger_actuator(rule["actuator_id"], rule["action"], rule, event)


async def _trigger_actuator(actuator_id: str, action: str, rule: dict, event: dict):
    url = f"{SIMULATOR_URL}/api/actuators/{actuator_id}"
    try:
        resp = await _http_client.post(url, json={"state": action})
        resp.raise_for_status()
        logger.info(
            "Rule fired: IF %s %s %s THEN %s → %s (event value=%.2f)",
            rule["sensor_id"], rule["operator"], rule["threshold"],
            actuator_id, action, event["value"],
        )
    except Exception as exc:
        logger.warning("Failed to trigger actuator %s: %s", actuator_id, exc)
