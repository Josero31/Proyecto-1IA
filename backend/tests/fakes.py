"""APIs externas simuladas con httpx.MockTransport (sin red, deterministas)."""

from collections.abc import Callable
from typing import Any

import httpx

from agichat.cache import MemoryCache
from agichat.mcp_servers.books.service import GOOGLE_BOOKS_API_URL, BooksService
from agichat.mcp_servers.http_source import CachedJsonSource
from agichat.mcp_servers.tmdb.service import TMDB_API_URL, TMDBService

GENRES = {
    "genres": [
        {"id": 878, "name": "Ciencia ficción"},
        {"id": 18, "name": "Drama"},
        {"id": 35, "name": "Comedia"},
    ]
}

DUNE_SUMMARY = {
    "id": 438631,
    "title": "Dune",
    "original_title": "Dune",
    "release_date": "2021-09-15",
    "vote_average": 7.79,
    "vote_count": 12000,
    "genre_ids": [878, 18, 999],
    "overview": "Paul Atreides llega a Arrakis.",
}

DUNE_DETAILS = {
    "id": 438631,
    "title": "Dune",
    "original_title": "Dune",
    "release_date": "2021-09-15",
    "tagline": "<b>Más allá del miedo</b>",
    "overview": "Paul Atreides, un joven brillante...",
    "genres": [{"id": 878, "name": "Ciencia ficción"}],
    "runtime": 155,
    "vote_average": 7.8,
    "vote_count": 12000,
    "imdb_id": "tt1160419",
    "poster_path": "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    "credits": {
        "crew": [
            {"name": "Denis Villeneuve", "job": "Director"},
            {"name": "Frank Herbert", "job": "Novel"},
        ]
    },
    "keywords": {"keywords": [{"id": 818, "name": "based on novel or book"}]},
}

ORIGINAL_SCREENPLAY = {
    "id": 27205,
    "title": "El origen",
    "original_title": "Inception",
    "release_date": "2010-07-15",
    "overview": "Dom Cobb roba secretos.",
    "genres": [],
    "vote_average": 8.4,
    "vote_count": 30000,
    "imdb_id": "",
    "poster_path": None,
    "credits": {"crew": [{"name": "Christopher Nolan", "job": "Director"}]},
    "keywords": {"keywords": [{"id": 1, "name": "dream"}]},
}

DUNE_BOOK = {
    "id": "B1hSG45JCX4C",
    "volumeInfo": {
        "title": "Dune",
        "authors": ["Frank Herbert"],
        "publishedDate": "1965",
        "pageCount": 896,
        "categories": ["Fiction"],
        "averageRating": 4.5,
        "ratingsCount": 1200,
        "language": "en",
        "description": "<p>Set on the desert planet <b>Arrakis</b>...</p>",
    },
}

Handler = Callable[[httpx.Request], httpx.Response]


def tmdb_handler(calls: list[httpx.Request] | None = None) -> Handler:
    routes: dict[str, Any] = {
        "/3/genre/movie/list": GENRES,
        "/3/search/movie": {"results": [DUNE_SUMMARY]},
        "/3/discover/movie": {"results": [DUNE_SUMMARY]},
        "/3/movie/438631": DUNE_DETAILS,
        "/3/movie/27205": ORIGINAL_SCREENPLAY,
        "/3/movie/438631/recommendations": {"results": [DUNE_SUMMARY]},
    }

    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        body = routes.get(request.url.path)
        if body is None:
            return httpx.Response(404, json={"status_message": "not found"})
        return httpx.Response(200, json=body)

    return handle


def books_handler(calls: list[httpx.Request] | None = None) -> Handler:
    def handle(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        if request.url.path == "/books/v1/volumes":
            if "Inexistente" in request.url.params["q"]:
                return httpx.Response(200, json={"totalItems": 0})
            return httpx.Response(200, json={"totalItems": 1, "items": [DUNE_BOOK]})
        if request.url.path == f"/books/v1/volumes/{DUNE_BOOK['id']}":
            return httpx.Response(200, json=DUNE_BOOK)
        return httpx.Response(404, json={})

    return handle


def make_source(
    handler: Handler,
    base_url: str,
    *,
    label: str = "API",
    daily_limit: int = 1000,
    secret_params: dict[str, str] | None = None,
) -> CachedJsonSource:
    return CachedJsonSource(
        label=label,
        http=httpx.AsyncClient(base_url=base_url, transport=httpx.MockTransport(handler)),
        cache=MemoryCache(),
        daily_limit=daily_limit,
        ttl_seconds=60,
        secret_params=secret_params,
    )


def tmdb_service(calls: list[httpx.Request] | None = None) -> TMDBService:
    return TMDBService(make_source(tmdb_handler(calls), TMDB_API_URL, label="TMDB"))


def books_service(calls: list[httpx.Request] | None = None) -> BooksService:
    return BooksService(
        make_source(
            books_handler(calls),
            GOOGLE_BOOKS_API_URL,
            label="Google Books",
            secret_params={"key": "secreta"},
        )
    )
