from redis.asyncio import Redis

MAX_MESSAGES = 20
WINDOW_SECONDS = 60


class RateLimiter:
    """Límite por sesión compartido entre réplicas (INCR + EXPIRE)."""

    def __init__(
        self, redis: Redis, max_messages: int = MAX_MESSAGES, window_seconds: int = WINDOW_SECONDS
    ) -> None:
        self._redis = redis
        self._max = max_messages
        self._window = window_seconds

    async def allow(self, session_id: str) -> bool:
        key = f"ratelimit:{session_id}"
        count = await self._redis.incr(key)
        if count == 1:
            await self._redis.expire(key, self._window)
        return count <= self._max
