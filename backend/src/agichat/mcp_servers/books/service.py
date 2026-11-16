from typing import Any

from agichat.mcp_servers.http_source import CachedJsonSource
from agichat.mcp_servers.text import clean_text

GOOGLE_BOOKS_API_URL = "https://www.googleapis.com/books/v1"
GOOGLE_BOOKS_URL = "https://books.google.com/books?id="
MAX_RESULTS = 5


def _quoted(value: str) -> str:
    return '"' + value.replace('"', " ").strip() + '"'


class BooksService:
    def __init__(self, source: CachedJsonSource) -> None:
        self._source = source

    async def search_book(self, title: str, author: str | None = None) -> list[dict[str, Any]]:
        query = f"intitle:{_quoted(title)}"
        if author:
            query += f" inauthor:{_quoted(author)}"
        data = await self._source.get(
            "/volumes",
            {"q": query, "maxResults": MAX_RESULTS, "printType": "books"},
        )
        return [_volume(item, description_chars=280) for item in data.get("items", [])]

    async def get_book(self, volume_id: str) -> dict[str, Any]:
        data = await self._source.get(f"/volumes/{volume_id}")
        return _volume(data, description_chars=800)


def _volume(item: dict[str, Any], description_chars: int) -> dict[str, Any]:
    info = item.get("volumeInfo", {})
    return {
        "volume_id": item["id"],
        "title": info.get("title", ""),
        "subtitle": info.get("subtitle"),
        "authors": info.get("authors", []),
        "published": info.get("publishedDate"),
        "page_count": info.get("pageCount"),
        "categories": info.get("categories", []),
        "rating": info.get("averageRating"),
        "ratings_count": info.get("ratingsCount", 0),
        "language": info.get("language"),
        "description": clean_text(info.get("description"), description_chars),
        "google_books_url": f"{GOOGLE_BOOKS_URL}{item['id']}",
    }
