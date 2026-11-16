from typing import Any, Literal

from agichat.mcp_servers.http_source import CachedJsonSource, SourceError
from agichat.mcp_servers.text import clean_text, normalize, year_of

TMDB_API_URL = "https://api.themoviedb.org/3"
POSTER_BASE_URL = "https://image.tmdb.org/t/p/w500"
TMDB_MOVIE_URL = "https://www.themoviedb.org/movie/"
IMDB_TITLE_URL = "https://www.imdb.com/title/"

MAX_RESULTS = 8
# Trabajos de crew con los que TMDB acredita al autor de la obra original.
BOOK_SOURCE_JOBS = {"Novel", "Book", "Author", "Short Story", "Comic Book", "Graphic Novel"}
BOOK_KEYWORD_HINTS = ("novel", "book", "short story", "memoir", "manga", "comic")

SortBy = Literal["popularidad", "calificacion", "recientes"]
_SORT_PARAM: dict[str, str] = {
    "popularidad": "popularity.desc",
    "calificacion": "vote_average.desc",
    "recientes": "primary_release_date.desc",
}


class TMDBService:
    def __init__(self, source: CachedJsonSource, language: str = "es-MX") -> None:
        self._source = source
        self._language = language

    async def search_movie(self, query: str, year: int | None = None) -> list[dict[str, Any]]:
        data = await self._source.get(
            "/search/movie",
            {
                "query": query,
                "primary_release_year": year,
                "include_adult": "false",
                "language": self._language,
            },
        )
        return await self._summaries(data.get("results", []))

    async def discover_movies(
        self,
        genres: list[str] | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        min_rating: float | None = None,
        sort_by: SortBy = "popularidad",
    ) -> list[dict[str, Any]]:
        genre_ids = await self._genre_ids(genres or [])
        data = await self._source.get(
            "/discover/movie",
            {
                "with_genres": ",".join(str(g) for g in genre_ids) or None,
                "primary_release_date.gte": f"{year_from}-01-01" if year_from else None,
                "primary_release_date.lte": f"{year_to}-12-31" if year_to else None,
                "vote_average.gte": min_rating,
                # Evita recomendar títulos con 3 votos y promedio 10.
                "vote_count.gte": 200,
                "sort_by": _SORT_PARAM[sort_by],
                "include_adult": "false",
                "language": self._language,
            },
        )
        return await self._summaries(data.get("results", []))

    async def recommendations(self, tmdb_id: int) -> list[dict[str, Any]]:
        data = await self._source.get(
            f"/movie/{tmdb_id}/recommendations", {"language": self._language}
        )
        return await self._summaries(data.get("results", []))

    async def movie_details(self, tmdb_id: int) -> dict[str, Any]:
        movie = await self._source.get(
            f"/movie/{tmdb_id}",
            {"language": self._language, "append_to_response": "keywords,credits"},
        )
        crew = movie.get("credits", {}).get("crew", [])
        source_authors = sorted({p["name"] for p in crew if p.get("job") in BOOK_SOURCE_JOBS})
        keywords = [k.get("name", "") for k in movie.get("keywords", {}).get("keywords", [])]
        based_on_book = bool(source_authors) or any(
            k.startswith("based on") and any(hint in k for hint in BOOK_KEYWORD_HINTS)
            for k in keywords
        )
        imdb_id = movie.get("imdb_id") or None
        return {
            "tmdb_id": movie["id"],
            "title": movie.get("title", ""),
            "original_title": movie.get("original_title", ""),
            "year": year_of(movie.get("release_date")),
            "tagline": clean_text(movie.get("tagline"), 160),
            "overview": clean_text(movie.get("overview"), 600),
            "genres": [g["name"] for g in movie.get("genres", [])],
            "runtime_minutes": movie.get("runtime"),
            "rating": round(float(movie.get("vote_average") or 0), 1),
            "votes": movie.get("vote_count", 0),
            "directors": [p["name"] for p in crew if p.get("job") == "Director"],
            "imdb_id": imdb_id,
            "based_on_book": based_on_book,
            "source_authors": source_authors,
            "poster_url": _poster_url(movie.get("poster_path")),
            "tmdb_url": f"{TMDB_MOVIE_URL}{movie['id']}",
        }

    async def movie_card(self, tmdb_id: int) -> dict[str, Any]:
        details = await self.movie_details(tmdb_id)
        imdb_id = details["imdb_id"]
        return {
            "kind": "movie_card",
            "card": {
                "tmdbId": details["tmdb_id"],
                "title": details["title"],
                "year": details["year"],
                "posterUrl": details["poster_url"],
                "overview": clean_text(details["overview"], 400),
                "rating": details["rating"],
                "imdbUrl": f"{IMDB_TITLE_URL}{imdb_id}/" if imdb_id else None,
                "tmdbUrl": details["tmdb_url"],
            },
        }

    async def _genre_map(self) -> dict[int, str]:
        data = await self._source.get("/genre/movie/list", {"language": self._language})
        return {g["id"]: g["name"] for g in data.get("genres", [])}

    async def _genre_ids(self, names: list[str]) -> list[int]:
        if not names:
            return []
        by_name = {normalize(name): gid for gid, name in (await self._genre_map()).items()}
        ids: list[int] = []
        unknown: list[str] = []
        for name in names:
            gid = by_name.get(normalize(name))
            if gid is None:
                unknown.append(name)
            else:
                ids.append(gid)
        if unknown:
            valid = ", ".join(sorted((await self._genre_map()).values()))
            raise SourceError(f"Géneros desconocidos: {', '.join(unknown)}. Válidos: {valid}.")
        return ids

    async def _summaries(self, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        genre_names = await self._genre_map() if results else {}
        return [
            {
                "tmdb_id": movie["id"],
                "title": movie.get("title", ""),
                "original_title": movie.get("original_title", ""),
                "year": year_of(movie.get("release_date")),
                "rating": round(float(movie.get("vote_average") or 0), 1),
                "votes": movie.get("vote_count", 0),
                "genres": [genre_names[g] for g in movie.get("genre_ids", []) if g in genre_names],
                "overview": clean_text(movie.get("overview"), 280),
            }
            for movie in results[:MAX_RESULTS]
        ]


def _poster_url(poster_path: str | None) -> str | None:
    return f"{POSTER_BASE_URL}{poster_path}" if poster_path else None
