"""Modulo heredado del antiguo /water/export de Durango.

El router ya no se registra en ``app.main``. Se mantiene este archivo de forma
transitoria para que un despliegue incremental por sobreescritura no deje una
implementacion con datos demostrativos disponible por accidente.
"""

from fastapi import APIRouter

router = APIRouter(prefix='/water', tags=['water-export-legacy-disabled'])
