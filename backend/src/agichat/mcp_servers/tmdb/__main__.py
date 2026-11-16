import httpx

from agichat.cache import build_cache
from agichat.config import Settings
from agichat.mcp_servers.http_source import CachedJsonSource
from agichat.mcp_servers.tmdb.server import build_server
from agichat.mcp_servers.tmdb.service import TMDB_API_URL, TMDBService


def main() -> None:
    settings = Settings()
    http = httpx.AsyncClient(
        base_url=TMDB_API_URL,
        headers={"Authorization": f"Bearer {settings.tmdb_read_access_token.get_secret_value()}"},
        timeout=10,
    )
    source = CachedJsonSource(
        label="TMDB",
        http=http,
        cache=build_cache(settings.redis_url),
        daily_limit=settings.tmdb_daily_limit,
        ttl_seconds=6 * 60 * 60,
    )
    server = build_server(TMDBService(source, settings.tmdb_language))
    # stateless_http: cualquier réplica atiende cualquier request (sin sesiones pegajosas).
    server.run(
        "streamable-http",
        host=settings.mcp_host,
        port=settings.tmdb_mcp_port,
        stateless_http=True,
        json_response=True,
    )


if __name__ == "__main__":
    main()
