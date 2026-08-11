import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from app.models import User

settings = get_settings()
ph = PasswordHasher()


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return ph.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_session_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "role": user.role.value,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.jwt_exp_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_session_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Ungültige oder abgelaufene Sitzung") from exc


def make_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def get_current_user(
    session_token: str | None = Cookie(default=None, alias="orgaboard_session"),
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(status_code=401, detail="Nicht angemeldet")
    payload = decode_session_token(session_token)
    user = db.scalar(select(User).where(User.id == payload.get("sub"), User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")
    return user


def require_csrf(
    request: Request,
    csrf_cookie: str | None = Cookie(default=None, alias="orgaboard_csrf"),
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
):
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    if not csrf_cookie or not csrf_header:
        raise HTTPException(status_code=403, detail="CSRF-Prüfung fehlgeschlagen")
    if not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(status_code=403, detail="CSRF-Prüfung fehlgeschlagen")


def password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]
