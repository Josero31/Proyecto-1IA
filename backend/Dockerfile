# Una sola imagen para los 3 MCP servers y el sistema de agentes; docker-compose (Parte 2)
# elige el proceso con `command:` (agichat-tmdb-mcp, agichat-books-mcp, agichat-references-mcp).
FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

ENV MCP_HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1
USER nobody

CMD ["agichat-references-mcp"]
