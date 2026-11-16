"""Corre los evals contra el sistema real: ``python -m evals.run``.

Gasta cuota de Groq y TMDB, así que los casos se corren de uno en uno, con una pausa entre ellos.
"""

import argparse
import asyncio
import sys
from datetime import datetime
from pathlib import Path

from agichat.config import Settings
from evals.cases import load_cases
from evals.checks import run_checks
from evals.harness import SystemPool, run_case
from evals.models import Case
from evals.report import (
    ATTACK_CATEGORIES,
    Attempt,
    Outcome,
    build_report,
    render_markdown,
    write_reports,
)

REPORTS_DIR = Path(__file__).parent / "reports"


async def evaluate(
    cases: list[Case], pool: SystemPool, *, defenses: bool, repeats: int, delay: float
) -> list[Outcome]:
    outcomes: list[Outcome] = []
    for case in cases:
        system = await pool.get(case.tmdb_poison, defenses)
        attempts: list[Attempt] = []
        for _ in range(repeats):
            transcript = await run_case(system, case)
            attempts.append(Attempt(transcript, run_checks(transcript, case.expect)))
            await asyncio.sleep(delay)
        outcome = Outcome(case, attempts)
        outcomes.append(outcome)
        label = "defensas" if defenses else "sin defensas"
        print(f"[{label}] {'OK  ' if outcome.passed else 'FALLA'} {case.id}", flush=True)
    return outcomes


async def run(args: argparse.Namespace) -> int:
    settings = Settings()
    missing = [
        name
        for name, value in (
            ("GROQ_API_KEY", settings.groq_api_key),
            ("TMDB_READ_ACCESS_TOKEN", settings.tmdb_read_access_token),
        )
        if not value.get_secret_value()
    ]
    if missing:
        print(f"Faltan variables de entorno: {', '.join(missing)} (ver backend/.env.example).")
        return 2

    cases = load_cases()
    if args.categories:
        cases = [c for c in cases if c.category in args.categories]

    async with SystemPool(settings) as pool:
        outcomes = await evaluate(
            cases, pool, defenses=True, repeats=args.repeats, delay=args.delay
        )
        attacks = [c for c in cases if c.category in ATTACK_CATEGORIES]
        baseline = (
            []
            if args.skip_baseline
            else await evaluate(attacks, pool, defenses=False, repeats=1, delay=args.delay)
        )

    report = build_report(
        outcomes,
        baseline,
        repeats=args.repeats,
        generated_at=datetime.now().astimezone(),
        models={"agent": settings.agent_model, "guard": settings.guard_model},
    )
    markdown, data = write_reports(report, Path(args.reports_dir))
    print("\n" + render_markdown(report))
    print(f"Reportes: {markdown} y {data}")
    return 0 if report["ok"] else 1


def main() -> None:
    parser = argparse.ArgumentParser(description="Evals funcionales y OWASP LLM01/LLM07")
    parser.add_argument("--repeats", type=int, default=2, help="veces que se corre cada caso")
    parser.add_argument("--delay", type=float, default=2.0, help="segundos entre corridas")
    parser.add_argument("--categories", nargs="*", help="solo estas categorías (nombre del YAML)")
    parser.add_argument(
        "--skip-baseline", action="store_true", help="omitir la corrida sin defensas"
    )
    parser.add_argument("--reports-dir", default=str(REPORTS_DIR))
    sys.exit(asyncio.run(run(parser.parse_args())))


if __name__ == "__main__":
    main()
