from typing import Any
from urllib.parse import urlencode

import httpx
from mcp.server.mcpserver.exceptions import ToolError

from agichat.cache import Cache


class SourceError(ToolError):
    """Error esperado de una API externa. Su mensaje llega tal cual al agente que llamó la tool."""


class CachedJsonSource:
    """GET a una API JSON con caché compartida y tope diario de requests reales.

    Solo las requests que no están en caché cuentan contra la cuota: si 50 usuarios piden la
    misma película, TMDB recibe una sola request.
    """

    def __init__(
        self,
        *,
        label: str,
        http: httpx.AsyncClient,
        cache: Cache,
        daily_limit: int,
        ttl_seconds: int,
        secret_params: dict[str, str] | None = None,
    ) -> None:
        self._label = label
        self._http = http
        self._cache = cache
        self._daily_limit = daily_limit
        self._ttl_seconds = ttl_seconds
        # Se mandan en la request pero nunca forman parte de la llave de caché.
        self._secret_params = secret_params or {}

    async def get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        clean = {k: v for k, v in (params or {}).items() if v is not None}
        key = f"{self._label.lower()}:{path}?{urlencode(sorted(clean.items()))}"
        cached = await self._cache.get_json(key)
        if cached is not None:
            return cached

        if await self._cache.incr_daily(f"{self._label.lower()}:quota") > self._daily_limit:
            raise SourceError(
                f"Se alcanzó el límite diario de consultas a {self._label}. Intenta mañana."
            )

        try:
            response = await self._http.get(path, params={**clean, **self._secret_params})
        except httpx.HTTPError as exc:
            raise SourceError(f"{self._label} no respondió. Intenta de nuevo más tarde.") from exc

        if response.status_code == 404:
            raise SourceError(f"No se encontró el recurso solicitado en {self._label}.")
        if response.status_code in (401, 403):
            raise SourceError(f"Credenciales de {self._label} inválidas o sin permiso.")
        if response.status_code == 429:
            raise SourceError(f"{self._label} limitó la velocidad de consultas. Intenta luego.")
        if response.is_error:
            raise SourceError(f"{self._label} respondió con un error ({response.status_code}).")

        data = response.json()
        await self._cache.set_json(key, data, self._ttl_seconds)
        return data
