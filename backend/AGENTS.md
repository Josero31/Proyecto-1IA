# AGENTS.md (backend)

Guía para herramientas de codeo agéntico que trabajen en `backend/`. Complementa el
[`AGENTS.md` de la raíz](../AGENTS.md), que sigue aplicando (commits, PRs, estilo general).

## Stack

- Python 3.12+, `mcp` 2.x (`MCPServer`, `Client`), `openai` (cliente compatible con Groq),
  `httpx`, `redis`, Pydantic
- pytest + pytest-asyncio + pytest-cov; ruff para lint y formato

## Comandos (desde `backend/`)

```bash
pip install -e ".[dev]"
ruff check . && ruff format --check . && pytest --cov
```

Antes de terminar cualquier tarea los tres deben quedar en verde (cobertura ≥ 80%).

## Dónde va cada cosa

| Necesito...                            | Va en...                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------- |
| Una tool nueva sobre una API existente | `mcp_servers/<api>/service.py` + registrarla en `server.py`                  |
| Una API externa nueva                  | `mcp_servers/<api>/` con `service.py`, `server.py`, `__main__.py`            |
| Dar una tool a un agente               | `agents/factory.py` (`*_TOOLS`)                                              |
| Un agente especialista nuevo           | prompt en `agents/prompts.py` + `ToolAgent` y `SubAgentTool` en `factory.py` |
| Un evento nuevo hacia el widget        | `agents/events.py` (coordinar con la Parte 2)                                |

## Reglas duras

- **Las tools son de solo lectura.** Ninguna tool escribe, borra ni manda datos a terceros.
- **Mínimo privilegio:** cada agente recibe solo las tools que nombra en `factory.py`. No pasar
  `toolbox` completo a un agente.
- **Nunca** aceptar URLs como argumento de una tool. Las tools reciben ids validados con regex y
  construyen la URL de un dominio fijo.
- Toda URL que llegue al widget pasa por `events.py` (lista blanca de dominios). No agregar
  dominios sin un test que pruebe que no abre un vector de phishing o exfiltración.
- Las API keys solo se leen en los `__main__.py` de los MCP servers. Nunca en prompts ni agentes.
- Toda salida de tool que vea un LLM pasa por `wrap_untrusted` (ya lo hace `ToolAgent`).
- Cualquier cambio a `guardian.py` u `output_filter.py` llega con casos de ataque **y** casos
  benignos en sus tests (no sacrificar mensajes normales como "olvida lo anterior, mejor
  comedias").
- Los tests no tocan red: `httpx.MockTransport` para APIs, `Client(server)` en proceso para MCP y
  `ScriptedLLM` para el modelo.
- Errores esperados de una API → `SourceError` con un mensaje en español que el agente pueda
  explicarle al usuario.
