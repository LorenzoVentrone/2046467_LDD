# Why I Built the Ingestion Layer This Way

*Plain language. Step by step. No assumed knowledge.*

---

## Step 1 — I read the assignment and found the first big problem

The professor gave us a simulator with sensors. My job was to read data from those sensors and pass it to the rest of the system.

Simple enough — until I read this in the PDF (§3.2 and §3.3):

> Some sensors only give you data **if you go and ask them** (REST).
> Other sensors just **keep talking on their own** (telemetry streams).

These are two completely different behaviors. You cannot handle them the same way.

**REST sensors** are like a vending machine. You press a button, you get something back. If you don't press, nothing happens.

**Telemetry sensors** are like a radio station. They broadcast continuously. You tune in, and data just starts flowing at you.

So I immediately knew I needed **two separate pieces of code**:
- One that periodically goes and asks the REST sensors for data → I called it `Poller`
- One that tunes in and listens to the streams → I called it `StreamConsumer`

Trying to do both in one piece of code would have been a mess. The professor also explicitly said (PDF §6): *"Separate ingestion, processing, and presentation"* and *"Tight coupling between services is strongly discouraged."* So keeping them separate was not just cleaner — it was required.

---

## Step 2 — I realized the data coming out of each sensor looks completely different

Once I started looking at the actual data each sensor produces (from SCHEMA_CONTRACT.md), I hit the second big problem.

Every sensor speaks a different "dialect". Here are some examples:

**A scalar sensor** (like greenhouse temperature) gives you this:
```json
{ "sensor_id": "greenhouse_temperature", "captured_at": "...", "value": 26.3, "unit": "°C", "status": "ok" }
```
Clean. One value, one unit.

**A chemistry sensor** (like air quality VOC) gives you this:
```json
{ "sensor_id": "air_quality_voc", "captured_at": "...", "measurements": [ {"metric": "VOC", "value": 0.4, "unit": "ppm"} ], "status": "ok" }
```
No `value` at the top level. The actual number is buried inside an array called `measurements`.

**A particulate sensor** (air quality PM2.5) gives you this:
```json
{ "sensor_id": "air_quality_pm25", "captured_at": "...", "pm1_ug_m3": 5.1, "pm25_ug_m3": 12.3, "pm10_ug_m3": 18.7, "status": "ok" }
```
Three different readings. No field literally called `value`. No `unit` field at all.

**A power telemetry topic** gives you this:
```json
{ "topic": "mars/telemetry/solar_array", "event_time": "...", "power_kw": 4.2, "voltage_v": 240.0, "current_a": 17.5, "cumulative_kwh": 102.3 }
```
Not only is the structure different — notice the timestamp is now called `event_time`, not `captured_at`. And there is no `status` field at all.

**The airlock sensor** gives you this:
```json
{ "topic": "mars/telemetry/airlock", "event_time": "...", "airlock_id": "main", "cycles_per_hour": 2.0, "last_state": "IDLE" }
```
The most "interesting" value here is `last_state` — but it's a word (IDLE, PRESSURIZING, DEPRESSURIZING), not a number. No `value` field, no `unit` field, no `status` field.

**The problem this creates:** The rules engine and the frontend would need to understand ALL of these different shapes. Every time a new reading arrives, they'd have to ask: *"wait, which sensor is this from? Does it have a `value` field or a `measurements` array or is it called `power_kw`?"*

That's a nightmare. It violates the principle the professor spelled out in PDF §4 point 2:

> *"Normalizes heterogeneous payloads into a standard internal event format. You need to define and document such a standard."*

And in §5.1:

> *"Convert incoming data into a unified internal event schema"*

And it's even listed as a baseline requirement in §7.3:

> *"Unified event schema"*

The professor says it three times in three different places. The message is clear: **pick one shape, convert everything into it, and never let the mess of the raw data leak downstream.**

---

## Step 3 — I designed the unified shape (InternalEvent)

I needed one shape that could represent ANY sensor reading, regardless of where it came from. I asked myself: what does every single sensor reading have in common?

Every reading has:
1. A sensor it came from
2. A moment in time when it was measured
3. **One number that represents the current state** — even if the raw data has multiple numbers, I need to pick the most important one
4. A unit for that number
5. Maybe some extra context

So I designed this:

```
event_id    → a unique ID for this event (just a UUID, so we can track it)
sensor_id   → which sensor (e.g. "greenhouse_temperature")
source_type → was this polled (REST) or streamed (TELEMETRY)?
raw_schema  → which original format did this come from? (kept for traceability)
timestamp   → when was this measured? (always ISO8601, always UTC)
value       → THE number (always a float)
unit        → the unit of that number (always a string)
metadata    → a bag for everything else from the original payload
```

The key insight: `value` is **always a float**. That's what lets the rules engine do `IF greenhouse_temperature > 28` without knowing anything about sensor formats. It just reads `event["value"]` and compares. Done.

If the frontend wants to display extra details (like all three PM readings, or the full airlock state name, or voltage and current), they're all preserved in `metadata`. Nothing is thrown away.

---

## Step 4 — For each sensor type, I had to decide: which number becomes `value`?

This is where I had to make judgment calls for each sensor family.

---

### Scalar sensors — easy

**Schema (SCHEMA_CONTRACT.md, `rest.scalar.v1`):**
```json
{ "value": 26.3, "unit": "°C", "captured_at": "..." }
```

There's already a field called `value` with a single number. Just use it. No decision to make. Timestamp is `captured_at`.

---

### Chemistry sensors — pick the first measurement

**Schema (SCHEMA_CONTRACT.md, `rest.chemistry.v1`):**
```json
{ "measurements": [ {"metric": "pH", "value": 6.8, "unit": "pH"} ], "captured_at": "..." }
```

No top-level `value`. The data is in an array. I pick `measurements[0]` — the first (and usually only) measurement — as the primary value. All measurements are saved in `metadata` so nothing is lost.

For `hydroponic_ph`: there's one measurement (pH). Easy.
For `air_quality_voc`: there might be multiple VOC compounds. I take the first one as the headline number. The rest are in metadata.

---

### Level sensor — percentage, not liters

**Schema (SCHEMA_CONTRACT.md, `rest.level.v1`):**
```json
{ "level_pct": 73.5, "level_liters": 1470.0, "captured_at": "..." }
```

Two candidates. I picked `level_pct` (percentage). Why?

Because the professor's automation rule example (PDF §5.2) looks like this:
```
IF greenhouse_temperature > 28 THEN set cooling_fan to ON
```

A threshold written as a percentage (`IF water_tank_level < 20`) works regardless of tank size. A threshold written in liters (`IF water_tank_level < 400`) would only make sense if you know the tank capacity. The percentage is universally meaningful.

Also: this schema has no `unit` field at all (check SCHEMA_CONTRACT.md — it's not there). So I hardcode the unit as `"%"`. That's the only sensible default.

---

### Particulate sensor — the sensor name tells you which value to pick

**Schema (SCHEMA_CONTRACT.md, `rest.particulate.v1`):**
```json
{ "pm1_ug_m3": 5.1, "pm25_ug_m3": 12.3, "pm10_ug_m3": 18.7, "captured_at": "..." }
```

Three numbers, none of them called `value`. But look at the sensor's name in the REST sensor table (PDF §3.2): `air_quality_pm25`. The name contains "pm25". The professor named it that deliberately — PM2.5 is the primary metric. Use `pm25_ug_m3`. Store all three in metadata.

No `unit` field in the schema, so hardcode `"µg/m³"`.

---

### Power telemetry — use power_kw, and notice the timestamp key changed

**Schema (SCHEMA_CONTRACT.md, `topic.power.v1`):**
```json
{ "power_kw": 4.2, "voltage_v": 240.0, "current_a": 17.5, "cumulative_kwh": 102.3, "event_time": "..." }
```

Four candidates. I picked `power_kw` because:
- It's the most actionable value for a rule (e.g. "if power consumption exceeds X, shed load")
- Voltage and current are diagnostic — useful for a chart, not for a threshold rule
- `cumulative_kwh` is a running total counter, not a current state reading

Important detail: the timestamp key here is `event_time`, not `captured_at`. This is exactly why every handler maps the timestamp explicitly rather than assuming a generic key. If I had written `payload["captured_at"]` in this handler, it would crash — because that field does not exist in this schema.

---

### Environment telemetry — same array problem as chemistry

**Schema (SCHEMA_CONTRACT.md, `topic.environment.v1`):**
```json
{
  "source": { "system": "life_support", "segment": "habitat" },
  "measurements": [ {"metric": "O2", "value": 20.9, "unit": "%"} ],
  "status": "ok",
  "event_time": "..."
}
```

Same `measurements[]` pattern as chemistry sensors. Same solution: take `measurements[0]` as primary value, preserve everything in metadata. Also flatten the `source` object into metadata as `source_system` and `source_segment` so the frontend can display the physical location without parsing a nested object.

---

### Thermal loop — temperature, not flow rate, and a user story confirms it

**Schema (SCHEMA_CONTRACT.md, `topic.thermal_loop.v1`):**
```json
{ "temperature_c": 18.5, "flow_l_min": 3.2, "loop": "primary", "status": "ok", "event_time": "..." }
```

Two candidates: temperature and flow rate.

I picked `temperature_c`. Then I checked the user stories (Users_Stories.md, US-18):

> *"IF thermal_loop < 10 THEN set habitat_heater to ON"*

That rule is written against temperature. Confirmed. `temperature_c` is the primary value. `flow_l_min` goes in metadata.

No `unit` field in the schema, so hardcode `"°C"`.

---

### Airlock — the hardest one: the value is a word, not a number

**Schema (SCHEMA_CONTRACT.md, `topic.airlock.v1`):**
```json
{ "airlock_id": "main", "cycles_per_hour": 2.0, "last_state": "IDLE", "event_time": "..." }
```

Two candidates: `cycles_per_hour` (a number) and `last_state` (a word: IDLE, PRESSURIZING, or DEPRESSURIZING).

Now look at what the rules engine needs to do (PDF §5.2):

> *"IF \<sensor_name\> \<operator\> \<value\>"*
> Supported operators: `<`, `<=`, `=`, `>=`, `>`

The rules engine compares numbers. You can't write `IF airlock > PRESSURIZING` — that makes no sense. You also can't write `IF airlock < IDLE`. Words are not comparable with greater-than and less-than.

So `last_state` can only be used with the `=` operator if encoded as a number. I made this mapping:

```
IDLE           → 0
PRESSURIZING   → 1
DEPRESSURIZING → 2
```

Now a rule like `IF airlock = 1` means "if the airlock is currently pressurizing". It works. It's not perfectly readable, but it's the only way to make a string enum compatible with a numeric rules engine.

`cycles_per_hour` is a float and would be more naturally numeric for rules, but the safety-relevant information about an airlock is its *state* — is it cycling? is it open? That's more important than how many cycles per hour. The actual state string is preserved in `metadata` for the frontend to display.

---

## Step 5 — Why poll all 8 sensors at the same time instead of one after another?

`asyncio.gather` sends all 8 HTTP requests simultaneously. They all go out at the same moment and come back when they're ready.

The alternative — polling one sensor, waiting for the response, then polling the next — would mean the last sensor gets polled almost a second after the first one (network latency adds up). You'd get a reading of greenhouse temperature from time T and a reading of corridor pressure from time T+0.8s. That's not a snapshot of the habitat — that's a smear across time.

Concurrent polling gives you as close to a simultaneous snapshot as possible.

Why 5 seconds? The spec says it (PDF §3.3): *"Default publish interval: 5 seconds."* There's no point polling faster than the data changes.

---

## Step 6 — Why SSE instead of WebSocket for the stream consumer?

The spec (PDF §3.3) says both are available. I chose SSE because it is just a regular HTTP GET request with the header `Accept: text/event-stream`. The `httpx` library I was already using handles it natively. No extra library, no handshake protocol, no frame parsing.

---

## Step 7 — Why use send_and_wait instead of just send?

The Kafka producer has two modes:
- **Fire and forget (`send`):** send the message and immediately move on. If it fails, you'll never know.
- **Wait for confirmation (`send_and_wait`):** don't move on until the broker says "I got it."

The professor required (PDF §5.2) that rules *"must be evaluated dynamically on event arrival"* and *"trigger an actuator state update when condition is met."* If events are silently dropped before reaching the broker, rules never fire. On Mars, a missed temperature rule could mean the greenhouse dies. `send_and_wait` guarantees delivery. The small latency cost is irrelevant at a 5-second polling interval.
