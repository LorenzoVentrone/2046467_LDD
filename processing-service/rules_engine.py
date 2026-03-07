import logging
import os
import time
from datetime import datetime, timezone

import httpx

from database import get_rules_for_sensor, insert_rule_log

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


async def evaluate(event: dict) -> list[dict]:
    """Evaluate all rules for a sensor event.

    Returns a list of alert dicts for every rule that fired, so the caller
    can broadcast them over WebSocket.
    """
    alerts: list[dict] = []
    rules = await get_rules_for_sensor(event["sensor_id"])
    if not rules:
        return alerts

    value = event.get("value")
    if value is None:
        return alerts

    try:
        fvalue = float(value)
    except (TypeError, ValueError) as exc:
        logger.warning("Non-numeric value %r for sensor %s: %s", value, event["sensor_id"], exc)
        return alerts

    now = time.monotonic()
    for rule in rules:
        op = OPS.get(rule["operator"])
        if op is None:
            continue

        matched = op(fvalue, float(rule["threshold"]))
        logger.debug(
            "Rule %s: %s %s %s => %s (value=%.2f)",
            rule["id"][:8], rule["sensor_id"], rule["operator"],
            rule["threshold"], matched, fvalue,
        )

        if not matched:
            continue

        last = _last_fired.get(rule["id"], 0.0)
        if now - last < COOLDOWN_SECONDS:
            logger.debug("Rule %s in cooldown, skipping", rule["id"][:8])
            continue

        _last_fired[rule["id"]] = now

        # Trigger the actuator
        await _trigger_actuator(rule["actuator_id"], rule["action"], rule, event)

        # Build alert payload
        fired_at = datetime.now(timezone.utc).isoformat()
        alert = {
            "type": "alert",
            "rule_id": rule["id"],
            "sensor_id": rule["sensor_id"],
            "operator": rule["operator"],
            "threshold": rule["threshold"],
            "sensor_value": round(fvalue, 2),
            "actuator_id": rule["actuator_id"],
            "action": rule["action"],
            "fired_at": fired_at,
        }
        alerts.append(alert)

        # Persist log
        try:
            await insert_rule_log(alert)
        except Exception as exc:
            logger.warning("Failed to persist rule log: %s", exc)

    return alerts


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
