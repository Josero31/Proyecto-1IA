import re
import unicodedata

_TAG = re.compile(r"<[^>]+>")
_SPACES = re.compile(r"\s+")


def normalize(text: str) -> str:
    """Minúsculas y sin tildes, para comparar nombres ("Ciencia ficción" == "ciencia ficcion")."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def clean_text(text: str | None, max_chars: int) -> str:
    """Quita HTML y recorta. Las sinopsis largas solo gastan contexto (y amplían la superficie
    para una inyección indirecta)."""
    if not text:
        return ""
    plain = _SPACES.sub(" ", _TAG.sub(" ", text)).strip()
    if len(plain) <= max_chars:
        return plain
    return plain[: max_chars - 1].rstrip() + "…"


def year_of(date: str | None) -> int | None:
    if date and len(date) >= 4 and date[:4].isdigit():
        return int(date[:4])
    return None
