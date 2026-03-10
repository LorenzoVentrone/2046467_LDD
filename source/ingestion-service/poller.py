import asyncio
import logging
import httpx
from normalizer import normalize
from kafka_producer import Producer
from log_reporter import log_reporter

logger = logging.getLogger(__name__)

# sensor_id → raw_schema family
REST_SENSORS = {
    "greenhouse_temperature": "rest.scalar.v1",
    "entrance_humidity":      "rest.scalar.v1",
    "co2_hall":               "rest.scalar.v1",
    "corridor_pressure":      "rest.scalar.v1",
    "water_tank_level":       "rest.level.v1",
    "hydroponic_ph":          "rest.chemistry.v1",
    "air_quality_pm25":       "rest.particulate.v1",
    "air_quality_voc":        "rest.chemistry.v1",
}


class Poller:
    def __init__(self, simulator_url: str, producer: Producer, interval: int = 5):
        self._base = simulator_url.rstrip("/")
        self._producer = producer
        self._interval = interval

    async def run(self):
        async with httpx.AsyncClient(timeout=10) as client:
            logger.info("Poller started — polling %d sensors every %ds",
                        len(REST_SENSORS), self._interval)
            log_reporter.log(
                "INGESTION",
                f"→ Poller started — {len(REST_SENSORS)} REST sensors, interval={self._interval}s",
                "SUCCESS",
            )
            while True:
                log_reporter.log(
                    "INGESTION",
                    f"→ Poll cycle: querying {len(REST_SENSORS)} REST endpoints on simulator",
                )
                tasks = [
                    self._poll_one(client, sensor_id, schema)
                    for sensor_id, schema in REST_SENSORS.items()
                ]
                await asyncio.gather(*tasks, return_exceptions=True)
                await asyncio.sleep(self._interval)

    async def _poll_one(self, client: httpx.AsyncClient, sensor_id: str, raw_schema: str):
        url = f"{self._base}/api/sensors/{sensor_id}"
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            payload = resp.json()
            event = normalize(sensor_id, "REST", raw_schema, payload)

            # ── Pipeline logs ─────────────────────────────────────────────────
            log_reporter.log(
                "INGESTION",
                f"← {sensor_id} = {event['value']:.2f} {event['unit']}  (REST)",
            )
            log_reporter.log(
                "KAFKA",
                f"→ Publishing to normalized.sensor.events: {sensor_id}",
            )

            await self._producer.send(event)
            logger.debug("Polled %s → %.2f %s", sensor_id, event["value"], event["unit"])
        except Exception as exc:
            log_reporter.log(
                "INGESTION",
                f"✖ Failed to poll {sensor_id}: {exc}",
                "ERROR",
            )
            logger.warning("Failed to poll %s: %s", sensor_id, exc)
