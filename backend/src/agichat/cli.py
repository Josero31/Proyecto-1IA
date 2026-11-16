"""Chat de terminal contra el sistema multiagente real, para probar sin el widget.

Requiere los 3 MCP servers corriendo y GROQ_API_KEY en .env.
"""

import asyncio
import logging

from agichat.agents.events import MovieCardEvent, OpenUrlEvent, TextEvent
from agichat.agents.factory import create_orchestrator
from agichat.agents.prompts import WELCOME_MESSAGE


async def _chat() -> None:
    async with create_orchestrator() as orchestrator:
        print(f"\nAgente: {WELCOME_MESSAGE}\n")
        while True:
            try:
                text = (await asyncio.to_thread(input, "Tú: ")).strip()
            except (EOFError, KeyboardInterrupt):
                return
            if not text:
                continue
            async for event in orchestrator.run_turn("terminal", text):
                if isinstance(event, TextEvent) and event.status != "streaming":
                    print(f"\nAgente: {event.content}\n")
                elif isinstance(event, MovieCardEvent):
                    card = event.card
                    print(f"  [póster] {card.title} ({card.year}) {card.posterUrl}")
                elif isinstance(event, OpenUrlEvent):
                    print(f"  [abrir pestaña] {event.url}")


def main() -> None:
    logging.basicConfig(level=logging.WARNING)
    asyncio.run(_chat())


if __name__ == "__main__":
    main()
