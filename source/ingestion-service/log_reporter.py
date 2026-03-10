"""
LogReporter — sends structured pipeline log events to the processing-service.

Design:
  - Fire-and-forget: failures are silently swallowed so the main polling loop
    is never blocked or interrupted by logging failures.
  - Each call to .log() schedules an asyncio task; it is safe to call from
    any coroutine.
"""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

PROCESSING_URL = os.getenv("PROCESSING_SERVICE_URL", "http://localhost:8001")


class LogReporter:
    def __init__(self, processing_url: str = PROCESSING_URL):
        self._url = processing_url.rstrip("/") + "/api/pipeline-log"
        self._client: httpx.AsyncClient | None = None

    async def start(self) -> None:
        self._client = httpx.AsyncClient(timeout=2)
        logger.info("LogReporter ready — target: %s", self._url)

    async def stop(self) -> None:
        if self._client:
            await self._client.aclose()

    def log(self, service: str, message: str, level: str = "INFO") -> None:
        """Non-blocking fire-and-forget.  Safe to call from any coroutine."""
        asyncio.create_task(self._send(service, message, level))

    async def _send(self, service: str, message: str, level: str) -> None:
        if not self._client:
            return
        try:
            await self._client.post(
                self._url,
                json={"service": service, "message": message, "level": level},
            )
        except Exception:
            pass   # Never let logging failures surface to the caller


log_reporter = LogReporter()
