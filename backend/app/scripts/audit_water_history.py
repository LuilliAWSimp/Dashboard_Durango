"""CLI de solo lectura para auditar el historico de agua de Durango.

Ejemplos:
    cd backend
    python -m app.scripts.audit_water_history
    python -m app.scripts.audit_water_history --markdown ../docs/AUDITORIA_HISTORICA_DURANGO_RESULTADO.md
    python -m app.scripts.audit_water_history --json ../docs/auditoria_historica_durango.json
"""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from app.services.durango_history_audit import render_audit_markdown, run_history_audit


def _date_arg(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError('Usa fecha YYYY-MM-DD.') from exc


def _write(path_value: str | None, content: str) -> None:
    if not path_value:
        return
    path = Path(path_value).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
    print(f'Guardado: {path}')


def main() -> None:
    parser = argparse.ArgumentParser(description='Auditoria historica de solo lectura para Planta Durango.')
    parser.add_argument('--start-date', type=_date_arg, default=None, help='Inicio local YYYY-MM-DD. Por defecto usa el corte SCADA validado.')
    parser.add_argument('--end-date', type=_date_arg, default=None, help='Fin local YYYY-MM-DD. Por defecto usa hoy.')
    parser.add_argument('--coverage-threshold', type=float, default=95.0, help='Umbral de cobertura completa. Default: 95.')
    parser.add_argument('--json', dest='json_path', default=None, help='Ruta opcional para guardar JSON.')
    parser.add_argument('--markdown', dest='markdown_path', default=None, help='Ruta opcional para guardar Markdown.')
    args = parser.parse_args()

    payload = run_history_audit(
        start_date=args.start_date,
        end_date=args.end_date,
        coverage_threshold=args.coverage_threshold,
    )
    markdown = render_audit_markdown(payload)

    _write(args.json_path, json.dumps(payload, ensure_ascii=False, indent=2))
    _write(args.markdown_path, markdown)

    if not args.json_path and not args.markdown_path:
        print(markdown)


if __name__ == '__main__':
    main()
