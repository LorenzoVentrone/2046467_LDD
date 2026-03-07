import json
import logging
from aiokafka import AIOKafkaProducer

logger = logging.getLogger(__name__)

TOPIC = "normalized.sensor.events"


class Producer:
    def __init__(self, broker: str):
        self._broker = broker
        self._producer: AIOKafkaProducer | None = None

    async def start(self):
        self._producer = AIOKafkaProducer(
            bootstrap_servers=self._broker,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await self._producer.start()
        logger.info("Kafka producer connected to %s", self._broker)

    async def stop(self):
        if self._producer:
            await self._producer.stop()

    async def send(self, event: dict):
        await self._producer.send_and_wait(TOPIC, event)
