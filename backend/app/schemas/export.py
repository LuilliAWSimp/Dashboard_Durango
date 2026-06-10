from pydantic import BaseModel, EmailStr


class EmailReportRequest(BaseModel):
    to: EmailStr
    subject: str = 'Reporte de dashboard eléctrico'
    message: str = 'Se adjunta reporte generado desde el dashboard.'
    plant_id: str | None = 'gdl-demo'
    section: str = 'dashboard'
    format: str = 'pdf'
