"""Guardián de entrada: primera barrera contra LLM01 (prompt injection) y LLM07 (fuga del prompt).

Dos capas en serie:
1. Heurísticas locales (gratis, deterministas, sin latencia) sobre el texto normalizado y sobre
   cualquier bloque base64 decodificado.
2. Un modelo clasificador de seguridad (``gpt-oss-safeguard-20b`` en Groq) para los ataques
   que no siguen un patrón conocido.

Si el clasificador falla (caída o límite del free tier) se deja pasar el mensaje: la heurística
ya lo revisó y detrás siguen los prompts endurecidos, el mínimo privilegio de las tools y el
filtro de salida. Bloquear a todos los usuarios cuando Groq tiene un mal día no es aceptable
para un producto que Maxine va a vender.
"""

import base64
import binascii
import json
import logging
import re
from dataclasses import dataclass
from typing import Literal

from agichat.agents.llm import LLM
from agichat.agents.prompts import GUARD_POLICY
from agichat.mcp_servers.text import normalize

logger = logging.getLogger(__name__)

Category = Literal["safe", "prompt_injection", "prompt_leak", "too_long"]

MAX_INPUT_CHARS = 2000

_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a"})
_BASE64_BLOCK = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")

_INJECTION = [
    # Solo sustantivos fuertes: "olvida lo anterior, mejor comedias" es un mensaje normal.
    r"\b(ignora|ignore|olvida|forget|omite|descarta|disregard|override|anula)\w*\b.{0,60}"
    r"\b(instrucciones|indicaciones|reglas|instructions|rules|prompt|directivas|restricciones"
    r"|restrictions|guidelines|programacion)\b",
    r"\b(a partir de ahora|desde ahora|from now on)\b.{0,40}\b(eres|seras|you are|you will be)\b",
    r"\b(ahora eres|you are now|now you are|ya no eres)\b",
    r"\b(modo|mode)\s+(desarrollador|developer|dios|god|sin restricciones|unrestricted|dan)\b",
    r"\b(jailbreak|do anything now)\b",
    r"\b(nuevas instrucciones|new instructions|system override|instrucciones del administrador)\b",
    r"(\[\s*(system|sistema)\s*\]|<\s*/?\s*(system|sistema)\s*>|#{2,}\s*(system|sistema)\b)",
    r"</?\s*datos_no_confiables",
]

_LEAK = [
    r"\b(system prompt|prompt (del|de) sistema|prompt (inicial|original)|tu prompt"
    r"|your prompt)\b",
    r"\b(tus|your|sus) (instrucciones|instructions|reglas internas|directivas)\b",
    r"\binstrucciones (del sistema|iniciales|originales|internas|ocultas|secretas)\b",
    r"\b(repite|repeat|imprime|print|muestra|show|revela|reveal|traduce|translate|resume"
    r"|summarize|escribe|write|copia|copy)\b.{0,50}\b(texto|text|todo|everything|lo)\s+"
    r"(de arriba|above|anterior|previo|before)\b",
    r"\b(identificador interno|canary|token secreto|secret token|api key|clave de api)\b",
]

_PATTERNS: list[tuple[Category, re.Pattern[str]]] = [
    *(("prompt_injection", re.compile(p)) for p in _INJECTION),
    *(("prompt_leak", re.compile(p)) for p in _LEAK),
]


@dataclass(frozen=True)
class GuardVerdict:
    category: Category
    reason: str

    @property
    def allowed(self) -> bool:
        return self.category == "safe"


def _decoded_base64_blocks(text: str) -> list[str]:
    decoded: list[str] = []
    for block in _BASE64_BLOCK.findall(text):
        try:
            raw = base64.b64decode(block + "=" * (-len(block) % 4), validate=True)
            candidate = raw.decode("utf-8")
        except (binascii.Error, UnicodeDecodeError):
            continue
        if candidate.isprintable():
            decoded.append(candidate)
    return decoded


def _scan_variants(text: str) -> list[str]:
    variants = [text, *_decoded_base64_blocks(text)]
    normalized = [re.sub(r"\s+", " ", normalize(v)) for v in variants]
    return normalized + [v.translate(_LEET) for v in normalized]


def heuristic_verdict(text: str) -> GuardVerdict:
    if len(text) > MAX_INPUT_CHARS:
        return GuardVerdict("too_long", f"más de {MAX_INPUT_CHARS} caracteres")
    for variant in _scan_variants(text):
        for category, pattern in _PATTERNS:
            if pattern.search(variant):
                return GuardVerdict(category, f"heurística: {pattern.pattern[:40]}")
    return GuardVerdict("safe", "heurística sin coincidencias")


def _parse_classifier(content: str) -> GuardVerdict:
    match = re.search(r"\{.*\}", content, re.DOTALL)
    if match is None:
        raise ValueError("el clasificador no devolvió JSON")
    data = json.loads(match.group(0))
    if not int(data.get("violation", 0)):
        return GuardVerdict("safe", "clasificador")
    category = data.get("category")
    if category not in ("prompt_injection", "prompt_leak"):
        category = "prompt_injection"
    return GuardVerdict(category, f"clasificador: {data.get('rationale', '')}"[:200])


class Guardian:
    def __init__(self, classifier: LLM | None = None) -> None:
        self._classifier = classifier

    async def inspect(self, text: str) -> GuardVerdict:
        verdict = heuristic_verdict(text)
        if not verdict.allowed or self._classifier is None:
            return verdict
        try:
            reply = await self._classifier.chat(
                [
                    {"role": "system", "content": GUARD_POLICY},
                    {"role": "user", "content": text},
                ]
            )
            return _parse_classifier(reply.content)
        except Exception:
            logger.warning("Clasificador de seguridad no disponible; se usa solo la heurística")
            return verdict
