"""
Converts raw simulator payloads into the unified InternalEvent schema.

InternalEvent:
{
    "event_id": str (uuid4),
    "sensor_id": str,
    "source_type": "REST" | "TELEMETRY",
    "raw_schema": str,
    "timestamp": str (ISO8601),
    "value": float,
    "unit": str,
    "metadata": dict
}
"""

import uuid
from datetime import datetime, timezone


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(sensor_id: str, source_type: str, raw_schema: str, payload: dict) -> dict:
    base = {
        "event_id": str(uuid.uuid4()),
        "sensor_id": sensor_id,
        "source_type": source_type,
        "raw_schema": raw_schema,
        "metadata": {},
    }

    if raw_schema == "rest.scalar.v1":
        return {**base, **_scalar(payload)}

    if raw_schema == "rest.chemistry.v1":
        return {**base, **_chemistry(payload)}

    if raw_schema == "rest.level.v1":
        return {**base, **_level(payload)}

    if raw_schema == "rest.particulate.v1":
        return {**base, **_particulate(payload)}

    if raw_schema == "topic.power.v1":
        return {**base, **_power(payload)}

    if raw_schema == "topic.environment.v1":
        return {**base, **_environment(payload)}

    if raw_schema == "topic.thermal_loop.v1":
        return {**base, **_thermal_loop(payload)}

    if raw_schema == "topic.airlock.v1":
        return {**base, **_airlock(payload)}

    # Unknown schema: best-effort passthrough
    return {
        **base,
        "timestamp": payload.get("timestamp", _now_iso()),
        "value": payload.get("value", 0.0),
        "unit": payload.get("unit", "unknown"),
        "metadata": payload,
    }


# ── Schema handlers ────────────────────────────────────────────────────────────

def _scalar(p: dict) -> dict:
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(p.get("value", 0)),
        "unit": p.get("unit", ""),
        "metadata": {},
    }


def _chemistry(p: dict) -> dict:
    meta = {}
    for key in ("category", "concentration_category", "status", "level"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(p.get("value", 0)),
        "unit": p.get("unit", ""),
        "metadata": meta,
    }


def _level(p: dict) -> dict:
    meta = {}
    if "percentage" in p:
        meta["percentage"] = float(p["percentage"])
    if "max_capacity" in p:
        meta["max_capacity"] = p["max_capacity"]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(p.get("value", 0)),
        "unit": p.get("unit", ""),
        "metadata": meta,
    }


def _particulate(p: dict) -> dict:
    meta = {}
    for key in ("aqi", "air_quality_index", "category", "health_concern"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(p.get("value", 0)),
        "unit": p.get("unit", "ug/m3"),
        "metadata": meta,
    }


def _power(p: dict) -> dict:
    # may have watts, voltage, current or a nested reading
    value = p.get("power_w") or p.get("watts") or p.get("value") or 0.0
    unit = p.get("unit", "W")
    meta = {}
    for key in ("voltage_v", "current_a", "status", "state"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(value),
        "unit": unit,
        "metadata": meta,
    }


def _environment(p: dict) -> dict:
    # life_support / radiation topics
    value = p.get("value") or p.get("radiation_uSv_h") or p.get("level") or 0.0
    unit = p.get("unit", "")
    meta = {}
    for key in ("o2_percent", "co2_ppm", "pressure_kpa", "humidity_percent",
                "temperature_c", "status", "alert_level"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(value),
        "unit": unit,
        "metadata": meta,
    }


def _thermal_loop(p: dict) -> dict:
    value = p.get("temperature_c") or p.get("value") or 0.0
    meta = {}
    for key in ("flow_rate_lpm", "inlet_temp_c", "outlet_temp_c", "status"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": float(value),
        "unit": p.get("unit", "celsius"),
        "metadata": meta,
    }


def _airlock(p: dict) -> dict:
    # airlock has a state enum rather than a numeric reading
    state = p.get("state") or p.get("status") or "UNKNOWN"
    # encode state as numeric for rule evaluation (OPEN=1, CLOSED=0, CYCLING=2)
    state_map = {"OPEN": 1.0, "CLOSED": 0.0, "CYCLING": 2.0}
    value = state_map.get(str(state).upper(), 0.0)
    meta = {"state": state}
    for key in ("inner_door", "outer_door", "pressure_kpa", "cycle_progress"):
        if key in p:
            meta[key] = p[key]
    return {
        "timestamp": p.get("timestamp", _now_iso()),
        "value": value,
        "unit": "state",
        "metadata": meta,
    }
