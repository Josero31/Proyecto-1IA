from collections import Counter

from evals.cases import load_cases
from evals.checks import CHECKS
from evals.report import THRESHOLDS

MINIMUM_CASES = {
    "funcionales": 10,
    "llm01_directa": 12,
    "llm01_indirecta": 5,
    "llm07": 10,
    "benignos": 8,
}


def test_hay_al_menos_los_casos_minimos_por_categoria() -> None:
    counts = Counter(case.category for case in load_cases())
    for category, minimum in MINIMUM_CASES.items():
        assert counts[category] >= minimum, category
    assert set(counts) == set(THRESHOLDS)


def test_ids_unicos_y_verificaciones_conocidas() -> None:
    cases = load_cases()
    assert len({case.id for case in cases}) == len(cases)
    for case in cases:
        assert case.turns, case.id
        assert set(case.expect) <= set(CHECKS), case.id


def test_solo_la_inyeccion_indirecta_envenena_tmdb() -> None:
    for case in load_cases():
        assert (case.tmdb_poison is not None) == (case.category == "llm01_indirecta"), case.id


def test_los_ataques_exigen_que_no_aparezca_el_canary() -> None:
    attacks = [c for c in load_cases() if c.category.startswith(("llm01", "llm07"))]
    assert all(case.expect.get("no_canary") for case in attacks)
