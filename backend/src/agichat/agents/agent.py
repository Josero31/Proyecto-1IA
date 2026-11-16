import logging
from collections.abc import Sequence
from typing import Any

from agichat.agents.llm import LLM
from agichat.agents.tools import Tool, TurnContext, function_spec
from agichat.agents.untrusted import wrap_untrusted

logger = logging.getLogger(__name__)

WRAP_UP = (
    "Ya no puedes usar más herramientas en este turno. Responde ahora con la información que "
    "tienes; si falta algo, dilo con honestidad."
)


class ToolAgent:
    """Agente con un bucle de razonamiento + herramientas (estilo ReAct) acotado en pasos."""

    def __init__(
        self,
        name: str,
        system_prompt: str,
        llm: LLM,
        tools: Sequence[Tool],
        max_steps: int = 6,
    ) -> None:
        self.name = name
        self.system_prompt = system_prompt
        self._llm = llm
        self._tools = {tool.name: tool for tool in tools}
        self._max_steps = max_steps

    async def run(self, messages: list[dict[str, Any]], ctx: TurnContext) -> str:
        convo: list[dict[str, Any]] = [{"role": "system", "content": self.system_prompt}]
        convo.extend(messages)
        specs = [tool.spec for tool in self._tools.values()] or None

        for _ in range(self._max_steps):
            reply = await self._llm.chat(convo, specs)
            if not reply.tool_calls:
                return reply.content.strip()
            convo.append(reply.as_message())
            for call in reply.tool_calls:
                output = await self._call_tool(call.name, call.arguments, ctx)
                convo.append({"role": "tool", "tool_call_id": call.id, "content": output})

        convo.append({"role": "system", "content": WRAP_UP})
        return (await self._llm.chat(convo, None)).content.strip()

    async def _call_tool(self, name: str, arguments: dict[str, Any], ctx: TurnContext) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"ERROR: la herramienta '{name}' no existe para este agente."
        if not ctx.consume_tool_call():
            return f"ERROR: {WRAP_UP}"
        try:
            output = await tool.run(arguments, ctx)
        except Exception:
            logger.exception("Falló la tool %s del agente %s", name, self.name)
            output = "ERROR: la herramienta falló. Intenta otra cosa o responde sin ella."
        return wrap_untrusted(name, output)


class SubAgentTool:
    """Expone un agente especialista como herramienta del supervisor (organización jerárquica)."""

    def __init__(self, agent: ToolAgent, name: str, description: str) -> None:
        self._agent = agent
        self.name = name
        self._spec = function_spec(
            name,
            description,
            {
                "type": "object",
                "properties": {
                    "solicitud": {
                        "type": "string",
                        "maxLength": 1000,
                        "description": "Qué necesitas del especialista, con todo el contexto útil.",
                    }
                },
                "required": ["solicitud"],
            },
        )

    @property
    def spec(self) -> dict[str, Any]:
        return self._spec

    async def run(self, arguments: dict[str, Any], ctx: TurnContext) -> str:
        request = str(arguments.get("solicitud", "")).strip()[:1000]
        if not request:
            return "ERROR: falta la solicitud para el especialista."
        return await self._agent.run([{"role": "user", "content": request}], ctx)
