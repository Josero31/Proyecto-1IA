import httpx
import pytest

from agichat.mcp_servers.http_source import SourceError
from tests.fakes import make_source


def ok(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"path": request.url.path, "params": dict(request.url.params)})


async def test_usa_cache_y_no_repite_la_request() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return ok(request)

    source = make_source(handler, "https://api.test")
    first = await source.get("/x", {"q": "dune", "year": None})
    second = await source.get("/x", {"q": "dune"})
    assert first == second
    assert len(calls) == 1
    assert "year" not in calls[0].url.params


async def test_params_secretos_se_envian_pero_no_forman_la_llave() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return ok(request)

    source = make_source(handler, "https://api.test", secret_params={"key": "s3cr3t"})
    await source.get("/x", {"q": "a"})
    assert calls[0].url.params["key"] == "s3cr3t"
    cached_keys = list(source._cache._values)  # type: ignore[attr-defined]
    assert all("s3cr3t" not in k for k in cached_keys)


async def test_respeta_el_tope_diario() -> None:
    source = make_source(ok, "https://api.test", label="TMDB", daily_limit=1)
    await source.get("/a")
    with pytest.raises(SourceError, match="límite diario de consultas a TMDB"):
        await source.get("/b")


@pytest.mark.parametrize(
    ("status", "message"),
    [
        (404, "No se encontró"),
        (401, "Credenciales"),
        (403, "Credenciales"),
        (429, "limitó la velocidad"),
        (500, "error \\(500\\)"),
    ],
)
async def test_traduce_errores_http(status: int, message: str) -> None:
    source = make_source(lambda _: httpx.Response(status, json={}), "https://api.test")
    with pytest.raises(SourceError, match=message):
        await source.get("/x")


async def test_error_de_red() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("sin red", request=request)

    source = make_source(handler, "https://api.test", label="Google Books")
    with pytest.raises(SourceError, match="Google Books no respondió"):
        await source.get("/x")
