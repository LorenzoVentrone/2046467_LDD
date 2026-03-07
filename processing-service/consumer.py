import asyncio
import json
import logging
import os

from aiokafka import AIOKafkaConsumer

import state_cache
import rules_engine
from websocket_manager import manager

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
    try:
        async for msg in consumer:
            try:
                event = msg.value
                await state_cache.update(event)
                await rules_engine.evaluate(event)
                await manager.broadcast(event)
            except (KeyError, TypeError) as exc:
                logger.warning("Malformed event, skipping: %s — %s", msg.value, exc)
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()
