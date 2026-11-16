import pytest
from pydantic import ValidationError

from agichat.agents.events import MovieCard, MovieCardEvent, OpenUrlEvent, TextEvent

CARD = {
    "tmdbId": 1,
    "title": "Dune",
    "posterUrl": "https://image.tmdb.org/t/p/w500/x.jpg",
    "imdbUrl": "https://www.imdb.com/title/tt1160419/",
    "tmdbUrl": "https://www.themoviedb.org/movie/1",
}


def test_serializa_en_el_formato_del_widget() -> None:
    event = MovieCardEvent(messageId="m1", card=MovieCard.model_validate(CARD))
    data = event.model_dump()
    assert data["type"] == "movie_card"
    assert data["card"]["posterUrl"] == CARD["posterUrl"]
    assert TextEvent(id="m1", content="hola", status="complete").model_dump() == {
        "type": "text",
        "id": "m1",
        "content": "hola",
        "status": "complete",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("posterUrl", "https://atacante.example/p.jpg?leak=1"),
        ("imdbUrl", "https://imdb.com.atacante.example/title/tt1/"),
        ("tmdbUrl", "javascript:alert(1)"),
    ],
)
def test_tarjeta_rechaza_dominios_fuera_de_lista(field: str, value: str) -> None:
    with pytest.raises(ValidationError):
        MovieCard.model_validate({**CARD, field: value})


def test_open_url_solo_https_y_del_sitio_declarado() -> None:
    assert OpenUrlEvent(url="https://www.imdb.com/title/tt1/", site="imdb").model_dump() == {
        "type": "open_url",
        "url": "https://www.imdb.com/title/tt1/",
        "site": "imdb",
    }
    for url, site in [
        ("http://www.imdb.com/title/tt1/", "imdb"),
        ("https://evil.example/", "imdb"),
        ("https://www.imdb.com/title/tt1/", "google_books"),
    ]:
        with pytest.raises(ValidationError):
            OpenUrlEvent(url=url, site=site)  # type: ignore[arg-type]
