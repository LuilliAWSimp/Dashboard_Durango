#!/usr/bin/env python3
"""Generate a reproducible runtime baseline for Dashboard ARCA Durango.

This tool is intentionally read-only: it follows frontend imports from the real
Vite entrypoint, records duplicate JS/TS or JSX/TSX pairs, and inventories the
FastAPI routers mounted by backend/app/main.py. It does not connect to SQL
Server or mutate project files unless --write is explicitly supplied.
"""
from __future__ import annotations

import argparse
import ast
import re
from collections import defaultdict, deque
from pathlib import Path

FRONTEND_EXTENSIONS = (".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".css")
CODE_EXTENSIONS = {".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx"}
IMPORT_RE = re.compile(
    r"(?:import\s+(?:[^'\"]+?\s+from\s+)?|export\s+[^'\"]*?\s+from\s+|import\s*\()"
    r"['\"]([^'\"]+)['\"]"
)
ROUTE_RE = re.compile(r"<Route\s+[^>]*?path=[\"']([^\"']+)[\"']")
API_LITERAL_RE = re.compile(r"['\"]((?:/api/v1)?/[A-Za-z0-9_{}?=&./:-]+)['\"]")


def project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_relative(source: Path, specifier: str) -> Path | None:
    if not specifier.startswith("."):
        return None
    base = (source.parent / specifier).resolve()
    candidates: list[Path] = []
    if base.suffix:
        candidates.append(base)
    else:
        candidates.extend(Path(str(base) + ext) for ext in FRONTEND_EXTENSIONS)
        candidates.extend(base / f"index{ext}" for ext in FRONTEND_EXTENSIONS)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def frontend_graph(root: Path) -> tuple[list[Path], list[tuple[Path, str, Path | None]]]:
    src_root = root / "frontend" / "src"
    entry = src_root / "main.jsx"
    if not entry.is_file():
        raise SystemExit("Missing frontend/src/main.jsx")
    seen: set[Path] = set()
    edges: list[tuple[Path, str, Path | None]] = []
    queue: deque[Path] = deque([entry.resolve()])
    while queue:
        current = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        if current.suffix not in CODE_EXTENSIONS:
            continue
        text = current.read_text(encoding="utf-8", errors="replace")
        for specifier in IMPORT_RE.findall(text):
            target = resolve_relative(current, specifier)
            edges.append((current, specifier, target))
            if target is not None and target not in seen:
                queue.append(target)
    return sorted(seen), edges


def duplicate_pairs(root: Path, reachable: set[Path]) -> list[tuple[str, list[Path], list[Path]]]:
    src_root = root / "frontend" / "src"
    families: dict[str, list[Path]] = defaultdict(list)
    for path in src_root.rglob("*"):
        if path.is_file() and path.suffix in {".js", ".ts", ".jsx", ".tsx"}:
            rel = path.relative_to(src_root)
            key = str(rel.with_suffix(""))
            families[key].append(path.resolve())
    rows = []
    for key, paths in sorted(families.items()):
        suffixes = {path.suffix for path in paths}
        is_pair = ({".js", ".ts"} <= suffixes) or ({".jsx", ".tsx"} <= suffixes)
        if not is_pair:
            continue
        active = [path for path in paths if path in reachable]
        rows.append((key, sorted(paths), sorted(active)))
    return rows


def app_routes(root: Path) -> list[str]:
    app = root / "frontend" / "src" / "App.jsx"
    if not app.is_file():
        return []
    return ROUTE_RE.findall(app.read_text(encoding="utf-8", errors="replace"))


def frontend_api_literals(root: Path, reachable: list[Path]) -> list[str]:
    values: set[str] = set()
    for path in reachable:
        if path.suffix not in CODE_EXTENSIONS:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for value in API_LITERAL_RE.findall(text):
            if value.startswith("/api/") or value.startswith("/auth/") or value.startswith("/water/") or value.startswith("/reports/") or value.startswith("/report-"):
                values.add(value)
    return sorted(values)


def backend_router_modules(root: Path) -> list[str]:
    main_path = root / "backend" / "app" / "main.py"
    tree = ast.parse(main_path.read_text(encoding="utf-8"))
    alias_to_module: dict[str, str] = {}
    included: list[str] = []
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app.api.routes."):
            for name in node.names:
                alias_to_module[name.asname or name.name] = node.module
        if isinstance(node, ast.Expr) and isinstance(node.value, ast.Call):
            call = node.value
            if isinstance(call.func, ast.Attribute) and call.func.attr == "include_router" and call.args:
                arg = call.args[0]
                if isinstance(arg, ast.Name):
                    module = alias_to_module.get(arg.id)
                    if module:
                        included.append(module)
    return included


def backend_routes(root: Path, modules: list[str]) -> list[tuple[str, str, str]]:
    results: list[tuple[str, str, str]] = []
    decorator_re = re.compile(r"@router\.(get|post|put|patch|delete)\(\s*['\"]([^'\"]+)['\"]")
    for module in modules:
        rel = Path(*module.split("."))
        path = root / "backend" / f"{rel}.py"
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for method, route in decorator_re.findall(text):
            results.append((module.rsplit(".", 1)[-1], method.upper(), route))
    return sorted(results)


def rel(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def make_markdown(root: Path, incremental: str = "actual") -> str:
    reachable, edges = frontend_graph(root)
    reachable_set = set(reachable)
    duplicates = duplicate_pairs(root, reachable_set)
    routes = app_routes(root)
    api_literals = frontend_api_literals(root, reachable)
    backend_modules = backend_router_modules(root)
    backend = backend_routes(root, backend_modules)
    unresolved = sorted({(rel(root, src), spec) for src, spec, target in edges if spec.startswith(".") and target is None})

    css_files = [path for path in reachable if path.suffix == ".css"]
    js_files = [path for path in reachable if path.suffix in CODE_EXTENSIONS]

    lines: list[str] = []
    lines += [
        f"# Línea base de runtime — Durango — Incremental {incremental}",
        "",
        "> Inventario técnico reproducible. No modifica SQL Server, BOS, sensores, cálculos ni comportamiento hidráulico.",
        "",
        "## Entradas confirmadas",
        "",
        "- Frontend Vite: `frontend/src/main.jsx`.",
        "- Aplicación/ruteo: `frontend/src/App.jsx`.",
        "- Backend FastAPI: `backend/app/main.py`.",
        "",
        "## Resumen frontend alcanzable",
        "",
        f"- Archivos alcanzables desde `main.jsx`: **{len(reachable)}**.",
        f"- Código JS/TS/JSX/TSX alcanzable: **{len(js_files)}**.",
        f"- Hojas CSS alcanzables por imports: **{len(css_files)}**.",
        f"- Imports relativos sin resolver: **{len(unresolved)}**.",
        "",
        "### CSS cargado por el runtime",
        "",
    ]
    for path in css_files:
        lines.append(f"- `{rel(root, path)}`")

    lines += ["", "### Rutas declaradas en `App.jsx`", ""]
    for route in routes:
        lines.append(f"- `{route}`")

    lines += ["", "## Pares JS/TS y JSX/TSX", ""]
    lines.append("La columna **runtime alcanzable** indica qué variante entra hoy en el grafo desde `main.jsx`; no autoriza todavía a borrar la otra variante.")
    lines.append("")
    lines.append("| Familia | Archivos presentes | Runtime alcanzable |")
    lines.append("|---|---|---|")
    for key, paths, active in duplicates:
        present = "<br>".join(f"`{rel(root, p)}`" for p in paths)
        active_text = "<br>".join(f"`{rel(root, p)}`" for p in active) if active else "—"
        lines.append(f"| `{key}` | {present} | {active_text} |")

    lines += ["", "## Archivos frontend alcanzables", ""]
    for path in reachable:
        lines.append(f"- `{rel(root, path)}`")

    lines += ["", "## Literales API encontrados en código frontend alcanzable", ""]
    if api_literals:
        for value in api_literals:
            lines.append(f"- `{value}`")
    else:
        lines.append("- No se detectaron literales API con el patrón conservador del auditor.")

    lines += ["", "## Routers montados por FastAPI", ""]
    for module in backend_modules:
        lines.append(f"- `{module}`")

    lines += ["", "### Rutas declaradas en routers montados", ""]
    lines.append("| Router | Método | Ruta local del router |")
    lines.append("|---|---|---|")
    for router, method, route in backend:
        lines.append(f"| `{router}` | `{method}` | `{route}` |")

    lines += ["", "## Imports relativos sin resolver", ""]
    if unresolved:
        for source, spec in unresolved:
            lines.append(f"- `{source}` → `{spec}`")
    else:
        lines.append("- Ninguno.")

    lines += [
        "",
        "## Decisiones de esta línea base",
        "",
        "1. No debe quedar ningún par `.js/.ts` o `.jsx/.tsx` duplicado sin justificación explícita.",
        "2. Todo archivo de código frontend existente debe ser alcanzable desde `main.jsx` o documentarse como excepción intencional.",
        "3. Los routers backend se registran según su montaje real; no se infiere que un router sea prescindible sólo porque la UI no lo invoque.",
        "4. `global.css` permanece como base heredada acotada; las responsabilidades específicas deben vivir en hojas modulares.",
        "5. Esta línea base es el punto de comparación para mantenimiento posterior al cierre de homologación.",
        "",
        "## Reproducción",
        "",
        "```powershell",
        f"python .\\tools\\audit_runtime_baseline.py --incremental {incremental} --write .\\docs\\RUNTIME_BASELINE_DURANGO_{incremental}.md",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", type=Path, help="Write the generated Markdown to this path.")
    parser.add_argument("--incremental", help="Incremental label used in the report title. If omitted, infer from --write when possible.")
    args = parser.parse_args()
    root = project_root()
    incremental = str(args.incremental or "").strip()
    if not incremental and args.write:
        match = re.search(r"RUNTIME_BASELINE_DURANGO_([^./\\]+)\.md$", args.write.name, re.IGNORECASE)
        if match:
            incremental = match.group(1)
    if not incremental:
        incremental = "actual"
    markdown = make_markdown(root, incremental)
    if args.write:
        target = args.write
        if not target.is_absolute():
            target = root / target
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(markdown + "\n", encoding="utf-8")
        try:
            display = target.relative_to(root).as_posix()
        except ValueError:
            display = str(target)
        print(display)
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
