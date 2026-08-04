from __future__ import annotations

from pydantic import BaseModel, EmailStr, field_validator


class EmailReportRequest(BaseModel):
    to: EmailStr
    subject: str = 'Reporte Dashboard ARCA Durango'
    message: str = 'Se adjunta reporte generado desde el dashboard.'
    plant_id: str | None = 'durango-operativo'
    section: str = 'dashboard'
    format: str = 'pdf'


class DailyWaterReportEmailRequest(BaseModel):
    to: str | list[str]
    cc: str | list[str] | None = None
    subject: str | None = None
    message: str | None = None
    date: str | None = None
    start_date: str | None = None
    end_date: str | None = None

    @field_validator('to')
    @classmethod
    def validate_to(cls, value: str | list[str]):
        if isinstance(value, str):
            if not value.strip():
                raise ValueError('Debes indicar al menos un destinatario.')
            return value
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        if not cleaned:
            raise ValueError('Debes indicar al menos un destinatario.')
        return cleaned

    @field_validator('subject', 'message')
    @classmethod
    def normalize_optional_text(cls, value: str | None):
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
