from __future__ import annotations

import hashlib
import hmac
import re
import secrets

from argon2 import PasswordHasher
from email_validator import EmailNotValidError, validate_email
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_PASSWORD_HASHER = PasswordHasher()
_DUMMY_HASH = _PASSWORD_HASHER.hash("Durango-Dummy-Password-2026")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9._-]{3,64}$")


class PasswordPolicyError(ValueError):
    pass


def normalize_username(username: str) -> str:
    """Identificador único: usuario heredado (3-64) o correo valido (<=254).

    La normalización es común a creación, edición y autenticación. No se
    comprueba entregabilidad/DNS: el correo se usa como identificador local.
    """
    value = str(username or '').strip().lower()
    if '@' in value:
        if len(value) > 254:
            raise ValueError("El correo electrónico no puede superar 254 caracteres.")
        try:
            parsed = validate_email(value, check_deliverability=False, allow_smtputf8=False)
        except EmailNotValidError as exc:
            raise ValueError("El correo electrónico no es válido.") from exc
        normalized = parsed.normalized.lower()
        if len(normalized) > 254:
            raise ValueError("El correo electrónico no puede superar 254 caracteres.")
        return normalized
    if not _USERNAME_RE.fullmatch(value):
        raise ValueError(
            "Ingresa un usuario de 3 a 64 caracteres (letras, números, punto, guion o guion bajo) o un correo electrónico válido."
        )
    return value


def validate_password(password: str) -> None:
    if len(password) < 10:
        raise PasswordPolicyError("La contraseña debe tener al menos 10 caracteres.")
    if not any(character.isalpha() for character in password):
        raise PasswordPolicyError("La contraseña debe incluir al menos una letra.")
    if not any(character.isdigit() for character in password):
        raise PasswordPolicyError("La contraseña debe incluir al menos un número.")


def hash_password(password: str) -> str:
    validate_password(password)
    return _PASSWORD_HASHER.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    candidate_hash = password_hash or _DUMMY_HASH
    try:
        valid = _PASSWORD_HASHER.verify(candidate_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return bool(valid and password_hash)


def password_needs_rehash(password_hash: str) -> bool:
    try:
        return _PASSWORD_HASHER.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def random_token(size: int = 48) -> str:
    return secrets.token_urlsafe(size)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def constant_time_token_match(token: str, stored_hash: str) -> bool:
    return hmac.compare_digest(hash_token(token), stored_hash)


def constant_time_raw_match(left: str, right: str) -> bool:
    return hmac.compare_digest(str(left or ""), str(right or ""))
