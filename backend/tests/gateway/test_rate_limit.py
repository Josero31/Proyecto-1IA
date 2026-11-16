from fakeredis import FakeAsyncRedis

from agichat.gateway.rate_limit import RateLimiter


async def test_permite_hasta_el_limite_y_luego_bloquea() -> None:
    limiter = RateLimiter(FakeAsyncRedis(), max_messages=3)
    assert [await limiter.allow("s") for _ in range(4)] == [True, True, True, False]


async def test_el_limite_es_por_sesion() -> None:
    limiter = RateLimiter(FakeAsyncRedis(), max_messages=1)
    assert await limiter.allow("a")
    assert await limiter.allow("b")
    assert not await limiter.allow("a")


async def test_la_ventana_expira() -> None:
    redis = FakeAsyncRedis()
    await RateLimiter(redis, window_seconds=60).allow("s")
    assert 0 < await redis.ttl("ratelimit:s") <= 60
