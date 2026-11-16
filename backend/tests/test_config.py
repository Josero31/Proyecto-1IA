import pytest

from agichat.config import Settings


def test_valores_por_defecto_apuntan_a_groq_y_puertos_locales(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AGENT_MODEL", raising=False)
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.llm_base_url == "https://api.groq.com/openai/v1"
    assert settings.agent_model == "openai/gpt-oss-120b"
    assert settings.tmdb_daily_limit == 1000
    assert settings.redis_url is None
    assert settings.tmdb_mcp_url == "http://127.0.0.1:8101/mcp"


def test_lee_variables_de_entorno_sin_exponer_secretos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TMDB_READ_ACCESS_TOKEN", "token-secreto")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379/0")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.tmdb_read_access_token.get_secret_value() == "token-secreto"
    assert "token-secreto" not in repr(settings)
    assert settings.redis_url == "redis://redis:6379/0"


def test_allowed_origins_se_lee_como_lista_separada_por_comas(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example, https://b.example")
    settings = Settings(_env_file=None)  # type: ignore[call-arg]
    assert settings.allowed_origins == ["https://a.example", "https://b.example"]
    assert settings.gateway_port == 8000


def test_allowed_origins_acepta_una_lista_directa() -> None:
    settings = Settings(_env_file=None, allowed_origins=["https://a.example"])  # type: ignore[call-arg]
    assert settings.allowed_origins == ["https://a.example"]
