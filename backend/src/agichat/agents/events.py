"""Contrato de eventos entre el sistema multiagente (Parte 1) y el gateway/widget (Parte 2).

Cada evento se serializa con ``event.model_dump()`` y se manda tal cual por el WebSocket.
Los nombres en camelCase son intencionales: son los mismos que lee el widget en TypeScript.
"""

from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator, model_validator

POSTER_PREFIX = "https://image.tmdb.org/t/p/"
OPEN_URL_HOSTS = {"imdb": "www.imdb.com", "google_books": "books.google.com"}


class MovieCard(BaseModel):
    tmdbId: int
    title: str
    year: int | None = None
    posterUrl: str | None = None
    overview: str = ""
    rating: float | None = None
    imdbUrl: str | None = None
    tmdbUrl: str

    @field_validator("posterUrl")
    @classmethod
    def _poster_from_tmdb_cdn(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(POSTER_PREFIX):
            raise ValueError("el póster solo puede venir del CDN de TMDB")
        return value

    @field_validator("imdbUrl")
    @classmethod
    def _imdb_only(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("https://www.imdb.com/title/"):
            raise ValueError("imdbUrl debe apuntar a www.imdb.com")
        return value

    @field_validator("tmdbUrl")
    @classmethod
    def _tmdb_only(cls, value: str) -> str:
        if not value.startswith("https://www.themoviedb.org/movie/"):
            raise ValueError("tmdbUrl debe apuntar a www.themoviedb.org")
        return value


class TextEvent(BaseModel):
    type: Literal["text"] = "text"
    id: str
    content: str
    """Contenido acumulado de la respuesta (no el delta), igual que el MockAgentTransport."""
    status: Literal["streaming", "complete", "error"]


class MovieCardEvent(BaseModel):
    type: Literal["movie_card"] = "movie_card"
    messageId: str
    card: MovieCard


class OpenUrlEvent(BaseModel):
    type: Literal["open_url"] = "open_url"
    url: str
    site: Literal["imdb", "google_books"]

    @model_validator(mode="after")
    def _https_host_of_its_site(self) -> "OpenUrlEvent":
        parsed = urlparse(self.url)
        if parsed.scheme != "https" or parsed.hostname != OPEN_URL_HOSTS[self.site]:
            raise ValueError("solo se pueden abrir IMDb y Google Books por https")
        return self


AgentEvent = TextEvent | MovieCardEvent | OpenUrlEvent
