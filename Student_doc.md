# SYSTEM DESCRIPTION:

The Mars Habitat Automation & Monitoring Platform is a distributed IoT system designed to keep a Mars habitat safe and operational. It ingests heterogeneous sensor data from a pre-built Mars IoT simulator, normalises all payloads into a unified internal event schema, evaluates automation rules in real time, and streams live readings to a web dashboard. Operators can monitor fifteen habitat sensors, manually toggle four actuators, and define custom IF-THEN automation rules — all from a single browser tab. A set of permanent safety rules is seeded into the database at startup and cannot be deleted, ensuring baseline life-support protocols survive any system crash or container restart.


# USER STORIES:

1) As a habitat operator, I want to monitor `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, and `corridor_pressure` in real-time on a single dashboard panel so I can ensure baseline life support is stable.

2) As a safety officer, I want to track particulate (`air_quality_pm25`) and chemical (`air_quality_voc`) levels so I can protect the crew from toxic inhalation and off-gassing.

3) As a habitat operator, I want to monitor the `water_tank_level` so I can anticipate shortages and schedule water reclamation before reserves run critically low.

4) As a mission engineer, I want to view a real-time line chart of the `thermal_loop` temperature and flow rate so I can detect cooling circuit failures before they overheat the habitat.

5) As a mission engineer, I want to monitor the `power_bus` and `power_consumption` streams so I can identify voltage irregularities and prevent rolling blackouts.

6) As a safety officer, I want to monitor airlock status and external radiation so I can ensure EVAs are safe and warn the crew during solar particle events.

7) As a habitat operator, I want a dashboard toggle to manually switch the `cooling_fan` ON/OFF so I can immediately reduce heat without waiting for automation rules to trigger.

8) As a habitat operator, I want a manual toggle for the `entrance_humidifier` so I can adjust moisture levels when the crew reports dry air discomfort.

9) As a safety officer, I want a manual toggle for `hall_ventilation` so I can quickly flush elevated CO₂ concentrations from the habitat.

10) As a habitat operator, I want a manual toggle for the `habitat_heater` so I can prevent the crew from freezing during extreme Martian temperature drops.

11) As a system administrator, I want a dashboard form to create new automation rules using the format `IF <sensor> <operator> <value> THEN set <actuator> to ON/OFF` so the system can manage devices automatically.

12) As a system administrator, I want to view a list of all persisted automation rules on the dashboard so I know exactly what logic is currently running on the habitat.

13) As a system administrator, I want to be able to delete a user-created rule from the dashboard so I can stop faulty automation logic during a hardware sensor failure.

14) As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature > 24°C THEN set cooling_fan to ON` so my crops survive heat spikes while I am asleep.

15) As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature < 22°C THEN set cooling_fan to OFF` so the fan does not waste power once the temperature normalizes.

16) As a safety officer, I want the system to automatically evaluate `IF co2_hall > 900ppm THEN set hall_ventilation to ON` to automatically protect the crew from asphyxiation.

17) As a safety officer, I want the system to automatically evaluate `IF co2_hall < 600ppm THEN set hall_ventilation to OFF` so we do not unnecessarily vent the internal atmosphere once levels are safe.

18) As a crew member, I want the system to automatically evaluate `IF thermal_loop < 25°C THEN set habitat_heater to ON` so the habitat is warmed automatically during a frigid Martian night.

19) As a habitat operator, I want the system to evaluate `IF entrance_humidity < 40% THEN set entrance_humidifier to ON` to prevent extreme dry air from cracking the entrance airlock seals.

20) As a mission engineer, I want the automation engine to load all saved rules from the database immediately after a container restart so the habitat does not lose its safety protocols during a system crash.


# CONTAINERS:

## CONTAINER_NAME: Simulator

### DESCRIPTION:
Pre-built Mars IoT simulator. Exposes REST sensor endpoints (polled by the ingestion service), SSE telemetry streams (subscribed by the ingestion service), and REST actuator endpoints (called by the processing service). The simulator is not modified.

### USER STORIES:
The Simulator is the physical data source enabling all monitoring user stories (1–6) and all actuator control user stories (7–10, 14–19).

### PORTS:
8081:8081

### PERSISTENCE EVALUATION:
The Simulator manages its own internal state. The platform does not persist simulator data.

### EXTERNAL SERVICES CONNECTIONS:
None.

### MICROSERVICES:

#### MICROSERVICE: mars-iot-simulator
- TYPE: external
- DESCRIPTION: Exposes 8 REST sensor endpoints, 7 SSE telemetry streams, and 4 REST actuator control endpoints. It is a pre-built image and is not modified.
- PORTS: 8081

- ENDPOINTS:

    | HTTP METHOD | URL | Description | User Stories |
    | ----------- | --- | ----------- | ------------ |
    | GET | /sensors/{sensor_id} | Returns the latest reading for a REST sensor | 1, 2, 3 |
    | GET | /telemetry/{topic} | SSE stream for a telemetry sensor | 4, 5, 6 |
    | GET | /actuators | Returns state of all actuators | 7, 8, 9, 10 |
    | POST | /actuators/{actuator_id} | Sets an actuator state ON or OFF | 7, 8, 9, 10, 14, 15, 16, 17, 18, 19 |


---

## CONTAINER_NAME: Redpanda

### DESCRIPTION:
Kafka-compatible message broker that decouples the ingestion service from the processing service. Receives normalised sensor events from the ingestion service and delivers them to the processing service consumer.

### USER STORIES:
20) As a mission engineer, I want the automation engine to load all saved rules immediately after a container restart so the habitat does not lose its safety protocols during a system crash.

### PORTS:
9092 (internal broker), 19092:19092 (external/host access)

### PERSISTENCE EVALUATION:
Redpanda persists topic data on disk. The `normalized.sensor.events` topic buffers events and allows the processing service to re-consume on restart within the retention window.

### EXTERNAL SERVICES CONNECTIONS:
None.

### MICROSERVICES:

#### MICROSERVICE: redpanda
- TYPE: message broker
- DESCRIPTION: Single-node Redpanda broker. Provides a Kafka-compatible API. Pinned to `v24.2.7` for reproducibility. Configured with an internal listener (`redpanda:9092`) for inter-service communication and an external listener (`localhost:19092`) for host debugging.
- PORTS: 9092 (internal), 19092 (external)

#### MICROSERVICE: redpanda-init
- TYPE: init job
- DESCRIPTION: One-shot container that runs after Redpanda is healthy. Creates the `normalized.sensor.events` topic using the `rpk` CLI. Exits with code 0 on success. All dependent services use `condition: service_completed_successfully` to wait for it.
- PORTS: none


---

## CONTAINER_NAME: Ingestion Service

### DESCRIPTION:
Collects raw sensor data from the simulator via both REST polling and SSE streaming. Normalises all heterogeneous payloads into a single `InternalEvent` schema and publishes them to the `normalized.sensor.events` Kafka topic on Redpanda.

### USER STORIES:
1) As a habitat operator, I want to monitor `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, and `corridor_pressure` in real-time.

2) As a safety officer, I want to track particulate (`air_quality_pm25`) and chemical (`air_quality_voc`) levels.

3) As a habitat operator, I want to monitor the `water_tank_level`.

4) As a mission engineer, I want to view real-time data from the `thermal_loop`.

5) As a mission engineer, I want to monitor `power_bus` and `power_consumption` streams.

6) As a safety officer, I want to monitor airlock status and external radiation.

### PORTS:
No port exposed externally. Communicates outbound only (to simulator and Redpanda).

### PERSISTENCE EVALUATION:
The Ingestion Service does not require persistent storage. It is stateless: events are published to Redpanda immediately and not retained locally.

### EXTERNAL SERVICES CONNECTIONS:
Connects to the Simulator (`http://simulator:8081`) for REST polling and SSE subscription.

### MICROSERVICES:

#### MICROSERVICE: ingestion-service
- TYPE: backend
- DESCRIPTION: Async Python service orchestrating three concurrent tasks: REST polling, SSE stream consumption, and Kafka publishing. On startup it launches all three tasks and manages graceful shutdown.
- PORTS: none
- TECHNOLOGICAL SPECIFICATION:
  The service is developed in Python 3.12 and uses the following libraries:
    - `httpx[http2]==0.27.0`: HTTP client for both REST polling and SSE stream consumption (supports streaming responses).
    - `aiokafka==0.11.0`: Async Kafka producer for publishing to Redpanda.

- SERVICE ARCHITECTURE:
  The service is organised into four modules:
    - `main.py` — entry point; creates the `KafkaProducer` instance, starts the `Poller` and `StreamConsumer` tasks concurrently with `asyncio.gather`, handles graceful shutdown.
    - `poller.py` — polls 8 REST sensor endpoints every 5 seconds. Maps each `sensor_id` to its raw schema family and calls the normalizer before publishing.
    - `stream_consumer.py` — subscribes to 7 SSE telemetry topics. Uses `httpx` streaming to consume events line by line. Reconnects automatically with a 3-second delay on disconnection.
    - `normalizer.py` — converts all raw payloads (8 schema families) into the unified `InternalEvent` schema before publishing.
    - `kafka_producer.py` — thin wrapper around `AIOKafkaProducer`. Publishes serialised JSON to the `normalized.sensor.events` topic.

- INTERNAL EVENT SCHEMA:

    All raw payloads are converted to the following unified structure before being published:

    ```json
    {
      "event_id":    "<uuid4>",
      "sensor_id":   "<string>",
      "source_type": "REST | TELEMETRY",
      "raw_schema":  "<string>",
      "timestamp":   "<ISO8601 UTC>",
      "value":       "<float>",
      "unit":        "<string>",
      "metadata":    "<object>"
    }
    ```

    | Field | Description |
    | ----- | ----------- |
    | `event_id` | UUID4 unique identifier for the event |
    | `sensor_id` | Sensor identifier as defined by the simulator |
    | `source_type` | `REST` for polled sensors, `TELEMETRY` for SSE streams |
    | `raw_schema` | Original schema family (e.g. `rest.scalar.v1`) — preserved for traceability |
    | `timestamp` | Measurement time in UTC, extracted from the raw payload |
    | `value` | Primary numeric measurement — always a `float` |
    | `unit` | Unit of `value` (e.g. `°C`, `%`, `ppm`, `kW`) |
    | `metadata` | All remaining fields from the original payload, preserved without modification |

- NORMALISATION RULES PER SCHEMA FAMILY:

    | Raw Schema | Sensors | `value` field | `unit` | `timestamp` key |
    | ---------- | ------- | ------------- | ------ | --------------- |
    | `rest.scalar.v1` | `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, `corridor_pressure` | `value` | from payload | `captured_at` |
    | `rest.chemistry.v1` | `hydroponic_ph`, `air_quality_voc` | `measurements[0].value` | `measurements[0].unit` | `captured_at` |
    | `rest.level.v1` | `water_tank_level` | `level_pct` | `"%"` (hardcoded) | `captured_at` |
    | `rest.particulate.v1` | `air_quality_pm25` | `pm25_ug_m3` | `"µg/m³"` (hardcoded) | `captured_at` |
    | `topic.power.v1` | `solar_array`, `power_bus`, `power_consumption` | `power_kw` | `"kW"` | `event_time` |
    | `topic.environment.v1` | `radiation`, `life_support` | `measurements[0].value` | `measurements[0].unit` | `event_time` |
    | `topic.thermal_loop.v1` | `thermal_loop` | `temperature_c` | `"°C"` (hardcoded) | `event_time` |
    | `topic.airlock.v1` | `airlock` | numeric encoding of `last_state` (IDLE=0, PRESSURIZING=1, DEPRESSURIZING=2) | `"state"` | `event_time` |


---

## CONTAINER_NAME: Processing Service

### DESCRIPTION:
Core service that ties the platform together. Consumes normalised sensor events from Redpanda, maintains an in-memory sensor state cache, evaluates automation rules against every incoming event, triggers actuators via HTTP when rules fire, broadcasts live events and alerts over WebSocket, and exposes a REST API for the frontend.

### USER STORIES:
1) As a habitat operator, I want to monitor `greenhouse_temperature`, `entrance_humidity`, `co2_hall`, and `corridor_pressure` in real-time.

2) As a safety officer, I want to track particulate and chemical air quality levels.

3) As a habitat operator, I want to monitor the `water_tank_level`.

4) As a mission engineer, I want to view real-time thermal loop data.

5) As a mission engineer, I want to monitor power grid streams.

6) As a safety officer, I want to monitor airlock status and external radiation.

7) As a habitat operator, I want a dashboard toggle to manually switch the `cooling_fan` ON/OFF.

8) As a habitat operator, I want a manual toggle for the `entrance_humidifier`.

9) As a safety officer, I want a manual toggle for `hall_ventilation`.

10) As a habitat operator, I want a manual toggle for the `habitat_heater`.

11) As a system administrator, I want a dashboard form to create new automation rules.

12) As a system administrator, I want to view a list of all persisted automation rules.

13) As a system administrator, I want to be able to delete a user-created rule.

14) As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature > 24°C THEN set cooling_fan to ON`.

15) As a botanist, I want the system to automatically evaluate `IF greenhouse_temperature < 22°C THEN set cooling_fan to OFF`.

16) As a safety officer, I want the system to automatically evaluate `IF co2_hall > 900ppm THEN set hall_ventilation to ON`.

17) As a safety officer, I want the system to automatically evaluate `IF co2_hall < 600ppm THEN set hall_ventilation to OFF`.

18) As a crew member, I want the system to automatically evaluate `IF thermal_loop < 25°C THEN set habitat_heater to ON`.

19) As a habitat operator, I want the system to evaluate `IF entrance_humidity < 40% THEN set entrance_humidifier to ON`.

20) As a mission engineer, I want the automation engine to load all saved rules immediately after a container restart.

### PORTS:
8001:8001

### PERSISTENCE EVALUATION:
The Processing Service requires persistent storage for automation rules and their fire history. Rules are stored in a SQLite database (`rules.db`) mounted on a named Docker volume (`processing-data`) at `/data/rules.db`. This ensures rules survive container restarts and volume-level persistence satisfies US-20. Sensor state is not persisted — it is held in memory and repopulates within seconds on restart as new events arrive.

### EXTERNAL SERVICES CONNECTIONS:
Connects to the Simulator (`http://simulator:8081/actuators/{id}`) to proxy actuator commands. Connects to Redpanda (`redpanda:9092`) as a Kafka consumer.

### MICROSERVICES:

#### MICROSERVICE: processing-service
- TYPE: backend
- DESCRIPTION: Async Python FastAPI application. Runs the Kafka consumer as a background asyncio task alongside the HTTP and WebSocket server. On every incoming sensor event: updates the state cache, evaluates rules, and broadcasts the event to all connected WebSocket clients.
- PORTS: 8001
- TECHNOLOGICAL SPECIFICATION:
  The service is developed in Python 3.12 and uses the following libraries:
    - `fastapi==0.115.0`: ASGI web framework for REST and WebSocket endpoints.
    - `uvicorn[standard]==0.30.6`: ASGI server.
    - `pydantic>=2.0,<3`: Request body validation with `Literal` types for operators and actions.
    - `aiokafka==0.11.0`: Async Kafka consumer.
    - `aiosqlite==0.20.0`: Async SQLite driver for rules persistence.
    - `httpx==0.27.0`: Async HTTP client for actuator proxy calls with a shared connection pool.

- SERVICE ARCHITECTURE:
  The service is organised into six modules:

    - `main.py` — FastAPI application with a `lifespan` context manager. On startup: initialises the SQLite database and seeds permanent rules, then spawns the Kafka consumer as a background `asyncio.Task`. On shutdown: cancels the consumer task and closes the shared `httpx.AsyncClient`. Exposes all REST and WebSocket endpoints. Uses Pydantic `Literal` types (`RuleCreate`, `ActuatorCommand`) for boundary validation.

    - `consumer.py` — Async Kafka consumer using `AIOKafkaConsumer`. Implements a retry loop (up to 10 attempts, 3-second backoff) on startup to handle the window between Docker health checks passing and the broker socket being ready. For each message: updates the state cache, evaluates rules, and broadcasts the event to WebSocket clients. Malformed messages are caught and logged without crashing the loop. Graceful shutdown via `asyncio.CancelledError` and a `finally` block that stops the consumer.

    - `state_cache.py` — In-memory cache: `dict[sensor_id → event]` protected by an `asyncio.Lock`. Provides `update()`, `get_all()` (shallow copy), and `get_one()`. All REST state requests are O(1) memory lookups with no database I/O.

    - `rules_engine.py` — Evaluates per-sensor rules on every incoming event. Loads applicable rules from SQLite via `get_rules_for_sensor`. Supports operators `<`, `<=`, `=`, `>=`, `>`. Guards non-numeric sensor values (e.g. airlock string states) with `try/except float()`. Implements a 30-second per-rule cooldown (`_last_fired` dict keyed by rule ID) to prevent actuator flooding when a threshold remains exceeded. Uses a module-level shared `httpx.AsyncClient` for actuator POSTs. On a rule match: sends the actuator command, writes a `rule_logs` entry, updates the cooldown timer, and broadcasts an alert over WebSocket.

    - `database.py` — Async SQLite layer via `aiosqlite`. Manages two tables: `rules` (automation rules) and `rule_logs` (audit log of rule fires). `init_db()` creates tables and guards `os.makedirs` against an empty directory path. `seed_permanent_rules()` inserts the 8 safety rules using `INSERT OR IGNORE` (idempotent). All queries use parameterised statements. `delete_rule()` checks `is_permanent` and returns a 403-triggering sentinel for protected rules.

    - `websocket_manager.py` — `ConnectionManager` maintaining a `set` of active WebSocket connections. `broadcast()` iterates all connections and catches exceptions from dead clients (browser tab closed abruptly), removing them from the set without interrupting the rest of the broadcast.

- ENDPOINTS:

    | HTTP METHOD | URL | Description | User Stories |
    | ----------- | --- | ----------- | ------------ |
    | GET | /api/state | Returns all cached sensor states as a dict | 1, 2, 3, 4, 5, 6 |
    | GET | /api/sensors/{sensor_id} | Returns the latest event for a single sensor (404 if not yet seen) | 1, 2, 3, 4, 5, 6 |
    | GET | /api/actuators | Proxies GET to simulator; returns all actuator states | 7, 8, 9, 10 |
    | POST | /api/actuators/{actuator_id} | Proxies POST to simulator; body: `{"state": "ON"\|"OFF"}` | 7, 8, 9, 10 |
    | GET | /api/rules | Returns all rules (permanent + custom) | 12 |
    | POST | /api/rules | Creates a new custom rule (Pydantic validated) | 11 |
    | DELETE | /api/rules/{rule_id} | Deletes a custom rule (404 if not found, 403 if permanent) | 13 |
    | GET | /api/rules/log | Returns recent rule fire history (last 50 entries) | 12 |
    | WS | /ws | Sends full state snapshot on connect; streams live sensor events and alerts | 1–6, 14–19 |

- DB STRUCTURE:

    **_rules_**: | **_id_** | sensor_id | operator | threshold | unit | actuator_id | action | is_permanent |

    **_rule_logs_**: | **_id_** | rule_id | sensor_id | sensor_value | actuator_id | action | fired_at |

- PERMANENT SAFETY RULES (seeded on startup, cannot be deleted):

    | Rule ID | Condition | Actuator | Action | User Story |
    | ------- | --------- | -------- | ------ | ---------- |
    | perm-us14 | `greenhouse_temperature > 24°C` | `cooling_fan` | ON | 14 |
    | perm-us15 | `greenhouse_temperature < 22°C` | `cooling_fan` | OFF | 15 |
    | perm-us16 | `co2_hall > 900 ppm` | `hall_ventilation` | ON | 16 |
    | perm-us17 | `co2_hall < 600 ppm` | `hall_ventilation` | OFF | 17 |
    | perm-us18 | `thermal_loop < 25°C` | `habitat_heater` | ON | 18 |
    | perm-us19 | `entrance_humidity < 40%` | `entrance_humidifier` | ON | 19 |
    | perm-hum-off | `entrance_humidity > 80%` | `entrance_humidifier` | OFF | — |
    | perm-pm25 | `air_quality_pm25 > 35 µg/m³` | `hall_ventilation` | ON | — |

#### MICROSERVICE: sqlite-db
- TYPE: database
- DESCRIPTION: SQLite database file (`rules.db`) stored on a named Docker volume (`processing-data`) mounted at `/data` inside the processing-service container. Persists automation rules and rule fire logs across restarts.
- PORTS: none (embedded, accessed directly by aiosqlite)


---

## CONTAINER_NAME: Frontend

### DESCRIPTION:
React single-page application served by Nginx. Provides the operator-facing dashboard: live sensor monitoring, manual actuator controls, automation rule management, and real-time alert notifications. Connects to the processing service via WebSocket for live data and via REST for state and rule operations.

### USER STORIES:
1) As a habitat operator, I want to monitor critical scalar sensors in real-time on a dashboard panel.

2) As a safety officer, I want to track air quality levels on the dashboard.

3) As a habitat operator, I want to monitor the water tank level on the dashboard.

4) As a mission engineer, I want to view real-time thermal loop charts.

5) As a mission engineer, I want to monitor power grid streams on the dashboard.

6) As a safety officer, I want to monitor airlock status and radiation on the dashboard.

7) As a habitat operator, I want a dashboard toggle to manually switch the `cooling_fan` ON/OFF.

8) As a habitat operator, I want a manual toggle for the `entrance_humidifier`.

9) As a safety officer, I want a manual toggle for `hall_ventilation`.

10) As a habitat operator, I want a manual toggle for the `habitat_heater`.

11) As a system administrator, I want a dashboard form to create new automation rules.

12) As a system administrator, I want to view a list of all persisted automation rules.

13) As a system administrator, I want to be able to delete a user-created rule from the dashboard.

### PORTS:
3000:3000

### PERSISTENCE EVALUATION:
The Frontend does not include a database. Sensor history (30-point rolling window per sensor) and alert log are kept in React component state and are cleared on page refresh.

### EXTERNAL SERVICES CONNECTIONS:
The Frontend does not connect to external services directly. All data flows through the processing service. `VITE_API_URL` and `VITE_WS_URL` are baked into the JS bundle at Docker build time as build arguments.

### MICROSERVICES:

#### MICROSERVICE: frontend
- TYPE: frontend
- DESCRIPTION: React 18 single-page application bundled by Vite 5 and served in production by Nginx. Nginx proxies `/api` and `/ws` requests to `processing-service:8001`, so the browser communicates with a single origin.
- PORTS: 3000
- TECHNOLOGICAL SPECIFICATION:
  The frontend is built with:
    - React 18 + Vite 5
    - Recharts (area charts for sensor history)
    - Custom CSS design system (1074-line `index.css` with CSS custom properties, light/dark themes, responsive layout)
    - Nginx (production serving + reverse proxy)

- SERVICE ARCHITECTURE:
  The service is organised as follows:

    - `useWebSocket.js` — Custom React hook managing the WebSocket connection to `/ws`. Maintains `sensorState` (latest reading per sensor), `sensorHistory` (30-point rolling window per sensor for charts), `alerts` (rule fire notifications), and `eventLog` (last 50 raw events). Auto-reconnects with a 3-second delay on disconnection. Receives a full state snapshot from the server on connect.

    - `App.jsx` — Main layout with 5 tabs: Overview, Sensors, Actuators, Rules, Alerts. Manages theme toggle (light/dark), do-not-disturb mode for toast notifications, and connection status badge.

    - `SensorWidget.jsx` — Displays a single sensor's current value, unit, source type (REST / TELEMETRY badge), and timestamp.

    - `SensorChart.jsx` — Area chart (Recharts) of the 30-point rolling sensor history. Theme-aware colours and gradient fill.

    - `ActuatorToggle.jsx` — Toggle switch for a single actuator. Polls `/api/actuators` every 3 seconds for current state and POSTs `{"state": "ON"|"OFF"}` on user toggle.

    - `RuleManager.jsx` — CRUD interface for automation rules. Displays permanent rules (locked, no delete button) and custom rules separately. Form accepts sensor ID, operator, threshold, unit (auto-filled), actuator ID, and action. Creates rules via `POST /api/rules`; deletes via `DELETE /api/rules/{rule_id}`.

    - `AlertPanel.jsx` — Displays rule fire history by merging in-session WebSocket alerts with persisted entries from `GET /api/rules/log?limit=50`.

    - `AlertToast.jsx` — Real-time toast notification system. Shows latest rule alerts in the top-right corner; auto-dismisses after 8 seconds. Maximum 5 visible simultaneously.

    - `EventLog.jsx` — Table showing the 20 most recent raw sensor events with source-type colour coding.

    - `Sidebar.jsx` — Collapsible navigation with brand section, monitoring/automation nav groups, and an alert count badge.

- PAGES:

    | Name | Description | Related Microservice | User Stories |
    | ---- | ----------- | -------------------- | ------------ |
    | Overview tab | KPI stat cards, connection status, active alert count | processing-service `/api/state`, `/ws` | 1–6 |
    | Sensors tab | REST sensor widgets + telemetry widgets + sensor history charts + event log | processing-service `/ws` | 1–6 |
    | Actuators tab | Four actuator toggle controls | processing-service `/api/actuators`, `/api/actuators/{id}` | 7, 8, 9, 10 |
    | Rules tab | Permanent safety rules list + custom rule builder + custom rules list | processing-service `/api/rules` | 11, 12, 13 |
    | Alerts tab | Historical alert panel (WebSocket + REST log) + real-time toast notifications | processing-service `/ws`, `/api/rules/log` | 14–19 |
