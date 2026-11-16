from fakeredis import FakeAsyncRedis

from agichat.gateway.sessions import SESSION_TTL_SECONDS, RedisSessionStore


async def test_guarda_y_recupera_el_historial() -> None:
    store = RedisSessionStore(FakeAsyncRedis())
    messages = [{"role": "user", "content": "Hola"}, {"role": "assistant", "content": "¡Hola!"}]
    await store.save("sesion-1", messages)
    assert await store.load("sesion-1") == messages


async def test_sesion_desconocida_devuelve_lista_vacia() -> None:
    assert await RedisSessionStore(FakeAsyncRedis()).load("nueva") == []


async def test_cada_save_renueva_la_expiracion_de_24_horas() -> None:
    redis = FakeAsyncRedis()
    await RedisSessionStore(redis).save("sesion-1", [])
    assert 0 < await redis.ttl("session:sesion-1") <= SESSION_TTL_SECONDS
    assert SESSION_TTL_SECONDS == 86400
