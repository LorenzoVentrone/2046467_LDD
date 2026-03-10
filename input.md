# input.md — Mars Base Automation Platform

---

## 1. System Overview

The Mars Base Automation Platform is a distributed IoT monitoring and automation system designed to keep a Mars habitat safe and operational. It ingests sensor data from a heterogeneous simulator, normalizes it into a unified internal format, evaluates automation rules in real time, and exposes a live dashboard to operators.

The system is composed of five services orchestrated via Docker Compose:

| Service | Role |
|---|---|
| `simulator` | Pre-built Mars IoT simulator. Exposes REST sensors, telemetry streams, and actuator APIs. Not modified. |
| `redpanda` | Kafka-compatible message broker. Decouples ingestion from processing via a single topic. |
| `ingestion-service` | Polls REST sensors and subscribes to SSE telemetry streams. Normalizes all payloads into the `InternalEvent` schema and publishes to Redpanda. |
| `processing-service` | Consumes events from Redpanda. Maintains in-memory sensor state, evaluates automation rules, triggers actuators, and exposes a REST + WebSocket API. |
| `frontend` | React single-page application served by nginx. Connects to the processing service via WebSocket for real-time updates. Provides sensor monitoring, actuator controls, and rule management. |

**Data flow:**

```
Simulator (REST + SSE)
    ↓  poll / subscribe
Ingestion Service
    ↓  normalize → InternalEvent
Redpanda (topic: normalized.sensor.events)
    ↓  consume
Processing Service
    ↓  state cache + rule evaluation + actuator trigger
    ↓  WebSocket broadcast
Frontend Dashboard
```

---

## 2. User Stories

### Part 1 — Monitoring and Manual Control

---

**US-01 — Critical Scalar Monitoring (REST)**
As a habitat operator, I want to monitor `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, and `corridor_pressure` in real-time on a single dashboard panel so I can ensure baseline life support is stable.
- Source: REST polling · Schema: `rest.scalar.v1`

---

**US-02 — Environmental Hazard Monitoring (REST)**
As a safety officer, I want to track particulate (`air_quality_pm25`) and chemical (`air_quality_voc`) levels so I can protect the crew from toxic inhalation and off-gassing.
- Source: REST polling · Schema: `rest.particulate.v1`, `rest.chemistry.v1`

---

**US-03 — Resource Level Monitoring (REST)**
As a habitat operator, I want to monitor the `water_tank_level` so I can anticipate shortages and schedule water reclamation before reserves run critically low.
- Source: REST polling · Schema: `rest.level.v1`

---

**US-04 — Thermal Loop Diagnostics (Stream)**
As a mission engineer, I want to view a real-time line chart of the `thermal_loop` temperature and flow rate so I can detect cooling circuit failures before they overheat the habitat.
- Source: SSE telemetry · Schema: `topic.thermal_loop.v1`

---

**US-05 — Power Grid Monitoring (Stream)**
As a mission engineer, I want to monitor the `power_bus` and `power_consumption` streams so I can identify voltage irregularities and prevent rolling blackouts.
- Source: SSE telemetry · Schema: `topic.power.v1`

---

**US-06 — Airlock & External Hazard Tracking (Stream)**
As a safety officer, I want to monitor airlock status and external radiation so I can ensure EVAs are safe and warn the crew during solar particle events.
- Source: SSE telemetry · Schema: `topic.airlock.v1`, `topic.environment.v1`

---

**US-07 — Cooling Fan Manual Control**
As a habitat operator, I want a dashboard toggle to manually switch the `cooling_fan` ON/OFF so I can immediately reduce heat without waiting for automation rules to trigger.
- Actuator: `POST /api/actuators/cooling_fan`

---

**US-08 — Entrance Humidifier Manual Control**
As a habitat operator, I want a manual toggle for the `entrance_humidifier` so I can adjust moisture levels when the crew reports dry air discomfort.
- Actuator: `POST /api/actuators/entrance_humidifier`

---

**US-09 — Hall Ventilation Manual Control**
As a safety officer, I want a manual toggle for `hall_ventilation` so I can quickly flush elevated CO₂ concentrations from the habitat.
- Actuator: `POST /api/actuators/hall_ventilation`

---

**US-10 — Habitat Heater Manual Control**
As a habitat operator, I want a manual toggle for the `habitat_heater` so I can prevent the crew from freezing during extreme Martian temperature drops.
- Actuator: `POST /api/actuators/habitat_heater`

---

### Part 2 — Automation Rules

---

**US-11 — Rule Builder Interface (UI)**
As a system administrator, I want a dashboard form to create new automation rules using the format `IF <sensor> <operator> <value> THEN set <actuator> to ON/OFF` so the system can manage devices automatically.
- Component: Rule Manager UI

---

**US-12 — Active Rules List (UI)**
As a system administrator, I want to view a list of all persisted automation rules on the dashboard so I know exactly what logic is currently running on the habitat.
- Component: Rule Manager UI

---

**US-13 — Rule Deletion (UI)**
As a system administrator, I want to be able to delete a user-created rule from the dashboard so I can stop faulty automation logic during a hardware sensor failure.
- Component: Rule Manager UI
- Note: permanent safety rules cannot be deleted.

---

**US-14 — Automated Heat Mitigation**
As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature > 24°C THEN set cooling_fan to ON` so my crops survive heat spikes while I am asleep.
- Component: Rules Engine Backend

---

**US-15 — Automated Heat Stabilization**
As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature < 22°C THEN set cooling_fan to OFF` so the fan does not waste power once the temperature normalizes.
- Component: Rules Engine Backend

---

**US-16 — Emergency CO₂ Venting**
As a safety officer, I want the system to automatically evaluate `IF co2_hall > 900ppm THEN set hall_ventilation to ON` to automatically protect the crew from asphyxiation.
- Component: Rules Engine Backend

---

**US-17 — CO₂ Venting Deactivation**
As a safety officer, I want the system to automatically evaluate `IF co2_hall < 600ppm THEN set hall_ventilation to OFF` so we do not unnecessarily vent the internal atmosphere once levels are safe.
- Component: Rules Engine Backend

---

**US-18 — Automated Cold Survival**
As a crew member, I want the system to automatically evaluate `IF thermal_loop < 25°C THEN set habitat_heater to ON` so the habitat is warmed automatically during a frigid Martian night.
- Component: Rules Engine Backend

---

**US-19 — Automated Dryness Mitigation**
As a habitat operator, I want the system to evaluate `IF entrance_humidity < 40% THEN set entrance_humidifier to ON` to prevent extreme dry air from cracking the entrance airlock seals.
- Component: Rules Engine Backend

---

**US-20 — Persistence During Outages**
As a mission engineer, I want the automation engine to load all saved rules from the database immediately after a container restart so the habitat does not lose its safety protocols during a system crash.
- Component: Rules Engine Backend · SQLite via Docker volume

---

## 3. Standard Internal Event Schema

### 3.1 The problem

The simulator exposes sensors across multiple schema families. These disagree on:
- the timestamp field name (`captured_at` in REST sensors, `event_time` in telemetry topics)
- the value structure (flat `value` field, a `measurements[]` array, or named fields like `power_kw`, `level_pct`, `pm25_ug_m3`)
- the presence of a `unit` field (absent in `rest.level.v1`, `rest.particulate.v1`, `topic.thermal_loop.v1`, `topic.airlock.v1`)
- the presence of a `status` field (absent in `topic.power.v1` and `topic.airlock.v1`)

Without normalization, every downstream consumer would need to handle all eight raw schema shapes independently.

### 3.2 The InternalEvent schema

All raw payloads are converted into the following unified schema before being published to the message broker:

```json
{
  "event_id":    "<uuid4>",
  "sensor_id":   "<string>",
  "source_type": "REST" | "TELEMETRY",
  "raw_schema":  "<string>",
  "timestamp":   "<ISO8601 UTC>",
  "value":       "<float>",
  "unit":        "<string>",
  "metadata":    "<object>"
}
```

| Field | Type | Description |
|---|---|---|
| `event_id` | string (UUID4) | Unique identifier for this event instance |
| `sensor_id` | string | Sensor identifier as defined by the simulator (e.g. `greenhouse_temperature`) |
| `source_type` | `"REST"` or `"TELEMETRY"` | Whether the event was polled or received from a stream |
| `raw_schema` | string | The original schema family (e.g. `rest.scalar.v1`) — preserved for traceability |
| `timestamp` | string (ISO8601) | Measurement time in UTC, extracted from the raw payload |
| `value` | float | The single primary numeric measurement for this sensor reading |
| `unit` | string | The unit of `value` (e.g. `°C`, `%`, `ppm`, `kW`) |
| `metadata` | object | All remaining fields from the original payload, preserved without modification |

**Key invariant:** `value` is always a `float`. This allows the rules engine and frontend to operate on sensor readings without any knowledge of the original schema.

### 3.3 Normalization rules per schema family

#### `rest.scalar.v1`
Sensors: `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, `corridor_pressure`

Raw payload:
```json
{ "sensor_id": "...", "captured_at": "...", "metric": "...", "value": 26.3, "unit": "°C", "status": "ok" }
```

Mapping:
- `timestamp` ← `captured_at`
- `value` ← `value`
- `unit` ← `unit`
- `metadata` ← `{ status, metric }`

---

#### `rest.chemistry.v1`
Sensors: `hydroponic_ph`, `air_quality_voc`

Raw payload:
```json
{ "sensor_id": "...", "captured_at": "...", "measurements": [{ "metric": "pH", "value": 6.8, "unit": "pH" }], "status": "ok" }
```

Mapping:
- `timestamp` ← `captured_at`
- `value` ← `measurements[0].value` (primary measurement)
- `unit` ← `measurements[0].unit`
- `metadata` ← `{ status, metric, measurements[] }` (full array preserved)

Rationale: The schema provides no top-level `value`. `measurements[0]` is selected as the primary reading. All measurements are preserved in `metadata` for display purposes.

---

#### `rest.level.v1`
Sensor: `water_tank_level`

Raw payload:
```json
{ "sensor_id": "...", "captured_at": "...", "level_pct": 73.5, "level_liters": 1470.0, "status": "ok" }
```

Mapping:
- `timestamp` ← `captured_at`
- `value` ← `level_pct`
- `unit` ← `"%"` (hardcoded — schema has no `unit` field)
- `metadata` ← `{ status, level_pct, level_liters }`

Rationale: `level_pct` is preferred over `level_liters` because a percentage threshold is scale-independent and universally meaningful for rule conditions.

---

#### `rest.particulate.v1`
Sensor: `air_quality_pm25`

Raw payload:
```json
{ "sensor_id": "...", "captured_at": "...", "pm1_ug_m3": 5.1, "pm25_ug_m3": 12.3, "pm10_ug_m3": 18.7, "status": "ok" }
```

Mapping:
- `timestamp` ← `captured_at`
- `value` ← `pm25_ug_m3`
- `unit` ← `"µg/m³"` (hardcoded — schema has no `unit` field)
- `metadata` ← `{ status, pm1_ug_m3, pm25_ug_m3, pm10_ug_m3 }`

Rationale: The sensor is named `air_quality_pm25` by the simulator, identifying PM2.5 as the primary metric. All three particulate readings are preserved in `metadata`.

---

#### `topic.power.v1`
Sensors: `solar_array`, `power_bus`, `power_consumption`

Raw payload:
```json
{ "topic": "...", "event_time": "...", "subsystem": "...", "power_kw": 4.2, "voltage_v": 240.0, "current_a": 17.5, "cumulative_kwh": 102.3 }
```

Mapping:
- `timestamp` ← `event_time`
- `value` ← `power_kw`
- `unit` ← `"kW"`
- `metadata` ← `{ voltage_v, current_a, cumulative_kwh, subsystem }`

Rationale: `power_kw` is the most actionable metric for rule thresholds. Voltage and current are diagnostic. `cumulative_kwh` is a running counter, not a current-state reading. Note: timestamp key is `event_time`, not `captured_at`.

---

#### `topic.environment.v1`
Sensors: `radiation`, `life_support`

Raw payload:
```json
{ "topic": "...", "event_time": "...", "source": { "system": "...", "segment": "..." }, "measurements": [{ "metric": "...", "value": 20.9, "unit": "%" }], "status": "ok" }
```

Mapping:
- `timestamp` ← `event_time`
- `value` ← `measurements[0].value`
- `unit` ← `measurements[0].unit`
- `metadata` ← `{ status, metric, measurements[], source_system, source_segment }`

Rationale: Same `measurements[]` pattern as `rest.chemistry.v1`. The `source` object is flattened into `metadata` as `source_system` and `source_segment` to avoid nested object parsing downstream.

---

#### `topic.thermal_loop.v1`
Sensor: `thermal_loop`

Raw payload:
```json
{ "topic": "...", "event_time": "...", "loop": "primary", "temperature_c": 18.5, "flow_l_min": 3.2, "status": "ok" }
```

Mapping:
- `timestamp` ← `event_time`
- `value` ← `temperature_c`
- `unit` ← `"°C"` (hardcoded — schema has no `unit` field)
- `metadata` ← `{ status, loop, flow_l_min, flow_rate_lpm }`

Rationale: `temperature_c` is the safety-critical value for habitat heating rules (US-18). Flow rate is a diagnostic metric stored in `metadata`.

---

#### `topic.airlock.v1`
Sensor: `airlock`

Raw payload:
```json
{ "topic": "...", "event_time": "...", "airlock_id": "main", "cycles_per_hour": 2.0, "last_state": "IDLE" }
```

Mapping:
- `timestamp` ← `event_time`
- `value` ← numeric encoding of `last_state`: `IDLE=0`, `PRESSURIZING=1`, `DEPRESSURIZING=2`
- `unit` ← `"state"`
- `metadata` ← `{ state, airlock_id, cycles_per_hour }`

Rationale: The rules engine only supports numeric comparisons (`<`, `<=`, `=`, `>=`, `>`). `last_state` is a string enum and cannot be compared numerically without encoding. The state-to-integer mapping allows rules like `IF airlock = 1` (airlock pressurizing). The original string value is preserved in `metadata.state` for frontend display.

---

## 4. Rule Model

### 4.1 Rule syntax

```
IF <sensor_id> <operator> <threshold> [unit]
THEN set <actuator_id> to ON | OFF
```

Supported operators: `<`, `<=`, `=`, `>=`, `>`

Example:
```
IF greenhouse_temperature > 24 °C THEN set cooling_fan to ON
```

### 4.2 Rule schema (as stored in the database)

```json
{
  "id":          "<string>",
  "sensor_id":   "<string>",
  "operator":    "< | <= | = | >= | >",
  "threshold":   "<float>",
  "unit":        "<string | null>",
  "actuator_id": "<string>",
  "action":      "ON | OFF",
  "permanent":   "<boolean>"
}
```

| Field | Description |
|---|---|
| `id` | UUID for user-created rules; fixed prefixed string for permanent safety rules |
| `sensor_id` | The sensor to watch. Must match a known `sensor_id` in the InternalEvent schema |
| `operator` | Comparison operator applied as `event.value OPERATOR threshold` |
| `threshold` | Numeric threshold for the comparison |
| `unit` | Display only — not used in evaluation logic |
| `actuator_id` | One of: `cooling_fan`, `entrance_humidifier`, `hall_ventilation`, `habitat_heater` |
| `action` | `ON` or `OFF` — the state to set on the actuator when the rule fires |
| `permanent` | `true` for built-in safety rules (cannot be deleted); `false` for user-created rules |

### 4.3 Evaluation behaviour

- Rules are evaluated **on every event arrival** from the message broker.
- Only rules whose `sensor_id` matches the incoming event are evaluated (no full table scan per event).
- The comparison is: `float(event.value) OPERATOR float(rule.threshold)`.
- A **30-second cooldown** per rule prevents the actuator from being triggered repeatedly while a condition remains true.
- When a rule fires: the actuator is triggered via `POST /api/actuators/{actuator_id}`, a log entry is written to the `rule_logs` table, and an alert is broadcast over WebSocket to all connected dashboards.

### 4.4 Persistence

Rules are stored in a SQLite database (`rules.db`) mounted on a named Docker volume. The volume persists across container restarts, satisfying US-20. On startup, the processing service seeds a set of permanent safety rules (US-14 through US-19 plus two additional rules) if they do not already exist, using an idempotent insert strategy.

### 4.5 Permanent safety rules

The following rules are seeded automatically on startup and cannot be deleted:

| Rule | Condition | Actuator | Action |
|---|---|---|---|
| US-14 | `greenhouse_temperature > 24°C` | `cooling_fan` | ON |
| US-15 | `greenhouse_temperature < 22°C` | `cooling_fan` | OFF |
| US-16 | `co2_hall > 900 ppm` | `hall_ventilation` | ON |
| US-17 | `co2_hall < 600 ppm` | `hall_ventilation` | OFF |
| US-18 | `thermal_loop < 25°C` | `habitat_heater` | ON |
| US-19 | `entrance_humidity < 40%` | `entrance_humidifier` | ON |
| — | `entrance_humidity > 80%` | `entrance_humidifier` | OFF |
| — | `air_quality_pm25 > 35 µg/m³` | `hall_ventilation` | ON |
