import asyncio

_cache: dict[str, dict] = {}
_lock = asyncio.Lock()


async def update(event: dict):
    async with _lock:
        _cache[event["sensor_id"]] = event


async def get_all() -> dict[str, dict]:
    async with _lock:
        return dict(_cache)


async def get_one(sensor_id: str) -> dict | None:
    async with _lock:
        return _cache.get(sensor_id)
