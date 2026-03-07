# 2046467_LDD

A Mars base IoT monitoring system built as a pipeline of Docker services. Sensor data flows from a simulator through a message broker, gets processed and stored, and is exposed to a web dashboard.

## Architecture

The system is composed of five services orchestrated via Docker Compose:

- **simulator** — a pre-built `mars-iot-simulator` image that exposes REST endpoints and streaming telemetry topics for Mars base sensors and actuators (port 8081).
- **redpanda** — a Kafka-compatible message broker used to decouple ingestion from processing. A single topic (`normalized.sensor.events`) carries all sensor events.
- **ingestion-service** — a Python asyncio service that polls the simulator's REST endpoints and subscribes to its telemetry streams. All payloads are normalized into a unified `InternalEvent` schema before being published to Redpanda. Handles multiple raw schemas: scalar, chemistry, level, particulate, power, environment, thermal loop, and airlock.
- **processing-service** — a FastAPI application that consumes events from Redpanda, maintains an in-memory state cache of the latest reading per sensor, evaluates user-defined rules against incoming values, and triggers actuator commands on the simulator when rules fire. Exposes a REST API and a WebSocket endpoint for live updates (port 8001).
- **frontend** — a React/Vite single-page application served by nginx that displays live sensor readings, actuator controls, and a rule manager (port 3000).

## Prerequisites

- Docker and Docker Compose installed.
- The `mars-iot-simulator:multiarch_v1` image available locally. Pull or build it before starting.

## Getting started

**1. Make sure the simulator image is available:**

```bash
docker image inspect mars-iot-simulator:multiarch_v1
```

If it is not present, load or pull it according to the course instructions before proceeding.

**2. Start all services:**

```bash
docker compose up --build
```

The `--build` flag rebuilds the `ingestion-service`, `processing-service`, and `frontend` images from their local Dockerfiles. Omit it on subsequent runs if no code has changed.

**3. Wait for everything to be healthy.**

Docker Compose will start services in dependency order. Redpanda and the simulator have health checks; the other services wait for them. First startup may take a minute while images are pulled and topics are created.

**4. Open the dashboard:**

```
http://localhost:3000
```

**5. Access the processing service API directly (optional):**

```
http://localhost:8001/docs
```

The interactive Swagger UI lists all available REST endpoints (sensor state, actuators, rules).

## Stopping the project

```bash
docker compose down
```

To also remove the persistent volume used to store rules:

```bash
docker compose down -v
```

## Service ports summary

| Service            | Host port |
|--------------------|-----------|
| simulator          | 8081      |
| redpanda (Kafka)   | 19092     |
| processing-service | 8001      |
| frontend           | 3000      |
