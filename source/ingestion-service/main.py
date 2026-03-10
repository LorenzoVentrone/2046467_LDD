import asyncio
import logging
import os

from kafka_producer import Producer
from poller import Poller
from stream_consumer import StreamConsumer
from log_reporter import log_reporter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

SIMULATOR_URL        = os.getenv("SIMULATOR_URL",        "http://localhost:8080")
KAFKA_BROKER         = os.getenv("KAFKA_BROKER",         "localhost:9092")
POLL_INTERVAL        = int(os.getenv("POLL_INTERVAL",    "5"))
PROCESSING_SERVICE_URL = os.getenv("PROCESSING_SERVICE_URL", "http://localhost:8001")


async def main():
    # Start log reporter first so subsequent .log() calls are queued properly
    log_reporter._url = PROCESSING_SERVICE_URL.rstrip("/") + "/api/pipeline-log"
    await log_reporter.start()

    producer = Producer(KAFKA_BROKER)
    await producer.start()

    log_reporter.log(
        "INGESTION",
        f"→ Ingestion service started — simulator={SIMULATOR_URL}  broker={KAFKA_BROKER}",
        "SUCCESS",
    )
    log_reporter.log("KAFKA", f"→ Producer connected to {KAFKA_BROKER}", "SUCCESS")

    poller  = Poller(SIMULATOR_URL, producer, POLL_INTERVAL)
    streams = StreamConsumer(SIMULATOR_URL, producer)

    logger.info("Ingestion service starting — simulator=%s broker=%s",
                SIMULATOR_URL, KAFKA_BROKER)
    try:
        await asyncio.gather(poller.run(), streams.run())
    finally:
        await log_reporter.stop()
        await producer.stop()


if __name__ == "__main__":
    asyncio.run(main())
