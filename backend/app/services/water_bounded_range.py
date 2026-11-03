"""Lectura completa de históricos SQL por ventanas acotadas (solo lectura).

Un SELECT TOP sin comprobar el limite puede generar reportes incompletos sin
advertencia. Cada ventana se divide si alcanza el tope, conservando el intervalo
semiabierto [inicio, fin) y el orden temporal entre ventanas.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Callable


class IncompleteRangeError(RuntimeError):
    """No es posible asegurar que la lectura regresó todas las filas."""


def read_complete_window(
    start: datetime,
    end: datetime,
    fetch: Callable[[datetime, datetime], list[dict[str, Any]]],
    *,
    max_rows: int,
    chunk_days: int = 7,
) -> list[dict[str, Any]]:
    """Obtiene la totalidad de filas o falla explícitamente; jamás trunca.

    `fetch` debe realizar una consulta ordenada que retorne COMO MAXIMO
    `max_rows` filas dentro del intervalo semiabierto solicitado.
    """
    if end <= start:
        return []
    if max_rows < 1 or chunk_days < 1:
        raise ValueError('La configuración de lectura por bloques no es válida.')

    def complete_chunk(left: datetime, right: datetime) -> list[dict[str, Any]]:
        rows = fetch(left, right)
        if len(rows) < max_rows:
            return rows
        # El resultado podria contener mas registros que el TOP solicitado.
        # Se descarta el resultado truncado y se consultan dos mitades.
        midpoint = left + (right - left) / 2
        if midpoint <= left or midpoint >= right:
            raise IncompleteRangeError('Se alcanzó el límite de registros en el intervalo mínimo.')
        return complete_chunk(left, midpoint) + complete_chunk(midpoint, right)

    result: list[dict[str, Any]] = []
    cursor = start
    delta = timedelta(days=chunk_days)
    while cursor < end:
        next_cursor = min(cursor + delta, end)
        result.extend(complete_chunk(cursor, next_cursor))
        cursor = next_cursor
    return result
