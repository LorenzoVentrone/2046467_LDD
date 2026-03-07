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


async def consume_loop():
    consumer = AIOKafkaConsumer(
        TOPIC,
        bootstrap_servers=KAFKA_BROKER,
        group_id="mars-processing",
        value_deserializer=lambda v: json.loads(v.decode()),
        auto_offset_reset="latest",
    )
    await consumer.start()
    logger.info("Consumer started on topic '%s'", TOPIC)
    try:
        async for msg in consumer:
            event = msg.value
            await state_cache.update(event)
            await rules_engine.evaluate(event)
            await manager.broadcast(event)
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()
