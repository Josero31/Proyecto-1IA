from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from typing import Any

from openai import AsyncOpenAI

from agichat.agents.agent import SubAgentTool, ToolAgent
from agichat.agents.guardian import Guardian
from agichat.agents.llm import LLM, OpenAICompatibleLLM
from agichat.agents.orchestrator import Orchestrator, SessionStore
from agichat.agents.output_filter import OutputFilter
from agichat.agents.prompts import (
    PUBLIC_TEXTS,
    critic_prompt,
    new_canary,
    recommender_prompt,
    supervisor_prompt,
)
from agichat.agents.tools import McpToolbox
from agichat.config import Settings

RECOMMENDER_TOOLS = (
    "search_movie",
    "discover_movies",
    "get_recommendations",
    "get_movie_details",
    "present_movie",
)
CRITIC_TOOLS = ("search_movie", "get_movie_details", "search_book", "get_book")
SUPERVISOR_MCP_TOOLS = ("open_imdb", "open_google_books")


def build_orchestrator(
    toolbox: McpToolbox,
    llm: LLM,
    guard_llm: LLM | None,
    sessions: SessionStore | None = None,
) -> Orchestrator:
    canary = new_canary()
    prompts = {
        "supervisor": supervisor_prompt(canary),
        "recomendador": recommender_prompt(canary),
        "critico": critic_prompt(canary),
    }
    recommender = ToolAgent(
        "recomendador", prompts["recomendador"], llm, toolbox.select(*RECOMMENDER_TOOLS)
    )
    critic = ToolAgent("critico", prompts["critico"], llm, toolbox.select(*CRITIC_TOOLS))
    supervisor = ToolAgent(
        "supervisor",
        prompts["supervisor"],
        llm,
        [
            SubAgentTool(
                recommender,
                "recomendador",
                "Especialista que busca y recomienda películas en TMDB y muestra sus pósters.",
            ),
            SubAgentTool(
                critic,
                "critico_libro_pelicula",
                "Especialista que compara una película con el libro en que se basa y da un "
                "veredicto sobre si vale la pena verla.",
            ),
            *toolbox.select(*SUPERVISOR_MCP_TOOLS),
        ],
        max_steps=5,
    )
    return Orchestrator(
        Guardian(guard_llm),
        supervisor,
        OutputFilter(canary, prompts.values(), PUBLIC_TEXTS),
        sessions,
    )


def mcp_endpoints(settings: Settings) -> Mapping[str, Any]:
    return {
        "tmdb": settings.tmdb_mcp_url,
        "books": settings.books_mcp_url,
        "references": settings.references_mcp_url,
    }


@asynccontextmanager
async def create_orchestrator(
    settings: Settings | None = None, sessions: SessionStore | None = None
) -> AsyncIterator[Orchestrator]:
    """Arma el sistema completo contra los MCP servers y Groq. Uso típico en el gateway:

    ``async with create_orchestrator() as orchestrator: ...`` (una vez por proceso).
    """
    settings = settings or Settings()
    client = AsyncOpenAI(
        api_key=settings.groq_api_key.get_secret_value(),
        base_url=settings.llm_base_url,
        # El free tier de Groq limita los tokens por minuto: se espera y se reintenta.
        max_retries=6,
    )
    async with McpToolbox(mcp_endpoints(settings)) as toolbox:
        yield build_orchestrator(
            toolbox,
            OpenAICompatibleLLM(client, settings.agent_model, temperature=0.4),
            OpenAICompatibleLLM(client, settings.guard_model, temperature=0),
            sessions,
        )
