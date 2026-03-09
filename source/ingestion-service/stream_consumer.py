import asyncio
import json
import logging
import httpx
from normalizer import normalize
from kafka_producer import Producer

logger = logging.getLogger(__name__)

# topic path → (sensor_id, raw_schema)
TELEMETRY_TOPICS = {
    "mars/telemetry/solar_array":       ("solar_array",       "topic.power.v1"),
    "mars/telemetry/radiation":         ("radiation",         "topic.environment.v1"),
    "mars/telemetry/life_support":      ("life_support",      "topic.environment.v1"),
    "mars/telemetry/thermal_loop":      ("thermal_loop",      "topic.thermal_loop.v1"),
    "mars/telemetry/power_bus":         ("power_bus",         "topic.power.v1"),
    "mars/telemetry/power_consumption": ("power_consumption", "topic.power.v1"),
    "mars/telemetry/airlock":           ("airlock",           "topic.airlock.v1"),
}


class StreamConsumer:
    def __init__(self, simulator_url: str, producer: Producer):
        self._base = simulator_url.rstrip("/")
        self._producer = producer

    async def run(self):
        tasks = [
            self._subscribe(topic, sensor_id, raw_schema)
            for topic, (sensor_id, raw_schema) in TELEMETRY_TOPICS.items()
        ]
        await asyncio.gather(*tasks)

    async def _subscribe(self, topic: str, sensor_id: str, raw_schema: str):
        url = f"{self._base}/api/telemetry/stream/{topic}"
        logger.info("Subscribing to SSE topic %s", topic)
        while True:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", url,
                                             headers={"Accept": "text/event-stream"}) as resp:
                        resp.raise_for_status()
                        async for line in resp.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            raw = line[len("data:"):].strip()
                            if not raw:
                                continue
                            try:
                                payload = json.loads(raw)
                                event = normalize(sensor_id, "TELEMETRY", raw_schema, payload)
                                await self._producer.send(event)
                                logger.debug("Stream %s → %.2f %s",
                                             sensor_id, event["value"], event["unit"])
                            except Exception as exc:
                                logger.warning("Parse error on %s: %s", topic, exc)
            except Exception as exc:
                logger.warning("SSE stream %s disconnected (%s), reconnecting in 3s…", topic, exc)
                await asyncio.sleep(3)
