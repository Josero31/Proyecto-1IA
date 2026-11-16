TAG = "datos_no_confiables"
MAX_CHARS = 6000


def wrap_untrusted(source: str, text: str) -> str:
    """Encierra la salida de una tool entre delimitadores para que el modelo la trate como datos.

    Defensa contra inyección indirecta (LLM01): una sinopsis de TMDB o la descripción de un libro
    podría contener "ignora tus instrucciones...". Los prompts de los agentes dicen que lo que va
    dentro de estas etiquetas nunca son instrucciones, y aquí se neutraliza cualquier intento de
    cerrar la etiqueta desde adentro.
    """
    body = text.replace(f"</{TAG}", f"&lt;/{TAG}").replace(f"<{TAG}", f"&lt;{TAG}")
    if len(body) > MAX_CHARS:
        body = body[:MAX_CHARS] + "…[recortado]"
    return f'<{TAG} fuente="{source}">\n{body}\n</{TAG}>'
