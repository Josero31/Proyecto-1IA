import json
from collections.abc import Awaitable, Callable, Mapping
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Protocol, Self

import mcp_types
from mcp import Client
from pydantic import ValidationError

from agichat.agents.events import MovieCard, OpenUrlEvent

UiAction = MovieCard | OpenUrlEvent


@dataclass
class TurnContext:
    """Estado compartido por todos los agentes durante un turno del usuario."""

    emit: Callable[[UiAction], Awaitable[None]]
    max_tool_calls: int = 12
    tool_calls: int = 0

    def consume_tool_call(self) -> bool:
        if self.tool_calls >= self.max_tool_calls:
            return False
        self.tool_calls += 1
        return True


class Tool(Protocol):
    name: str

    @property
    def spec(self) -> dict[str, Any]: ...

    async def run(self, arguments: dict[str, Any], ctx: TurnContext) -> str: ...


def function_spec(name: str, description: str, parameters: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {"name": name, "description": description, "parameters": parameters},
    }


def parse_ui_action(structured: Mapping[str, Any]) -> UiAction | None:
    """Convierte la salida estructurada de una tool en una acción de UI ya validada.

    Raises:
        ValidationError: si la acción no pasa las listas blancas (dominio, CDN del póster).
    """
    kind = structured.get("kind")
    if kind == "movie_card":
        return MovieCard.model_validate(structured.get("card"))
    if kind == "open_url":
        return OpenUrlEvent(url=structured.get("url", ""), site=structured.get("site", "imdb"))
    return None


def _confirmation(action: UiAction) -> str:
    if isinstance(action, MovieCard):
        return json.dumps(
            {"mostrado_al_usuario": "tarjeta con póster", "pelicula": action.title},
            ensure_ascii=False,
        )
    return json.dumps({"pestana_abierta": action.site, "url": action.url})


class McpTool:
    def __init__(self, client: Client, tool: mcp_types.Tool, server: str) -> None:
        self._client = client
        self.name = tool.name
        self.server = server
        self._spec = function_spec(tool.name, tool.description or "", tool.input_schema)

    @property
    def spec(self) -> dict[str, Any]:
        return self._spec

    async def run(self, arguments: dict[str, Any], ctx: TurnContext) -> str:
        result = await self._client.call_tool(self.name, arguments)
        text = "\n".join(c.text for c in result.content if isinstance(c, mcp_types.TextContent))
        if result.is_error:
            return f"ERROR: {text}"

        structured = result.structured_content
        if not structured:
            return text
        try:
            action = parse_ui_action(structured)
        except ValidationError:
            return "ERROR: la acción no pasó la validación de seguridad y no se ejecutó."
        if action is None:
            return json.dumps(structured, ensure_ascii=False)
        await ctx.emit(action)
        return _confirmation(action)


class McpToolbox:
    """Conexiones de larga vida a los MCP servers y catálogo de sus tools.

    ``servers`` mapea nombre -> URL de Streamable HTTP (producción) o una instancia de
    ``MCPServer`` (tests, en el mismo proceso).
    """

    def __init__(self, servers: Mapping[str, Any]) -> None:
        self._servers = servers
        self._tools: dict[str, McpTool] = {}
        self._stack = AsyncExitStack()

    async def __aenter__(self) -> Self:
        for server_name, target in self._servers.items():
            client = await self._stack.enter_async_context(Client(target))
            for tool in (await client.list_tools()).tools:
                self._tools[tool.name] = McpTool(client, tool, server_name)
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self._stack.aclose()

    def select(self, *names: str) -> list[McpTool]:
        """Mínimo privilegio: cada agente recibe solo las tools que nombra explícitamente."""
        missing = [name for name in names if name not in self._tools]
        if missing:
            raise KeyError(f"Tools no disponibles en los MCP servers: {', '.join(missing)}")
        return [self._tools[name] for name in names]
