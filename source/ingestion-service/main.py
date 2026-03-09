import asyncio
import logging
import os

from kafka_producer import Producer
from poller import Poller
from stream_consumer import StreamConsumer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

SIMULATOR_URL = os.getenv("SIMULATOR_URL", "http://localhost:8080")
KAFKA_BROKER   = os.getenv("KAFKA_BROKER",   "localhost:9092")
POLL_INTERVAL  = int(os.getenv("POLL_INTERVAL", "5"))


async def main():
    producer = Producer(KAFKA_BROKER)
    await producer.start()

    poller  = Poller(SIMULATOR_URL, producer, POLL_INTERVAL)
    streams = StreamConsumer(SIMULATOR_URL, producer)

    logger.info("Ingestion service starting — simulator=%s broker=%s",
                SIMULATOR_URL, KAFKA_BROKER)
    try:
        await asyncio.gather(poller.run(), streams.run())
    finally:
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
