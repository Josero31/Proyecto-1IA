from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp_types import ToolAnnotations
from pydantic import Field

from agichat.mcp_servers.tmdb.service import SortBy, TMDBService

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=True)

TmdbId = Annotated[int, Field(gt=0, lt=100_000_000, description="Id de la película en TMDB")]
Year = Annotated[int, Field(ge=1870, le=2100)]


def build_server(service: TMDBService) -> MCPServer:
    server = MCPServer(
        "agichat-tmdb",
        instructions=(
            "Consulta de películas en The Movie Database (TMDB). Todas las tools son de solo "
            "lectura. This product uses the TMDB API but is not endorsed or certified by TMDB."
        ),
    )

    @server.tool(annotations=READ_ONLY)
    async def search_movie(
        query: Annotated[str, Field(min_length=1, max_length=100)],
        year: Year | None = None,
    ) -> dict[str, Any]:
        """Busca películas por título. Devuelve hasta 8 resultados con su tmdb_id."""
        return {"results": await service.search_movie(query, year)}

    @server.tool(annotations=READ_ONLY)
    async def discover_movies(
        genres: Annotated[list[str], Field(max_length=3)] | None = None,
        year_from: Year | None = None,
        year_to: Year | None = None,
        min_rating: Annotated[float, Field(ge=0, le=10)] | None = None,
        sort_by: SortBy = "popularidad",
    ) -> dict[str, Any]:
        """Descubre películas por género (nombres en español, p. ej. "Ciencia ficción"),
        rango de años y calificación mínima (0-10). Úsala para recomendaciones por gustos."""
        return {
            "results": await service.discover_movies(
                genres, year_from, year_to, min_rating, sort_by
            )
        }

    @server.tool(annotations=READ_ONLY)
    async def get_recommendations(tmdb_id: TmdbId) -> dict[str, Any]:
        """Películas parecidas a la indicada, según TMDB."""
        return {"results": await service.recommendations(tmdb_id)}

    @server.tool(annotations=READ_ONLY)
    async def get_movie_details(tmdb_id: TmdbId) -> dict[str, Any]:
        """Ficha completa: sinopsis, director, imdb_id y si está basada en un libro
        (based_on_book, source_authors)."""
        return await service.movie_details(tmdb_id)

    @server.tool(annotations=READ_ONLY)
    async def present_movie(tmdb_id: TmdbId) -> dict[str, Any]:
        """Muestra al usuario la tarjeta de la película con su póster oficial. Llámala una vez
        por cada película que recomiendes."""
        return await service.movie_card(tmdb_id)

    return server
