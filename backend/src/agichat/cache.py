import json
import time
from datetime import UTC, datetime
from typing import Any, Protocol

from redis.asyncio import Redis


class Cache(Protocol):
    async def get_json(self, key: str) -> Any | None: ...

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None: ...

    async def incr_daily(self, key: str) -> int:
        """Incrementa y devuelve el contador del día (UTC) para ``key``."""
        ...


def _day_key(key: str) -> str:
    return f"{key}:{datetime.now(UTC).strftime('%Y-%m-%d')}"


class MemoryCache:
    """Caché de un solo proceso. Solo para desarrollo y tests: no se comparte entre réplicas."""

    def __init__(self) -> None:
        self._values: dict[str, tuple[float, Any]] = {}
        self._counters: dict[str, int] = {}

    async def get_json(self, key: str) -> Any | None:
        entry = self._values.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() >= expires_at:
            del self._values[key]
            return None
        return value

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._values[key] = (time.monotonic() + ttl_seconds, value)

    async def incr_daily(self, key: str) -> int:
        day_key = _day_key(key)
        self._counters[day_key] = self._counters.get(day_key, 0) + 1
        return self._counters[day_key]


class RedisCache:
    """Caché y contadores compartidos por todas las réplicas de un MCP server."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def get_json(self, key: str) -> Any | None:
        raw = await self._redis.get(key)
        return None if raw is None else json.loads(raw)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        await self._redis.set(key, json.dumps(value), ex=ttl_seconds)

    async def incr_daily(self, key: str) -> int:
        day_key = _day_key(key)
        count = int(await self._redis.incr(day_key))
        if count == 1:
            await self._redis.expire(day_key, 60 * 60 * 26)
        return count


def build_cache(redis_url: str | None) -> Cache:
    if redis_url:
        return RedisCache(Redis.from_url(redis_url))
    return MemoryCache()
