# Mars Habitat Automation & Monitoring Platform

A distributed IoT automation platform for monitoring and controlling a Mars habitat in real-time. Built for the Sapienza University *Laboratory of Advanced Programming 2025/2026* hackathon.

---

## Overview

The system ingests heterogeneous sensor data from a Mars habitat simulator, normalises it into a unified event schema, evaluates automation rules, and streams live readings to a web dashboard. Operators can monitor all habitat sensors, manually control actuators, and define (or inspect) automation rules — all from a single browser tab.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    mars-iot-simulator :8080              │
│  REST sensors (poll)          SSE telemetry (stream)    │
└────────────┬──────────────────────────┬─────────────────┘
             │                          │
             ▼                          ▼
    ┌─────────────────────────────────────────┐
    │           ingestion-service             │
    │  • polls 8 REST sensors every 5 s       │
    │  • subscribes to 7 SSE telemetry topics │
    │  • normalises all payloads              │
    └─────────────────┬───────────────────────┘
                      │  Kafka topic: normalized.sensor.events
                      ▼
          ┌───────────────────────┐
          │  Redpanda (Kafka) :9092│
          └─────────┬─────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │         processing-service :8001      │
    │  • consumes Kafka events              │
    │  • updates in-memory sensor cache     │
    │  • evaluates automation rules (SQLite)│
    │  • triggers actuators via HTTP        │
    │  • broadcasts to WebSocket clients    │
    │  • exposes REST API                   │
    └──────────┬────────────────────────────┘
               │  WebSocket /ws + REST /api/*
               ▼
    ┌──────────────────────────┐
    │     frontend :3000       │
    │  React single-page app   │
    │  Nginx (production)      │
    └──────────────────────────┘
```

In **development** Vite proxies `/api` and `/ws` to `localhost:8001`.  
In **production** Nginx proxies them to `processing-service:8001`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12 + FastAPI (async) |
| Message broker | Redpanda (Kafka-compatible) |
| Database | SQLite via aiosqlite |
| Frontend | React 18 + Vite 5 |
| Container | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- Docker and Docker Compose (v2+)
- The simulator image `mars-iot-simulator:multiarch_v1` loaded locally

```bash
# Load the simulator image (one-time)
docker load -i mars-iot-simulator-oci.tar

# Start everything
docker compose up --build

# Dashboard is available at
open http://localhost:3000
```

`docker compose up` starts all six services in the correct order using healthchecks:

1. `simulator` — IoT device simulator on port 8081
2. `redpanda` — Kafka-compatible message broker
3. `redpanda-init` — creates the `normalized.sensor.events` topic
4. `ingestion-service` — polls/streams sensors, publishes to Kafka
5. `processing-service` — consumes Kafka, evaluates rules, serves API on port 8001
6. `frontend` — React app served via Nginx on port 3000

### Development (frontend hot-reload)

```bash
# Start backend services only
docker compose up simulator redpanda redpanda-init ingestion-service processing-service

# Run frontend locally
cd frontend
npm install
npm run dev   # http://localhost:5173
```

---

## Services

### ingestion-service

Responsible for collecting raw sensor data and publishing normalised events to Kafka.

**REST polling** (`poller.py`): polls 8 sensors every 5 seconds via HTTP GET.  
**SSE streaming** (`stream_consumer.py`): subscribes to 7 telemetry topics as server-sent events.  
**Normalisation** (`normalizer.py`): converts 7 raw schema families into a single unified internal event:

```json
{
  "event_id": "uuid",
  "sensor_id": "greenhouse_temperature",
  "source_type": "REST",
  "raw_schema": "rest.scalar.v1",
  "timestamp": "2036-03-05T10:00:00Z",
  "value": 27.3,
  "unit": "°C",
  "metadata": {}
}
```

### processing-service

Core service that ties everything together.

- **Kafka consumer**: reads `normalized.sensor.events`, updates in-memory state cache, evaluates rules, broadcasts events
- **State cache**: `dict[sensor_id → latest_event]` protected by `asyncio.Lock`
- **Rules engine**: evaluates IF-THEN rules against incoming events; fires actuator POST calls and broadcasts `type: "alert"` events over WebSocket when a rule triggers
- **SQLite persistence**: all automation rules survive service restarts; permanent safety rules are seeded on startup
- **REST API**: see [API Reference](#api-reference)
- **WebSocket**: streams every new sensor event and rule-fire alerts to connected clients

### frontend

Single-page React application served by Nginx.

Sections:
- **Automation Alerts** — real-time log of triggered rules (in-session, via WebSocket)
- **REST Sensors** — 8 sensor cards updated via WebSocket
- **Telemetry Streams** — 7 telemetry sensor cards updated via WebSocket
- **Actuators** — 4 manual toggle controls
- **Automation Rules** — safety rules (permanent) + custom rule builder

---

## Sensors

### REST Sensors (polled every 5 s)

| Sensor ID | Description | Unit |
|---|---|---|
| `greenhouse_temperature` | Greenhouse air temperature | °C |
| `entrance_humidity` | Entrance airlock humidity | % |
| `co2_hall` | Hall CO₂ concentration | ppm |
| `corridor_pressure` | Corridor atmospheric pressure | Pa |
| `water_tank_level` | Water reservoir level | % / L |
| `hydroponic_ph` | Hydroponic solution pH | pH |
| `air_quality_pm25` | Particulate matter PM2.5 | μg/m³ |
| `air_quality_voc` | Volatile organic compounds | ppb |

### Telemetry Streams (SSE, continuous)

| Sensor ID | Topic | Description | Unit |
|---|---|---|---|
| `solar_array` | `mars/telemetry/solar_array` | Solar panel output | kW |
| `power_bus` | `mars/telemetry/power_bus` | Main power bus | kW |
| `power_consumption` | `mars/telemetry/power_consumption` | Habitat power draw | kW |
| `radiation` | `mars/telemetry/radiation` | External radiation | μSv/h |
| `life_support` | `mars/telemetry/life_support` | Life support metrics | mixed |
| `thermal_loop` | `mars/telemetry/thermal_loop` | Cooling loop temperature | °C |
| `airlock` | `mars/telemetry/airlock` | Airlock state | IDLE / PRESSURIZING / DEPRESSURIZING |

---

## Actuators

| Actuator ID | Function |
|---|---|
| `cooling_fan` | Greenhouse temperature regulation |
| `entrance_humidifier` | Habitat moisture control |
| `hall_ventilation` | CO₂ and air quality flush |
| `habitat_heater` | Thermal survivability |

Toggle any actuator manually from the dashboard, or let automation rules control them.

---

## Automation Rules

Rules follow the IF-THEN pattern:

```
IF <sensor_id> <operator> <threshold> [unit]
THEN set <actuator_id> to ON | OFF
```

Supported operators: `<`, `<=`, `=`, `>=`, `>`

### Safety Rules (permanent)

These rules are seeded into the database on every startup and **cannot be deleted**. They implement the baseline safety protocols from the project user stories:

| # | Condition | Action | Rationale |
|---|---|---|---|
| US14 | `greenhouse_temperature > 28 °C` | `cooling_fan ON` | Prevent crop heat damage |
| US15 | `greenhouse_temperature < 24 °C` | `cooling_fan OFF` | Stop unnecessary power draw |
| US16 | `co2_hall > 1000 ppm` | `hall_ventilation ON` | Emergency CO₂ venting |
| US17 | `co2_hall < 600 ppm` | `hall_ventilation OFF` | Stop atmosphere loss |
| US18 | `thermal_loop < 10 °C` | `habitat_heater ON` | Prevent freezing during Martian night |
| US19 | `entrance_humidity < 30 %` | `entrance_humidifier ON` | Protect airlock seals |
| + | `entrance_humidity > 80 %` | `entrance_humidifier OFF` | Prevent over-humidification |
| + | `air_quality_pm25 > 35 μg/m³` | `hall_ventilation ON` | Particulate safety threshold |

### Custom Rules

Any operator can define additional rules via the dashboard form. Custom rules can be deleted at any time. They are persisted in SQLite and survive service restarts (US20).

---

## API Reference

All endpoints are served by `processing-service` at `:8001` (proxied through Nginx at `:3000/api`).

### Sensor State

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/state` | All cached sensor states |
| `GET` | `/api/sensors/{sensor_id}` | Latest event for one sensor |

### Actuators

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/actuators` | — | All actuator states |
| `POST` | `/api/actuators/{actuator_id}` | `{"state": "ON"\|"OFF"}` | Set actuator state |

### Rules

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/rules` | — | All rules (permanent + custom) |
| `POST` | `/api/rules` | rule object | Create custom rule |
| `DELETE` | `/api/rules/{rule_id}` | — | Delete custom rule (403 for permanent) |

**Rule object:**
```json
{
  "sensor_id": "greenhouse_temperature",
  "operator": ">",
  "threshold": 28.0,
  "unit": "°C",
  "actuator_id": "cooling_fan",
  "action": "ON"
}
```

**Rule response** includes additional fields:
```json
{
  "id": "uuid",
  "permanent": false,
  ...
}
```

### WebSocket

| Protocol | Path | Description |
|---|---|---|
| `WS` | `/ws` | Real-time event stream |

On connect, the server sends a snapshot of all current sensor states. Subsequent messages are either:

- **Sensor event** — any object with `sensor_id`
- **Alert event** — `{"type": "alert", "rule_id": ..., "sensor_id": ..., "operator": ..., "threshold": ..., "actuator_id": ..., "action": ..., "value": ..., "timestamp": ...}`

---

## Project Structure

```
.
├── docker-compose.yml
├── README.md
├── ingestion-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py
│   ├── poller.py           # REST sensor polling
│   ├── stream_consumer.py  # SSE telemetry consumption
│   ├── normalizer.py       # Schema normalisation
│   └── kafka_producer.py   # Kafka publish
├── processing-service/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py             # FastAPI app, endpoints
│   ├── consumer.py         # Kafka consumer loop
│   ├── rules_engine.py     # Rule evaluation, alert broadcast
│   ├── database.py         # SQLite CRUD, permanent rule seeding
│   ├── state_cache.py      # In-memory sensor state
│   └── websocket_manager.py# WebSocket broadcast manager
└── frontend/
    ├── Dockerfile
    ├── nginx.conf          # Production proxy config
    ├── vite.config.js      # Dev proxy config
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── SensorWidget.jsx    # Live sensor value card
        │   ├── ActuatorToggle.jsx  # ON/OFF actuator control
        │   ├── RuleManager.jsx     # Rule creation & display
        │   └── AlertPanel.jsx      # Real-time alert log
        └── hooks/
            └── useWebSocket.js     # WS hook: sensor state + alerts
```

---

## Environment Variables

### ingestion-service
| Variable | Default | Description |
|---|---|---|
| `SIMULATOR_URL` | `http://localhost:8080` | Simulator base URL |
| `KAFKA_BROKER` | `localhost:9092` | Kafka broker address |
| `POLL_INTERVAL` | `5` | REST polling interval (seconds) |

### processing-service
| Variable | Default | Description |
|---|---|---|
| `SIMULATOR_URL` | `http://localhost:8080` | Simulator base URL |
| `KAFKA_BROKER` | `localhost:9092` | Kafka broker address |
| `DB_PATH` | `/data/rules.db` | SQLite database path |

### frontend
| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8001` | Processing service URL |
| `VITE_WS_URL` | `ws://localhost:8001` | WebSocket URL |

---

## Persistence

- **Sensor data**: not persisted — in-memory cache only (latest value per sensor)
- **Automation rules**: persisted in SQLite at `DB_PATH` (survives restarts)
- **Alert log**: in-session memory only — cleared on page refresh

---

## Notes

- Authentication is not required (single-tenant system)
- The simulator container must not be modified
- Permanent safety rules survive even if the `rules.db` volume is wiped — they are re-seeded on next startup
- The `permanent` flag on a rule cannot be set via the API; only internal seeding sets it
