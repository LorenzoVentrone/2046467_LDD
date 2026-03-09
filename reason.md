# Why I Built the Ingestion Layer This Way

*A student's chain of thought — written after the fact, but honest about how it actually happened.*
*Each decision is annotated with the exact source (PDF section or SCHEMA_CONTRACT.md) that forced or justified it.*

---

## The starting point: two very different kinds of devices

> **Source — PDF §3.2 and §3.3, and PDF §4 point 1:**
> *"Collects data from simulated devices (polling and/or stream depending on team size)"*
> §3.2 lists 8 REST sensors under `GET /api/sensors/{sensor_id}`.
> §3.3 lists 7 telemetry topics under `GET /api/telemetry/stream/{topic}` (SSE) or `WS /api/telemetry/ws?topic={topic}`.

The spec explicitly splits devices into two categories with different access patterns. REST devices must be *asked* — you go and fetch. Telemetry devices *publish* — you subscribe and listen. That difference in protocol is what forced the split into a `Poller` and a `StreamConsumer`. A single unified fetcher couldn't handle both without becoming a mess.

> **Source — PDF §6 Architectural constraints (Mandatory):**
> *"Separate ingestion, processing, and presentation"*
> *"Strongly discouraged: Tight coupling between services"*

Both components publish to Kafka and nothing else. They don't talk to the processing service directly. That's the decoupling the spec demands.

---

## The unified schema: why force everything into one shape

> **Source — PDF §4 point 2:**
> *"Normalizes heterogeneous payloads into a standard internal event format. You need to define and document such a standard."*
>
> **Source — PDF §5.1:**
> *"Convert incoming data into a unified internal event schema"*
>
> **Source — PDF §7.3 Baseline, point 3:**
> *"Unified event schema"*

The assignment doesn't just suggest normalization — it explicitly requires it as a baseline deliverable. The downstream consumers (rules engine, frontend) must not need to know anything about the raw sensor protocol. That's the contract.

> **Source — SCHEMA_CONTRACT.md, all sections:**
> The contract shows that raw payloads disagree on almost everything:
> - Timestamp key: REST sensors use `captured_at`; telemetry topics use `event_time`
> - Value structure: some schemas have a flat `value` field; others use a `measurements` array; others use named fields like `power_kw`, `level_pct`, `pm25_ug_m3`, `temperature_c`
> - Unit: some schemas include a `unit` field; `rest.level.v1`, `rest.particulate.v1`, `topic.thermal_loop.v1`, and `topic.airlock.v1` do not

This is exactly why the `InternalEvent` schema exists. Without it, every consumer would need a switch statement over 8 raw schemas.

```
event_id, sensor_id, source_type, raw_schema, timestamp, value, unit, metadata
```

`value` is always a `float`. `unit` is always a string. `timestamp` is always ISO8601.

---

## The normalizer: deciding what "the value" is

### Scalar sensors (`_scalar`)

> **Source — SCHEMA_CONTRACT.md, `rest.scalar.v1`:**
> ```json
> { "sensor_id", "captured_at", "metric", "value", "unit", "status" }
> ```

The schema gives you a single `value` and `unit` directly. No decision needed — map them straight across. Use `captured_at` as the timestamp.

---

### Chemistry sensors (`_chemistry`)

> **Source — SCHEMA_CONTRACT.md, `rest.chemistry.v1`:**
> ```json
> { "sensor_id", "captured_at", "measurements": [{"metric", "value", "unit"}], "status" }
> ```

There is no top-level `value`. The data lives in a `measurements` array. I had to pick one element as the primary `value` for the `InternalEvent`. I chose `measurements[0]` and preserved the full array in `metadata` so the frontend can still display all compounds if needed.

---

### Level sensor (`_level`)

> **Source — SCHEMA_CONTRACT.md, `rest.level.v1`:**
> ```json
> { "sensor_id", "captured_at", "level_pct", "level_liters", "status" }
> ```
> Note: no `unit` field in this schema.

Two candidate values: `level_pct` and `level_liters`. I chose `level_pct` because percentage is scale-independent — a rule like `IF water_tank_level < 20` reads the same regardless of how large the tank is. `level_liters` requires knowing the tank capacity to write a meaningful threshold. Since the schema has no `unit` field, the default `"%"` is hardcoded.

---

### Particulate sensor (`_particulate`)

> **Source — SCHEMA_CONTRACT.md, `rest.particulate.v1`:**
> ```json
> { "sensor_id", "captured_at", "pm1_ug_m3", "pm25_ug_m3", "pm10_ug_m3", "status" }
> ```
> Note: three separate PM readings, no single `value` field, no `unit` field.

Three candidates. The sensor is named `air_quality_pm25` in the REST sensor table (PDF §3.2), which is an unambiguous signal — PM2.5 is the intended primary metric. All three values go into metadata.

---

### Power topics (`_power`)

> **Source — SCHEMA_CONTRACT.md, `topic.power.v1`:**
> ```json
> { "topic", "event_time", "subsystem", "power_kw", "voltage_v", "current_a", "cumulative_kwh" }
> ```
> Note: `event_time` not `captured_at`. No `status` field.

`power_kw` is the most directly actionable value for automation rules (e.g. shed load if consumption exceeds X kW). Voltage and current are diagnostic values — useful for display but not for simple threshold rules. `cumulative_kwh` is an aggregate counter, not a real-time state. Timestamp key is `event_time` — different from REST sensors, which is exactly why the normalizer maps it explicitly rather than using a generic key.

---

### Environment topics (`_environment`)

> **Source — SCHEMA_CONTRACT.md, `topic.environment.v1`:**
> ```json
> {
>   "topic", "event_time",
>   "source": { "system", "segment" },
>   "measurements": [{"metric", "value", "unit"}],
>   "status"
> }
> ```

Same `measurements[]` pattern as `rest.chemistry.v1` — same solution. First measurement is the primary `value`, all are in metadata. The `source` object (system + segment) is flattened into metadata as `source_system` / `source_segment` so the frontend can label sensor readings with their physical location without parsing a nested object.

---

### Thermal loop (`_thermal_loop`)

> **Source — SCHEMA_CONTRACT.md, `topic.thermal_loop.v1`:**
> ```json
> { "topic", "event_time", "loop", "temperature_c", "flow_l_min", "status" }
> ```
> Note: no `unit` field.

`temperature_c` is the value you write safety rules against (e.g. US-18: `IF thermal_loop < 10 THEN set habitat_heater to ON`). Flow rate is a health indicator for the cooling circuit but not a direct safety threshold in the user stories. `"°C"` is hardcoded as the unit since the schema provides no `unit` field.

> **Source — Users_Stories.md, US-18:**
> *"IF thermal_loop < 10 THEN set habitat_heater to ON"*

This user story directly confirms that `temperature_c` must be the primary `value` — that's the field the rule threshold is written against.

---

### Airlock (`_airlock`)

> **Source — SCHEMA_CONTRACT.md, `topic.airlock.v1`:**
> ```json
> { "topic", "event_time", "airlock_id", "cycles_per_hour", "last_state" }
> ```
> `last_state` enum: `"IDLE"`, `"PRESSURIZING"`, `"DEPRESSURIZING"`
> Note: no `status` field, no `unit` field.

This was the hardest decision. Two candidates: `last_state` (an enum string) and `cycles_per_hour` (a float).

> **Source — PDF §5.2 Automation engine:**
> *"IF \<sensor_name\> \<operator\> \<value\>"*
> Supported operators: `<`, `<=`, `=`, `>=`, `>`

The rules engine operates on numeric comparisons. `last_state` is a string enum — it cannot be compared with `<` or `>` out of the box. To make it usable in rules at all, I encoded it as a number: IDLE=0, PRESSURIZING=1, DEPRESSURIZING=2. The tradeoff is that rules become `IF airlock = 1` instead of `IF airlock = PRESSURIZING`, which is less readable. `cycles_per_hour` would have been more naturally numeric, but knowing the *state* of an airlock is more safety-relevant than its cycle rate. The actual state string is preserved in metadata for the frontend.

---

## The Poller: why gather, why 5 seconds

> **Source — PDF §3.2:** 8 REST sensors, all polled independently.
> **Source — PDF §3.3:** *"Default publish interval: 5 seconds."*

Polling sequentially would stagger readings across sensors by accumulated network latency. `asyncio.gather` sends all 8 requests concurrently, producing a near-synchronous snapshot. 5 seconds mirrors the telemetry publish interval from the spec — it makes no sense to poll faster than the data changes.

---

## The StreamConsumer: why SSE

> **Source — PDF §3.3:**
> *"Streams can be consumed either via SSE (server sent events) or WebSocket."*
> `GET /api/telemetry/stream/{topic}` or `WS /api/telemetry/ws?topic={topic}`

The spec offers both. I chose SSE because it's a plain HTTP GET — `httpx` handles it natively with no additional protocol library. Reconnect logic is also simpler: if the connection drops, you just re-issue the GET request.

---

## The Kafka producer: why send_and_wait

> **Source — PDF §4 point 3:** *"Uses an event-driven architecture internally (message broker required)"*
> **Source — PDF §5.2:** Rules *"must be evaluated dynamically on event arrival"* and *"trigger an actuator state update when condition is met"*

If events are silently dropped, rules never fire. `send_and_wait` guarantees the broker has acknowledged the message before the producer moves on. The latency cost is negligible at a 5-second polling interval.
