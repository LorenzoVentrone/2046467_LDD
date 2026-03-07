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
    # rest.scalar.v1: { sensor_id, captured_at, metric, value, unit, status }
    return {
        "timestamp": p.get("captured_at", p.get("timestamp", _now_iso())),
        "value": float(p.get("value", 0)),
        "unit": p.get("unit", ""),
        "metadata": {"status": p.get("status", "ok"), "metric": p.get("metric", "")},
    }


def _chemistry(p: dict) -> dict:
    # rest.chemistry.v1: { sensor_id, captured_at, measurements: [{metric, value, unit}], status }
    # Extract the primary measurement value from the measurements array
    measurements = p.get("measurements", [])
    value = 0.0
    unit = ""
    meta = {"status": p.get("status", "ok")}

    if measurements and len(measurements) > 0:
        primary = measurements[0]
        value = float(primary.get("value", 0))
        unit = primary.get("unit", "")
        meta["metric"] = primary.get("metric", "")
        # Store all measurements in metadata
        meta["measurements"] = measurements
    else:
        # Fallback to direct fields
        value = float(p.get("value", 0))
        unit = p.get("unit", "")

    for key in ("category", "concentration_category", "level"):
        if key in p:
            meta[key] = p[key]

    return {
        "timestamp": p.get("captured_at", p.get("timestamp", _now_iso())),
        "value": value,
        "unit": unit,
        "metadata": meta,
    }


def _level(p: dict) -> dict:
    # rest.level.v1: { sensor_id, captured_at, level_pct, level_liters, status }
    level_pct = p.get("level_pct", p.get("percentage", p.get("value", 0)))
    meta = {"status": p.get("status", "ok")}
    if "level_liters" in p:
        meta["level_liters"] = p["level_liters"]
    if "level_pct" in p:
        meta["level_pct"] = p["level_pct"]

    return {
        "timestamp": p.get("captured_at", p.get("timestamp", _now_iso())),
        "value": float(level_pct),
        "unit": p.get("unit", "%"),
        "metadata": meta,
    }


def _particulate(p: dict) -> dict:
    # rest.particulate.v1: { sensor_id, captured_at, pm1_ug_m3, pm25_ug_m3, pm10_ug_m3, status }
    # Use pm25 as the primary value
    value = p.get("pm25_ug_m3", p.get("value", 0))
    meta = {"status": p.get("status", "ok")}
    for key in ("pm1_ug_m3", "pm25_ug_m3", "pm10_ug_m3", "aqi", "air_quality_index",
                "category", "health_concern"):
        if key in p:
            meta[key] = p[key]

    return {
        "timestamp": p.get("captured_at", p.get("timestamp", _now_iso())),
        "value": float(value),
        "unit": p.get("unit", "µg/m³"),
        "metadata": meta,
    }


def _power(p: dict) -> dict:
    # topic.power.v1: { topic, event_time, subsystem, power_kw, voltage_v, current_a, cumulative_kwh }
    value = p.get("power_kw", p.get("power_w", p.get("watts", p.get("value", 0.0))))
    unit = "kW" if "power_kw" in p else p.get("unit", "W")
    meta = {"status": p.get("status", "ok")}
    for key in ("voltage_v", "current_a", "cumulative_kwh", "subsystem", "state"):
        if key in p:
            meta[key] = p[key]

    return {
        "timestamp": p.get("event_time", p.get("timestamp", _now_iso())),
        "value": float(value),
        "unit": unit,
        "metadata": meta,
    }


def _environment(p: dict) -> dict:
    # topic.environment.v1: { topic, event_time, source: {system, segment}, measurements: [{metric, value, unit}], status }
    measurements = p.get("measurements", [])
    value = 0.0
    unit = ""
    meta = {"status": p.get("status", "ok")}

    if measurements and len(measurements) > 0:
        primary = measurements[0]
        value = float(primary.get("value", 0))
        unit = primary.get("unit", "")
        meta["metric"] = primary.get("metric", "")
        meta["measurements"] = measurements
    else:
        # Fallback to direct fields
        value = float(
            p.get("value", 0) or p.get("radiation_uSv_h", 0) or p.get("level", 0)
        )
        unit = p.get("unit", "")

    source = p.get("source", {})
    if source:
        meta["source_system"] = source.get("system", "")
        meta["source_segment"] = source.get("segment", "")

    for key in ("o2_percent", "co2_ppm", "pressure_kpa", "humidity_percent",
                "temperature_c", "alert_level"):
        if key in p:
            meta[key] = p[key]

    return {
        "timestamp": p.get("event_time", p.get("timestamp", _now_iso())),
        "value": value,
        "unit": unit,
        "metadata": meta,
    }


def _thermal_loop(p: dict) -> dict:
    # topic.thermal_loop.v1: { topic, event_time, loop, temperature_c, flow_l_min, status }
    value = p.get("temperature_c", p.get("value", 0.0))
    meta = {"status": p.get("status", "ok")}
    for key in ("flow_l_min", "flow_rate_lpm", "inlet_temp_c", "outlet_temp_c", "loop"):
        if key in p:
            meta[key] = p[key]
    # Also ensure flow_l_min is in metadata under a standard key
    if "flow_l_min" in p:
        meta["flow_rate_lpm"] = p["flow_l_min"]

    return {
        "timestamp": p.get("event_time", p.get("timestamp", _now_iso())),
        "value": float(value),
        "unit": p.get("unit", "°C"),
        "metadata": meta,
    }


def _airlock(p: dict) -> dict:
    # topic.airlock.v1: { topic, event_time, airlock_id, cycles_per_hour, last_state }
    # last_state is the enum: IDLE, PRESSURIZING, DEPRESSURIZING
    state = p.get("last_state", p.get("state", p.get("status", "UNKNOWN")))
    # encode state as numeric for rule evaluation
    state_map = {"IDLE": 0.0, "PRESSURIZING": 1.0, "DEPRESSURIZING": 2.0,
                 "OPEN": 1.0, "CLOSED": 0.0, "CYCLING": 2.0}
    value = state_map.get(str(state).upper(), 0.0)
    meta = {"state": state, "status": p.get("status", "ok")}
    for key in ("airlock_id", "cycles_per_hour", "inner_door", "outer_door",
                "pressure_kpa", "cycle_progress"):
        if key in p:
            meta[key] = p[key]

    return {
        "timestamp": p.get("event_time", p.get("timestamp", _now_iso())),
        "value": value,
        "unit": "state",
        "metadata": meta,
    }
