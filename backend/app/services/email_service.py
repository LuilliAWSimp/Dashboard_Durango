from __future__ import annotations

import smtplib
from email.message import EmailMessage
from pathlib import Path

from app.config import get_settings


settings = get_settings()


def send_email_with_attachment(to: str, subject: str, message: str, attachment: Path) -> str:
    if not settings.smtp_username or not settings.smtp_password:
        return 'SMTP no configurado. Se generó el archivo pero no se envió el correo.'

    email = EmailMessage()
    email['From'] = settings.smtp_from
    email['To'] = to
    email['Subject'] = subject
    email.set_content(message)

    with attachment.open('rb') as f:
        data = f.read()
        email.add_attachment(data, maintype='application', subtype='octet-stream', filename=attachment.name)

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(email)
    return 'Correo enviado correctamente.'
