import fakeredis
import pytest

from agichat.cache import MemoryCache, RedisCache, build_cache


@pytest.fixture(params=["memory", "redis"])
def cache(request: pytest.FixtureRequest) -> MemoryCache | RedisCache:
    if request.param == "memory":
        return MemoryCache()
    return RedisCache(fakeredis.FakeAsyncRedis())


async def test_guarda_y_lee_json(cache: MemoryCache | RedisCache) -> None:
    assert await cache.get_json("k") is None
    await cache.set_json("k", {"a": [1, 2]}, ttl_seconds=60)
    assert await cache.get_json("k") == {"a": [1, 2]}


async def test_contador_diario_incrementa(cache: MemoryCache | RedisCache) -> None:
    assert await cache.incr_daily("cuota") == 1
    assert await cache.incr_daily("cuota") == 2
    assert await cache.incr_daily("otra") == 1


async def test_memoria_expira_por_ttl(monkeypatch: pytest.MonkeyPatch) -> None:
    now = [1000.0]
    monkeypatch.setattr("agichat.cache.time.monotonic", lambda: now[0])
    cache = MemoryCache()
    await cache.set_json("k", 1, ttl_seconds=10)
    now[0] += 11
    assert await cache.get_json("k") is None


async def test_redis_pone_expiracion_al_contador() -> None:
    redis = fakeredis.FakeAsyncRedis()
    await RedisCache(redis).incr_daily("cuota")
    keys = await redis.keys("cuota:*")
    assert len(keys) == 1
    assert await redis.ttl(keys[0]) > 0


def test_build_cache_elige_backend() -> None:
    assert isinstance(build_cache(None), MemoryCache)
    assert isinstance(build_cache("redis://localhost:6379/0"), RedisCache)
