# Why I Built the Ingestion Layer This Way

*A student's chain of thought — written after the fact, but honest about how it actually happened.*

---

## The starting point: two very different kinds of devices

The first thing that hit me when I read the spec was that the simulator exposes sensors in two fundamentally different ways. Some devices answer when you ask them (REST). Others just talk when they have something to say (SSE streams). I couldn't treat them the same way.

For REST sensors, I needed to go and fetch the data on a schedule. For telemetry, I needed to sit and listen. So the first architectural decision was: **two separate components**, a `Poller` and a `StreamConsumer`, running concurrently. I didn't want them to know about each other — both just produce events and hand them off to whoever is listening downstream.

That "whoever" is Kafka. The decoupling felt natural: once I publish a normalized event, I'm done. The processing service can do whatever it wants with it and I don't need to care.

---

## The unified schema: why force everything into one shape

The hardest part wasn't the code — it was deciding what an event *is* in this system.

Every raw payload looks different. `rest.scalar.v1` gives you a flat `value` and `unit`. `rest.chemistry.v1` gives you an array of measurements. `rest.particulate.v1` gives you three separate PM readings with no primary. `topic.airlock.v1` gives you a state enum and a counter. None of them agree on field names, timestamp keys, or what "the value" even means.

I needed downstream consumers — the rules engine, the frontend — to not have to deal with any of that. So I designed the `InternalEvent` to answer one question per event: **what sensor, what value, what unit, when?**

```
event_id, sensor_id, source_type, raw_schema, timestamp, value, unit, metadata
```

`value` is always a `float`. `unit` is always a string. `timestamp` is always ISO8601. If you want the original fields, they're all in `metadata`. This way the rules engine can do `value > threshold` without knowing anything about how the sensor works.

---

## The normalizer: deciding what "the value" is

This is where most of the judgment calls happened.

**Scalar sensors** (`greenhouse_temperature`, `entrance_humidity`, etc.) were easy — the schema literally gives you a single `value` and `unit`. No decision needed.

**Chemistry sensors** (`hydroponic_ph`, `air_quality_voc`) give you a `measurements` array. I chose `measurements[0]` as the primary value. For `hydroponic_ph` this is fine — there's really only one thing being measured (pH). For `air_quality_voc` there might be multiple compounds, but since the rules engine operates on a single number, I had to pick one. I preserve the full array in metadata so the frontend can display everything.

**Level sensor** (`water_tank_level`) — the primary value is `level_pct` because percentage is universally comparable. `level_liters` depends on tank size and is less useful for rule thresholds. I put liters in metadata.

**Particulate** (`air_quality_pm25`) — the schema gives you PM1, PM2.5, and PM10. The sensor is named `air_quality_pm25`, so I made `pm25_ug_m3` the primary value. Easy call.

**Power topics** (`solar_array`, `power_bus`, `power_consumption`) — I used `power_kw` as the primary value. Power in kilowatts is the most immediately actionable metric. Voltage and current are in metadata for diagnostics.

**Environment topics** (`radiation`, `life_support`) — same `measurements[]` pattern as chemistry. Same solution: first measurement is primary, all are in metadata. The `source` object (system + segment) goes into metadata so the frontend can label things properly.

**Thermal loop** (`thermal_loop`) — straightforward: `temperature_c` is the value you want to write rules against. Flow rate (`flow_l_min`) is a diagnostic, goes in metadata. I also aliased it as `flow_rate_lpm` in metadata for display consistency.

**Airlock** (`airlock`) — this was the hardest one. The schema gives you `last_state` (an enum: IDLE, PRESSURIZING, DEPRESSURIZING) and `cycles_per_hour` (a number). The rules engine only understands numbers. I encoded the state as a numeric value: IDLE=0, PRESSURIZING=1, DEPRESSURIZING=2. The tradeoff is that rules like `IF airlock = 1` work but aren't immediately readable. In hindsight, `cycles_per_hour` might have been a more intuitive primary value for rules, but at the time I reasoned that knowing *what state the airlock is in* is more safety-critical than how many cycles it has done. The actual state string is preserved in metadata.

---

## The Poller: why gather, why 5 seconds

I poll all 8 sensors concurrently using `asyncio.gather`. Polling them sequentially would mean each sensor's reading is staggered by network latency — the 8th sensor gets polled almost a second after the 1st. With `gather`, all 8 requests go out simultaneously and I get a near-synchronous snapshot.

I wrapped each poll in individual try/except so that a single failing sensor (simulator down, timeout, 500 error) doesn't kill the whole polling loop. The error is logged as a warning and the next cycle continues normally.

5 seconds matches the simulator's default telemetry publish interval. It felt wrong to poll faster than the data changes.

---

## The StreamConsumer: why SSE, why the reconnect loop

I chose SSE over WebSocket for the stream consumer for one reason: it's a plain HTTP GET with `text/event-stream` content type. `httpx` handles it natively with `client.stream()` and `aiter_lines()`. No additional library needed, no handshake protocol to manage.

Each topic gets its own independent coroutine. If one stream disconnects, only that topic's goroutine retries — the others keep running. The reconnect delay is 3 seconds, enough to avoid hammering the server during a temporary hiccup.

Parsing is simple: skip lines that don't start with `data:`, strip the prefix, parse JSON. SSE spec says comments start with `:` and blank lines are heartbeats — I silently skip both.

---

## The Kafka producer: why send_and_wait

I used `send_and_wait` instead of fire-and-forget `send`. Fire-and-forget is faster but means events can be silently dropped if the broker is under load or has a buffer full. For sensor data where a missed event might mean a missed rule trigger, I preferred the guarantee. The latency cost is negligible given the 5-second polling interval.

---

## What I'd do differently

The airlock primary value encoding (state-as-number) is the one decision I'm least sure about. It works, but a future version might expose a secondary sensor-level endpoint that lets the rules engine match on string values, so you could write `IF airlock_state = PRESSURIZING`. For now, the numeric encoding is a pragmatic compromise.

I'd also consider a dead-letter queue or local buffer for events that fail to publish to Kafka. Currently, if the broker is temporarily unavailable, those events are lost. For a Mars habitat automation system, that's a real gap — though outside the scope of this assignment.
