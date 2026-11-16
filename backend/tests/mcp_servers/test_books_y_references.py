import httpx
from mcp import Client

from agichat.mcp_servers.books.server import build_server as build_books
from agichat.mcp_servers.references.server import build_server as build_references
from tests.fakes import books_service


async def test_busca_libro_por_titulo_y_autor() -> None:
    calls: list[httpx.Request] = []
    results = await books_service(calls).search_book('Dune "la saga"', "Frank Herbert")
    assert calls[0].url.params["q"] == 'intitle:"Dune  la saga" inauthor:"Frank Herbert"'
    assert calls[0].url.params["printType"] == "books"
    assert results[0]["volume_id"] == "B1hSG45JCX4C"
    assert results[0]["authors"] == ["Frank Herbert"]
    assert results[0]["description"] == "Set on the desert planet Arrakis ..."
    assert results[0]["google_books_url"] == "https://books.google.com/books?id=B1hSG45JCX4C"


async def test_busqueda_sin_resultados() -> None:
    assert await books_service().search_book("Inexistente") == []


async def test_ficha_de_libro() -> None:
    book = await books_service().get_book("B1hSG45JCX4C")
    assert book["page_count"] == 896
    assert book["rating"] == 4.5


async def test_books_por_protocolo_mcp() -> None:
    async with Client(build_books(books_service())) as client:
        found = await client.call_tool("search_book", {"title": "Dune"})
        assert found.structured_content["results"][0]["title"] == "Dune"

        book = await client.call_tool("get_book", {"volume_id": "B1hSG45JCX4C"})
        assert book.structured_content["published"] == "1965"

        bad_id = await client.call_tool("get_book", {"volume_id": "../../etc/passwd"})
        assert bad_id.is_error


async def test_references_construye_urls_de_sitios_fijos() -> None:
    async with Client(build_references()) as client:
        imdb = await client.call_tool("open_imdb", {"imdb_id": "tt1160419"})
        assert imdb.structured_content == {
            "kind": "open_url",
            "site": "imdb",
            "url": "https://www.imdb.com/title/tt1160419/",
        }

        books = await client.call_tool("open_google_books", {"volume_id": "B1hSG45JCX4C"})
        assert books.structured_content["url"] == "https://books.google.com/books?id=B1hSG45JCX4C"


async def test_references_rechaza_urls_e_ids_invalidos() -> None:
    async with Client(build_references()) as client:
        for bad in ["https://evil.example", "tt12", "tt1160419/../../x"]:
            result = await client.call_tool("open_imdb", {"imdb_id": bad})
            assert result.is_error, bad
