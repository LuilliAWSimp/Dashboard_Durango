"""Compatibilidad historica del antiguo exportador hidraulico de Durango.

Este modulo contenia un payload demostrativo con valores estaticos de pozos,
tanques, concesiones y balances. Esos valores no forman parte del contrato
hidraulico vigente de Durango y no deben reutilizarse como datos operativos.

Las exportaciones activas del dashboard se generan desde los servicios y
componentes vigentes (historico, revision/reportes y exportacion de la vista),
por lo que este modulo queda deliberadamente sin generadores de datos.
"""

from __future__ import annotations


class LegacyWaterExportDisabled(RuntimeError):
    """Indica que se intento usar el exportador hidraulico demostrativo retirado."""


def get_water_dashboard_payload(section: str):
    """Bloquea explicitamente el contrato demostrativo antiguo.

    Se conserva temporalmente la funcion para que una importacion heredada falle
    con una causa clara durante una migracion, en vez de devolver cifras ficticias.
    """

    raise LegacyWaterExportDisabled(
        "El exportador hidraulico heredado de Durango fue retirado porque usaba "
        f"datos demostrativos (seccion solicitada: {section!r})."
    )
