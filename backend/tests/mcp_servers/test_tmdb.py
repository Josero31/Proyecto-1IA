import httpx
import pytest
from mcp import Client

from agichat.mcp_servers.http_source import SourceError
from agichat.mcp_servers.tmdb.server import build_server
from tests.fakes import tmdb_service


async def test_search_movie_resume_resultados() -> None:
    calls: list[httpx.Request] = []
    results = await tmdb_service(calls).search_movie("Dune", 2021)
    assert results == [
        {
            "tmdb_id": 438631,
            "title": "Dune",
            "original_title": "Dune",
            "year": 2021,
            "rating": 7.8,
            "votes": 12000,
            "genres": ["Ciencia ficción", "Drama"],
            "overview": "Paul Atreides llega a Arrakis.",
        }
    ]
    search = next(c for c in calls if c.url.path == "/3/search/movie")
    assert search.url.params["primary_release_year"] == "2021"
    assert search.url.params["include_adult"] == "false"
    assert search.url.params["language"] == "es-MX"


async def test_discover_traduce_generos_en_espanol_sin_importar_tildes() -> None:
    calls: list[httpx.Request] = []
    await tmdb_service(calls).discover_movies(
        ["ciencia ficcion", "DRAMA"], 2010, 2020, 7.0, "calificacion"
    )
    discover = next(c for c in calls if c.url.path == "/3/discover/movie")
    params = discover.url.params
    assert params["with_genres"] == "878,18"
    assert params["primary_release_date.gte"] == "2010-01-01"
    assert params["primary_release_date.lte"] == "2020-12-31"
    assert params["vote_average.gte"] == "7.0"
    assert params["sort_by"] == "vote_average.desc"


async def test_discover_sin_filtros() -> None:
    calls: list[httpx.Request] = []
    await tmdb_service(calls).discover_movies()
    discover = next(c for c in calls if c.url.path == "/3/discover/movie")
    assert "with_genres" not in discover.url.params


async def test_discover_rechaza_generos_desconocidos() -> None:
    with pytest.raises(SourceError, match="Géneros desconocidos: Telenovela"):
        await tmdb_service().discover_movies(["Telenovela"])


async def test_detalles_detectan_libro_y_autor() -> None:
    details = await tmdb_service().movie_details(438631)
    assert details["based_on_book"] is True
    assert details["source_authors"] == ["Frank Herbert"]
    assert details["directors"] == ["Denis Villeneuve"]
    assert details["imdb_id"] == "tt1160419"
    assert details["tagline"] == "Más allá del miedo"
    assert (
        details["poster_url"] == "https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg"
    )
    assert details["tmdb_url"] == "https://www.themoviedb.org/movie/438631"


async def test_detalles_de_guion_original() -> None:
    details = await tmdb_service().movie_details(27205)
    assert details["based_on_book"] is False
    assert details["source_authors"] == []
    assert details["imdb_id"] is None
    assert details["poster_url"] is None


async def test_tarjeta_de_pelicula() -> None:
    card = await tmdb_service().movie_card(438631)
    assert card["kind"] == "movie_card"
    assert card["card"]["imdbUrl"] == "https://www.imdb.com/title/tt1160419/"
    assert card["card"]["posterUrl"].startswith("https://image.tmdb.org/t/p/")
    assert (await tmdb_service().movie_card(27205))["card"]["imdbUrl"] is None


async def test_lista_vacia_no_pide_generos() -> None:
    calls: list[httpx.Request] = []
    service = tmdb_service(calls)
    service._source._http._transport = httpx.MockTransport(  # type: ignore[attr-defined]
        lambda r: (calls.append(r), httpx.Response(200, json={"results": []}))[1]
    )
    assert await service.search_movie("nada") == []
    assert [c.url.path for c in calls] == ["/3/search/movie"]


async def test_recomendaciones() -> None:
    assert (await tmdb_service().recommendations(438631))[0]["tmdb_id"] == 438631


async def test_tools_por_protocolo_mcp() -> None:
    async with Client(build_server(tmdb_service())) as client:
        names = {tool.name for tool in (await client.list_tools()).tools}
        assert names == {
            "search_movie",
            "discover_movies",
            "get_recommendations",
            "get_movie_details",
            "present_movie",
        }

        result = await client.call_tool("search_movie", {"query": "Dune"})
        assert not result.is_error
        assert result.structured_content["results"][0]["tmdb_id"] == 438631

        details = await client.call_tool("get_movie_details", {"tmdb_id": 438631})
        assert details.structured_content["based_on_book"] is True

        card = await client.call_tool("present_movie", {"tmdb_id": 438631})
        assert card.structured_content["kind"] == "movie_card"

        recs = await client.call_tool("get_recommendations", {"tmdb_id": 438631})
        assert recs.structured_content["results"]

        found = await client.call_tool("discover_movies", {"genres": ["Drama"]})
        assert found.structured_content["results"]


async def test_mcp_valida_argumentos_y_reporta_errores_de_la_api() -> None:
    async with Client(build_server(tmdb_service())) as client:
        invalid = await client.call_tool("get_movie_details", {"tmdb_id": -5})
        assert invalid.is_error

        too_long = await client.call_tool("search_movie", {"query": "x" * 500})
        assert too_long.is_error

        missing = await client.call_tool("get_movie_details", {"tmdb_id": 1})
        assert missing.is_error
        assert "No se encontró" in missing.content[0].text
