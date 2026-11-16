from pathlib import Path
from typing import Any

import yaml

from evals.models import Case

CASES_DIR = Path(__file__).parent / "cases"


def load_cases(directory: Path = CASES_DIR) -> list[Case]:
    """Un archivo YAML por categoría; el nombre del archivo es el nombre de la categoría."""
    cases: list[Case] = []
    for path in sorted(directory.glob("*.yaml")):
        raw: list[dict[str, Any]] = yaml.safe_load(path.read_text(encoding="utf-8"))
        cases.extend(
            Case(
                id=item["id"],
                category=path.stem,
                turns=tuple(item["turns"]),
                expect=item["expect"],
                attack_markers=tuple(item.get("attack_markers", ())),
                tmdb_poison=item.get("tmdb_poison"),
            )
            for item in raw
        )
    return cases
