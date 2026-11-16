from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp_types import ToolAnnotations
from pydantic import Field

from agichat.mcp_servers.books.service import BooksService

READ_ONLY = ToolAnnotations(readOnlyHint=True, openWorldHint=True)

VOLUME_ID_PATTERN = r"^[A-Za-z0-9_-]{6,20}$"
VolumeId = Annotated[str, Field(pattern=VOLUME_ID_PATTERN, description="volume_id de Google Books")]


def build_server(service: BooksService) -> MCPServer:
    server = MCPServer(
        "agichat-books",
        instructions="Consulta de libros en Google Books. Todas las tools son de solo lectura.",
    )

    @server.tool(annotations=READ_ONLY)
    async def search_book(
        title: Annotated[str, Field(min_length=1, max_length=120)],
        author: Annotated[str, Field(max_length=80)] | None = None,
    ) -> dict[str, Any]:
        """Busca un libro por título (y autor, si se conoce). Para adaptaciones conviene usar el
        título original de la película y el autor que reporta TMDB."""
        return {"results": await service.search_book(title, author)}

    @server.tool(annotations=READ_ONLY)
    async def get_book(volume_id: VolumeId) -> dict[str, Any]:
        """Ficha del libro: sinopsis, autores, páginas, calificación promedio de lectores."""
        return await service.get_book(volume_id)

    return server
