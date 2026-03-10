"""
PipelineLogger — collects and broadcasts structured pipeline log events.

Every entry:
    { type:"pipeline_log", service, message, level, timestamp }

Services:  SIMULATOR | INGESTION | KAFKA | PROCESSING | RULES | ACTUATOR | WEBSOCKET | FRONTEND
Levels:    INFO | SUCCESS | WARN | ERROR | DEBUG
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import WebSocket

_log = logging.getLogger(__name__)

_MAX_HISTORY = 500


class PipelineLogger:
    def __init__(self):
        self._history: list = []
        self._connections: set = set()   # set[WebSocket]

    # ── WebSocket client management ───────────────────────────────────────────

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.add(ws)
        _log.info("Log WS client connected — total: %d", len(self._connections))
        # Replay stored history so the client sees events that happened before it connected
        for entry in list(self._history):
            try:
                await ws.send_text(json.dumps(entry))
            except Exception:
                break

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.discard(ws)
        _log.info("Log WS client disconnected — total: %d", len(self._connections))

    # ── Public logging API ────────────────────────────────────────────────────

    async def log(
        self,
        service: str,
        message: str,
        level: str = "INFO",
    ) -> None:
        entry = {
            "type": "pipeline_log",
            "service": service.upper(),
            "message": message,
            "level": level.upper(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._history.append(entry)
        if len(self._history) > _MAX_HISTORY:
            self._history.pop(0)
        await self._broadcast(entry)

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _broadcast(self, entry: dict) -> None:
        if not self._connections:
            return
        text = json.dumps(entry)
        dead: set = set()
        for ws in self._connections:
            try:
                await ws.send_text(text)
            except Exception:
                dead.add(ws)
        self._connections -= dead


pipeline_logger = PipelineLogger()
