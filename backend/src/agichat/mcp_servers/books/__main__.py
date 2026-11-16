import httpx

from agichat.cache import build_cache
from agichat.config import Settings
from agichat.mcp_servers.books.server import build_server
from agichat.mcp_servers.books.service import GOOGLE_BOOKS_API_URL, BooksService
from agichat.mcp_servers.http_source import CachedJsonSource


def main() -> None:
    settings = Settings()
    api_key = settings.google_books_api_key.get_secret_value()
    source = CachedJsonSource(
        label="Google Books",
        http=httpx.AsyncClient(base_url=GOOGLE_BOOKS_API_URL, timeout=10),
        cache=build_cache(settings.redis_url),
        daily_limit=settings.books_daily_limit,
        ttl_seconds=24 * 60 * 60,
        secret_params={"key": api_key} if api_key else None,
    )
    build_server(BooksService(source)).run(
        "streamable-http",
        host=settings.mcp_host,
        port=settings.books_mcp_port,
        stateless_http=True,
        json_response=True,
    )


if __name__ == "__main__":
    main()
