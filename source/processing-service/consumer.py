import asyncio
import json
import logging
import os

from aiokafka import AIOKafkaConsumer

import state_cache
import rules_engine
from websocket_manager import manager
from pipeline_logger import pipeline_logger

logger = logging.getLogger(__name__)

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
TOPIC = "normalized.sensor.events"

_MAX_RETRIES = 10
_RETRY_DELAY = 3  # seconds


async def consume_loop():
    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        group_id="mars-processing",
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="latest",
    )

    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            await consumer.start()
            break
        except Exception as exc:
            if attempt == _MAX_RETRIES:
                logger.error("Consumer failed to start after %d attempts: %s", _MAX_RETRIES, exc)
                raise
            logger.warning(
                "Consumer start attempt %d/%d failed: %s — retrying in %ds",
                attempt, _MAX_RETRIES, exc, _RETRY_DELAY,
            )
            await asyncio.sleep(_RETRY_DELAY)

    logger.info("Consumer started on topic '%s'", TOPIC)
    await pipeline_logger.log("PROCESSING", f"← Kafka consumer ready on '{TOPIC}'", "SUCCESS")

    try:
        async for msg in consumer:
            try:
                event     = msg.value
                sensor_id = event.get("sensor_id", "unknown")
                value     = event.get("value")
                unit      = event.get("unit", "")

                # ── Pipeline: received from Kafka ─────────────────────────────
                await pipeline_logger.log(
                    "PROCESSING",
                    f"← Kafka msg: {sensor_id} = {float(value):.2f} {unit}",
                )

                await state_cache.update(event)

                # ── Evaluate automation rules ─────────────────────────────────
                try:
                    alerts = await rules_engine.evaluate(event)
                except Exception as exc:
                    logger.error("Rule evaluation failed for event %s: %s", sensor_id, exc)
                    alerts = []

                # ── Broadcast sensor event to all connected dashboards ─────────
                await manager.broadcast(event)

                # ── Broadcast each alert and log it ───────────────────────────
                for alert in alerts:
                    await manager.broadcast(alert)
                    await pipeline_logger.log(
                        "WEBSOCKET",
                        f"→ Alert broadcast: {alert['sensor_id']} {alert['operator']} "
                        f"{alert['threshold']} → {alert['actuator_id']} {alert['action']}",
                        "WARN",
                    )
                    logger.info(
                        "Alert broadcast: IF %s %s %s THEN %s → %s (value=%.2f)",
                        alert["sensor_id"], alert["operator"], alert["threshold"],
                        alert["actuator_id"], alert["action"], alert["sensor_value"],
                    )

            except (KeyError, TypeError) as exc:
                logger.warning("Malformed event, skipping: %s — %s", msg.value, exc)
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()
