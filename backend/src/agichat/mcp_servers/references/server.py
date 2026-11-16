from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp_types import ToolAnnotations
from pydantic import Field

from agichat.mcp_servers.books.server import VOLUME_ID_PATTERN

IMDB_ID_PATTERN = r"^tt\d{7,10}$"

# No tocan red: solo construyen URLs de sitios fijos. Así el LLM nunca decide el dominio que se
# abre en el navegador del usuario; como mucho elige otro id válido del mismo sitio.
LOCAL_ONLY = ToolAnnotations(readOnlyHint=True, idempotentHint=True, openWorldHint=False)


def imdb_url(imdb_id: str) -> str:
    return f"https://www.imdb.com/title/{imdb_id}/"


def google_books_url(volume_id: str) -> str:
    return f"https://books.google.com/books?id={volume_id}"


def build_server() -> MCPServer:
    server = MCPServer(
        "agichat-references",
        instructions=(
            "Abre sitios de referencia (IMDb y Google Books) en una pestaña nueva del navegador "
            "del usuario. Solo acepta identificadores, nunca URLs."
        ),
    )

    @server.tool(annotations=LOCAL_ONLY)
    async def open_imdb(
        imdb_id: Annotated[str, Field(pattern=IMDB_ID_PATTERN, description="p. ej. tt0816692")],
    ) -> dict[str, Any]:
        """Abre la ficha de la película en IMDb en una pestaña nueva."""
        return {"kind": "open_url", "site": "imdb", "url": imdb_url(imdb_id)}

    @server.tool(annotations=LOCAL_ONLY)
    async def open_google_books(
        volume_id: Annotated[str, Field(pattern=VOLUME_ID_PATTERN)],
    ) -> dict[str, Any]:
        """Abre la ficha del libro en Google Books en una pestaña nueva."""
        return {"kind": "open_url", "site": "google_books", "url": google_books_url(volume_id)}

    return server
