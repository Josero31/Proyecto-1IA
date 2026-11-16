import json
from typing import Any

from redis.asyncio import Redis

SESSION_TTL_SECONDS = 24 * 60 * 60


class RedisSessionStore:
    """Historial por sesión en Redis, para que cualquier réplica del gateway atienda a cualquier
    usuario."""

    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    async def load(self, session_id: str) -> list[dict[str, Any]]:
        raw = await self._redis.get(f"session:{session_id}")
        return [] if raw is None else json.loads(raw)

    async def save(self, session_id: str, messages: list[dict[str, Any]]) -> None:
        await self._redis.set(f"session:{session_id}", json.dumps(messages), ex=SESSION_TTL_SECONDS)
