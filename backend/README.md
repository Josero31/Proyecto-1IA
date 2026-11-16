# Backend de AGIChat: sistema multiagente y MCP servers

Sistema de IA que recomienda películas con la API de
[The Movie Database (TMDB)](https://www.themoviedb.org/), las compara con el libro en que se
basan (Google Books), muestra el póster oficial y abre IMDb o Google Books en una pestaña nueva
del navegador. Está reforzado contra **LLM01 (prompt injection)** y **LLM07 (fuga del system
prompt)** del OWASP Top 10 for LLMs.

> This product uses the TMDB API but is not endorsed or certified by TMDB.

## Contenido

- [Arquitectura de los agentes](#arquitectura-de-los-agentes)
- [MCP servers](#mcp-servers)
- [Contrato con la Parte 2 (gateway y widget)](#contrato-con-la-parte-2-gateway-y-widget)
- [Cómo correrlo](#cómo-correrlo)
- [Calidad, tests y cobertura](#calidad-tests-y-cobertura)
- [Estructura de carpetas](#estructura-de-carpetas)

## Arquitectura de los agentes

Organización **jerárquica y centralizada** con un pipeline de seguridad en serie:

```
Guardián de entrada ─► Supervisor ─┬─► Agente Recomendador ─► tmdb-mcp
  (LLM01 / LLM07)          │       └─► Agente Crítico ───────► tmdb-mcp + books-mcp
                           ├─► references-mcp (open_imdb, open_google_books)
                           └─► Filtro de salida ─► eventos al widget
```

El diagrama de bajo nivel completo, la justificación de la clasificación, la matriz de permisos
por agente y la tabla de defensas OWASP están en
[`docs/arquitectura-agentes.md`](docs/arquitectura-agentes.md). También hay versión PNG para la
presentación: [`organizacion-agentes.png`](docs/organizacion-agentes.png) y
[`secuencia-turno.png`](docs/secuencia-turno.png).

| Pieza                             | Modelo (Groq, free tier)                     | Archivo                               |
| --------------------------------- | -------------------------------------------- | ------------------------------------- |
| Guardián de entrada               | heurísticas + `openai/gpt-oss-safeguard-20b` | `src/agichat/agents/guardian.py`      |
| Supervisor                        | `openai/gpt-oss-120b`                        | `src/agichat/agents/factory.py`       |
| Agente Recomendador               | `openai/gpt-oss-120b`                        | `src/agichat/agents/factory.py`       |
| Agente Crítico Libro vs. Película | `openai/gpt-oss-120b`                        | `src/agichat/agents/factory.py`       |
| Filtro de salida                  | sin LLM (determinista)                       | `src/agichat/agents/output_filter.py` |
| Bucle de razonamiento + tools     | —                                            | `src/agichat/agents/agent.py`         |

## MCP servers

Las herramientas están abstraídas en **3 MCP servers independientes** (SDK oficial `mcp` 2.x,
transporte Streamable HTTP en modo **sin estado**), para que otros agentes de AGIChat los
puedan reutilizar después sin tocar este código.

| Server           | Puerto | Tools                                                                                          | Clave externa                     |
| ---------------- | ------ | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| `tmdb-mcp`       | 8101   | `search_movie`, `discover_movies`, `get_recommendations`, `get_movie_details`, `present_movie` | `TMDB_READ_ACCESS_TOKEN`          |
| `books-mcp`      | 8102   | `search_book`, `get_book`                                                                      | `GOOGLE_BOOKS_API_KEY` (opcional) |
| `references-mcp` | 8103   | `open_imdb`, `open_google_books`                                                               | ninguna                           |

Decisiones:

- **Todas las tools son de solo lectura** y validan sus argumentos con schemas estrictos
  (longitudes, rangos, regex para ids). `references-mcp` no recibe URLs, solo ids, y arma la URL
  de un sitio fijo.
- **Caché y cuota compartidas en Redis** (`cache.py`, `mcp_servers/http_source.py`): solo las
  requests que no están en caché cuentan contra el tope diario (1000 por API, configurable). Si
  50 usuarios piden _Dune_, TMDB recibe una request. Sin `REDIS_URL` se usa caché en memoria
  (solo para desarrollo).
- **Las API keys solo existen en los MCP servers.** Los agentes nunca las ven, así que no hay
  nada que filtrar desde el prompt.
- **`stateless_http=True`**: cualquier réplica atiende cualquier request, sin sesiones pegajosas.
  Se escalan horizontalmente detrás de un balanceador.

## Contrato con la Parte 2 (gateway y widget)

### Uso desde el gateway

```python
from agichat.agents.factory import create_orchestrator

# Mensaje de bienvenida que anuncia la comparación con el libro:
from agichat.agents.prompts import WELCOME_MESSAGE

# sessions: implementación de SessionStore sobre Redis (Parte 2). Una vez por proceso:
async with create_orchestrator(sessions=redis_sessions) as orchestrator:
    async for event in orchestrator.run_turn(session_id, texto_del_usuario):
        await websocket.send_json(event.model_dump())
```

`sessions` es opcional; si no se pasa, se usa `InMemorySessionStore`. Para que el gateway no
tenga estado, la Parte 2 implementa el protocolo `SessionStore` (`load` / `save`) sobre Redis.

### Eventos (servidor → widget)

Definidos con Pydantic en [`src/agichat/agents/events.py`](src/agichat/agents/events.py):

```jsonc
// Texto: contenido ACUMULADO (no delta), mismo id en todo el mensaje, igual que el mock del SDK
{"type": "text", "id": "agent-3f9c…", "content": "Te recomiendo **Dune**…", "status": "streaming" | "complete" | "error"}

// Tarjeta con póster (máx. 3 por mensaje). Llega DESPUÉS del texto "complete" con el mismo id
{"type": "movie_card", "messageId": "agent-3f9c…", "card": {
  "tmdbId": 438631, "title": "Dune", "year": 2021,
  "posterUrl": "https://image.tmdb.org/t/p/w500/….jpg",   // siempre de image.tmdb.org o null
  "overview": "…", "rating": 7.8,
  "imdbUrl": "https://www.imdb.com/title/tt1160419/",     // o null
  "tmdbUrl": "https://www.themoviedb.org/movie/438631"
}}

// Abrir pestaña: llega en cuanto el agente lo decide, antes del texto
{"type": "open_url", "url": "https://www.imdb.com/title/tt1160419/", "site": "imdb" | "google_books"}
```

El backend ya valida los dominios, pero el widget debe volver a validarlos (defensa en
profundidad): póster con prefijo `https://image.tmdb.org/t/p/`, `open_url` solo hacia
`www.imdb.com` y `books.google.com` por https.

### Para los evals (Parte 2)

- `build_orchestrator(toolbox, llm, guard_llm)` permite armar el sistema con Groq real y los MCP
  servers en el mismo proceso (`McpToolbox({"tmdb": build_server(...), ...})`).
- `Guardian().inspect(texto)` y `OutputFilter(...).apply(texto)` se pueden evaluar por separado.
- Respuestas fijas para comparar en los evals: `INJECTION_REFUSAL`, `LEAK_REFUSAL` y
  `TOO_LONG_REFUSAL` en `prompts.py`. Un ataque exitoso de LLM07 se detecta si aparece el canary
  (`AGX-` + 16 hex) o un fragmento del prompt en la respuesta.

## Cómo correrlo

Requiere Python 3.12+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env                                   # llenar GROQ_API_KEY y TMDB_READ_ACCESS_TOKEN
```

Claves (todas gratuitas, **sin tarjeta de crédito**):

- **TMDB:** en _Settings → API_ crear una key de uso **no comercial** indicando que son
  estudiantes del curso CC3116 de la Universidad del Valle de Guatemala. Copiar el
  **API Read Access Token**.
- **Google Books:** opcional; sin key funciona con una cuota menor.
- **Groq:** `console.groq.com` → API Keys. La key completa solo se muestra al crearla.

Levantar los MCP servers (una terminal cada uno, o con docker-compose de la Parte 2):

```bash
agichat-tmdb-mcp          # http://127.0.0.1:8101/mcp
agichat-books-mcp         # http://127.0.0.1:8102/mcp
agichat-references-mcp    # http://127.0.0.1:8103/mcp
```

Levantar el gateway WebSocket (con los 3 MCP servers corriendo y un Redis en `REDIS_URL`):

```bash
agichat-gateway           # ws://0.0.0.0:8000/ws · GET /health
```

Probar el sistema completo desde la terminal (sin widget):

```bash
agichat-chat
```

Imagen de Docker (una para los 3 servers, se elige el proceso con el comando):

```bash
docker build -t agichat-backend backend
docker run --env-file backend/.env -p 8101:8101 -e TMDB_MCP_PORT=8101 agichat-backend agichat-tmdb-mcp
```

## Calidad, tests y cobertura

```bash
ruff check .               # lint
ruff format --check .      # formato
pytest --cov               # tests + cobertura (falla si baja de 80%)
```

- Los tests **no usan red ni gastan cuota**: las APIs externas se simulan con
  `httpx.MockTransport`, los MCP servers corren en el mismo proceso (`Client(server)`) y el LLM es
  un guion por agente (`tests/agents/fake_llm.py`).
- Se excluyen de la cobertura solo los puntos de entrada de proceso (`__main__.py`, `cli.py`),
  igual que `src/index.ts` en el SDK.

## Estructura de carpetas

```
backend/
├── docs/                     # Diagrama de agentes (Mermaid + PNG) y defensas OWASP
├── src/agichat/
│   ├── config.py             # Variables de entorno (.env)
│   ├── cache.py              # Caché + contador diario (memoria o Redis)
│   ├── cli.py                # Chat de terminal para pruebas manuales
│   ├── mcp_servers/
│   │   ├── http_source.py    # GET con caché, cuota y errores legibles para el agente
│   │   ├── tmdb/             # service.py (API) · server.py (tools MCP) · __main__.py
│   │   ├── books/            # ídem para Google Books
│   │   └── references/       # open_imdb / open_google_books
│   └── agents/
│       ├── events.py         # Contrato de eventos con el widget
│       ├── llm.py            # Cliente OpenAI-compatible (Groq)
│       ├── tools.py          # McpToolbox, TurnContext, validación de acciones de UI
│       ├── agent.py          # ToolAgent (bucle con tools) y SubAgentTool (delegación)
│       ├── prompts.py        # Prompts, canary y respuestas fijas
│       ├── guardian.py       # Guardián de entrada (LLM01/LLM07)
│       ├── output_filter.py  # Filtro de salida (LLM07 + exfiltración)
│       ├── untrusted.py      # Envoltura de datos no confiables
│       ├── orchestrator.py   # run_turn: guardián → supervisor → filtro → eventos
│       └── factory.py        # Arma el sistema y asigna tools por agente
└── tests/                    # Un archivo de test por módulo
```
