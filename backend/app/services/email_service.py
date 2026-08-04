from __future__ import annotations

import logging
import smtplib
import socket
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from pathlib import Path
from typing import Iterable

from app.config import get_settings


settings = get_settings()
logger = logging.getLogger(__name__)


class EmailServiceError(RuntimeError):
    """Base error for SMTP delivery failures."""


class EmailNotConfiguredError(EmailServiceError):
    """Raised when SMTP variables are missing."""


class EmailDeliveryError(EmailServiceError):
    """Raised when SMTP configuration or delivery fails."""


@dataclass(frozen=True)
class EmailSendResult:
    message: str
    message_id: str


def _normalize_recipients(value: str | Iterable[str] | None) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        parts = value.replace(';', ',').split(',')
    else:
        parts = []
        for item in value:
            parts.extend(str(item).replace(';', ',').split(','))
    return [part.strip() for part in parts if part and part.strip()]


def ensure_smtp_configured() -> None:
    missing = []
    for name, value in (
        ('SMTP_HOST', settings.smtp_host),
        ('SMTP_PORT', settings.smtp_port),
        ('SMTP_USERNAME', settings.smtp_username),
        ('SMTP_PASSWORD', settings.smtp_password),
        ('SMTP_FROM', settings.smtp_from),
    ):
        if not value:
            missing.append(name)
    if missing:
        logger.warning('SMTP configuration incomplete missing=%s', missing)
        raise EmailNotConfiguredError('SMTP no configurado. Revisa las variables de correo del backend.')
    if settings.smtp_use_ssl and settings.smtp_use_starttls:
        raise EmailDeliveryError('La configuración SMTP no puede activar SSL implícito y STARTTLS al mismo tiempo.')


def _smtp_mode() -> tuple[bool, str]:
    ensure_smtp_configured()
    use_implicit_ssl = bool(settings.smtp_use_ssl or settings.smtp_port == 465)
    if use_implicit_ssl and settings.smtp_use_starttls:
        raise EmailDeliveryError('La configuración SMTP no puede aplicar STARTTLS sobre una conexión SSL implícita.')
    return use_implicit_ssl, 'ssl' if use_implicit_ssl else ('starttls' if settings.smtp_use_starttls else 'plain')


def _message_id_domain() -> str:
    sender = str(settings.smtp_from or '')
    return sender.split('@', 1)[1] if '@' in sender else 'localhost'


def _log_error(exc: BaseException, *, mode: str, message_id: str, recipients: list[str], cc: list[str], subject: str, filename: str) -> None:
    logger.error(
        'SMTP report failed message_id=%s exception_type=%s host=%s port=%s ssl=%s starttls=%s '
        'sender=%s recipients=%s cc=%s subject=%s attachment=%s timeout_seconds=30',
        message_id,
        type(exc).__name__,
        settings.smtp_host,
        settings.smtp_port,
        mode == 'ssl',
        mode == 'starttls',
        settings.smtp_from,
        recipients,
        cc,
        subject,
        filename,
    )


def _send_message(email: EmailMessage, recipients: list[str], cc: list[str], filename: str) -> str:
    use_implicit_ssl, mode = _smtp_mode()
    context = ssl.create_default_context()
    message_id = str(email.get('Message-ID') or make_msgid(domain=_message_id_domain()))
    if not email.get('Message-ID'):
        email['Message-ID'] = message_id
    if not email.get('Date'):
        email['Date'] = formatdate(localtime=True)
    subject = str(email.get('Subject') or '')
    all_recipients = [*recipients, *cc]

    logger.info(
        'SMTP report attempt message_id=%s host=%s port=%s ssl=%s starttls=%s sender=%s '
        'recipients=%s cc=%s subject=%s attachment=%s timeout_seconds=30',
        message_id,
        settings.smtp_host,
        settings.smtp_port,
        mode == 'ssl',
        mode == 'starttls',
        settings.smtp_from,
        recipients,
        cc,
        subject,
        filename,
    )

    try:
        if use_implicit_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=30, context=context) as server:
                server.login(settings.smtp_username, settings.smtp_password)
                refused = server.send_message(email, from_addr=settings.smtp_from, to_addrs=all_recipients)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
                server.ehlo()
                if settings.smtp_use_starttls:
                    server.starttls(context=context)
                    server.ehlo()
                server.login(settings.smtp_username, settings.smtp_password)
                refused = server.send_message(email, from_addr=settings.smtp_from, to_addrs=all_recipients)

        if refused:
            rejected = sorted(str(address) for address in refused)
            logger.warning(
                'SMTP report recipients rejected message_id=%s rejected=%s host=%s port=%s sender=%s subject=%s',
                message_id,
                rejected,
                settings.smtp_host,
                settings.smtp_port,
                settings.smtp_from,
                subject,
            )
            raise EmailDeliveryError('El servidor SMTP rechazó uno o más destinatarios.')

        logger.info(
            'SMTP report accepted message_id=%s host=%s port=%s ssl=%s starttls=%s sender=%s '
            'recipients=%s cc=%s subject=%s attachment=%s send_result=%s',
            message_id,
            settings.smtp_host,
            settings.smtp_port,
            mode == 'ssl',
            mode == 'starttls',
            settings.smtp_from,
            recipients,
            cc,
            subject,
            filename,
            refused,
        )
        return message_id
    except EmailDeliveryError:
        raise
    except smtplib.SMTPAuthenticationError as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('No fue posible autenticar con el servidor SMTP. Revisa el usuario, la contraseña y los permisos de la cuenta.') from exc
    except ssl.SSLError as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('No fue posible establecer la conexión segura SSL/TLS con el servidor SMTP.') from exc
    except (socket.timeout, TimeoutError) as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('El servidor SMTP no respondió dentro del tiempo permitido.') from exc
    except ConnectionRefusedError as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('El servidor SMTP rechazó la conexión. Revisa el host, el puerto o el firewall.') from exc
    except smtplib.SMTPRecipientsRefused as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('El servidor SMTP rechazó uno o más destinatarios.') from exc
    except smtplib.SMTPSenderRefused as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('El servidor SMTP rechazó la dirección remitente configurada.') from exc
    except (smtplib.SMTPException, OSError) as exc:
        _log_error(exc, mode=mode, message_id=message_id, recipients=recipients, cc=cc, subject=subject, filename=filename)
        raise EmailDeliveryError('No fue posible enviar el correo.') from exc


def send_email_with_bytes_attachment(
    to: str | Iterable[str],
    subject: str,
    message: str,
    attachment_bytes: bytes,
    filename: str,
    *,
    cc: str | Iterable[str] | None = None,
    maintype: str = 'application',
    subtype: str = 'pdf',
) -> EmailSendResult:
    recipients = _normalize_recipients(to)
    cc_recipients = _normalize_recipients(cc)
    if not recipients:
        raise EmailDeliveryError('Debes indicar al menos un destinatario válido.')

    email = EmailMessage()
    email['From'] = settings.smtp_from
    email['To'] = ', '.join(recipients)
    if cc_recipients:
        email['Cc'] = ', '.join(cc_recipients)
    email['Subject'] = subject
    email['Date'] = formatdate(localtime=True)
    email['Message-ID'] = make_msgid(domain=_message_id_domain())
    email['X-Report-Source'] = 'Dashboard ARCA Durango'
    email.set_content(message or 'Se adjunta reporte generado desde el dashboard.')
    email.add_attachment(attachment_bytes, maintype=maintype, subtype=subtype, filename=filename)

    message_id = _send_message(email, recipients, cc_recipients, filename)
    return EmailSendResult(message='El servidor SMTP aceptó el correo para entrega.', message_id=message_id)


def send_email_with_attachment(to: str, subject: str, message: str, attachment: Path) -> str:
    try:
        data = attachment.read_bytes()
        return send_email_with_bytes_attachment(
            to=to,
            subject=subject,
            message=message,
            attachment_bytes=data,
            filename=attachment.name,
            subtype='octet-stream',
        ).message
    except EmailNotConfiguredError:
        return 'SMTP no configurado. Se generó el archivo pero no se envió el correo.'
    except EmailDeliveryError as exc:
        return str(exc)
