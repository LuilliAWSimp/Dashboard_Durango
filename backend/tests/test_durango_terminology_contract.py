from app.services.durango_terminology import operational_volume_label


def test_volume_terminology_by_operational_module() -> None:
    assert operational_volume_label('well', scope='period') == 'Volumen bombeado del periodo'
    assert operational_volume_label('wells', validated=True) == 'Volumen bombeado validado'
    assert operational_volume_label('line', scope='interval') == 'Volumen consumido del intervalo'
    assert operational_volume_label('lavadoras', validated=True, scope='shift') == 'Volumen consumido validado del turno'
    assert operational_volume_label('jarabes', scope='day') == 'Volumen consumido del día'
