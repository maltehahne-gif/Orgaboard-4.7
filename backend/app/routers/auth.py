import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode, urlparse
from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Response, Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db
from app.core.ratelimit import login_key, login_limiter
from app.core.security import create_session_token, get_current_user, hash_password, make_csrf_token, verify_password, require_csrf
from app.models import Employee, User


from app.core.security import (
    create_password_reset_token,
    decode_password_reset_token,
    password_fingerprint,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    # "Angemeldet bleiben": ob das Sitzungscookie ein Browser-Neustart
    # ueberdauern soll. True bleibt der bisherige Standard, damit ein Client,
    # der das Feld nicht mitschickt, sich weiterhin wie zuvor verhaelt.
    remember_me: bool = True


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


def user_payload(db: Session, user: User) -> dict:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "must_change_password": user.must_change_password,
        "employee": None if not employee else {
            "id": employee.id,
            "display_name": employee.display_name,
            "position": employee.position,
            "monthly_units_target": employee.monthly_units_target,
            "weekly_revenue_target_cents": employee.weekly_revenue_target_cents,
        },
    }


@router.post("/login")
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = login_key(request, data.email)
    login_limiter.check(key)

    user = db.scalar(select(User).where(User.email == data.email.lower().strip(), User.is_active.is_(True)))
    if not user or not verify_password(data.password, user.password_hash):
        login_limiter.register_failure(key)
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort ist falsch")

    login_limiter.reset(key)
    token = create_session_token(user)
    csrf = make_csrf_token()
    # Die Gueltigkeit des Tokens selbst (jwt_exp_minutes) bleibt in beiden
    # Faellen gleich - "Angemeldet bleiben" entscheidet nur, ob das Cookie
    # einen Browser-Neustart uebersteht. Ohne Haken setzt der Browser kein
    # Ablaufdatum: ein reines Sitzungscookie, das mit dem Schliessen des
    # Browsers verschwindet, auch wenn das Token selbst noch gueltig waere.
    max_age = settings.jwt_exp_minutes * 60 if data.remember_me else None
    response.set_cookie("orgaboard_session", token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=max_age, path="/")
    response.set_cookie("orgaboard_csrf", csrf, httponly=False, secure=settings.cookie_secure, samesite="lax", max_age=max_age, path="/")
    return user_payload(db, user)


@router.post("/logout", dependencies=[Depends(require_csrf)])
def logout(response: Response):
    response.delete_cookie("orgaboard_session", path="/")
    response.delete_cookie("orgaboard_csrf", path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_payload(db, user)


@router.post("/change-password", dependencies=[Depends(require_csrf)])
def change_password(data: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort ist falsch")
    if len(data.new_password) < 12:
        raise HTTPException(status_code=400, detail="Das neue Passwort muss mindestens 12 Zeichen lang sein")
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    return {"ok": True}


# ORGABOARD PASSWORD RESET ROUTES

logger = logging.getLogger(__name__)


class PasswordResetRequestIn(BaseModel):
    email: EmailStr


class PasswordResetConfirmIn(BaseModel):
    token: str
    new_password: str


def _allowed_reset_origins() -> set[str]:
    """
    Die Adressen, auf die ein Passwort-Reset-Link zeigen darf.

    Ausschliesslich konfigurierte Werte - niemals etwas, das aus dem
    Request stammt. FRONTEND_ORIGIN plus optional weitere Adressen
    ueber PASSWORD_RESET_ALLOWED_ORIGINS (kommagetrennt).
    """

    allowed = set()

    configured = str(
        getattr(settings, "frontend_origin", "") or ""
    ).rstrip("/")

    if configured:
        allowed.add(configured)

    extra = str(
        getattr(settings, "password_reset_allowed_origins", "") or ""
    )

    for entry in extra.split(","):
        entry = entry.strip().rstrip("/")
        if entry:
            allowed.add(entry)

    return allowed


def _password_reset_frontend_url(request: Request) -> str:
    """
    Ermittelt die Basisadresse fuer den Passwort-Reset-Link.

    Der Origin-Header des Requests wird bewusst NICHT uebernommen. Frueher
    wurde jede Adresse auf *.app.github.dev akzeptiert - damit konnte ein
    Angreifer einen Reset fuer eine fremde E-Mail anstossen und per Origin
    dafuer sorgen, dass der Link in der echten OrgaBoard-Mail auf seinen
    eigenen Server zeigt. Ein Klick des Opfers haette das Token preisgegeben.

    Der Header darf jetzt nur noch aus der Positivliste auswaehlen, nicht
    sie erweitern.
    """

    allowed = _allowed_reset_origins()

    if not allowed:
        raise HTTPException(
            status_code=503,
            detail=(
                "Die Frontend-Adresse für den "
                "Passwort-Reset ist nicht eingerichtet."
            ),
        )

    origin = request.headers.get("origin", "").rstrip("/")

    # Bei mehreren erlaubten Adressen darf der Origin entscheiden, welche
    # davon genommen wird - aber nur, wenn er selbst auf der Liste steht.
    if origin and origin in allowed:
        return origin

    configured = str(
        getattr(settings, "frontend_origin", "") or ""
    ).rstrip("/")

    return configured if configured in allowed else sorted(allowed)[0]


def _send_password_reset_email(
    recipient: str,
    reset_url: str,
) -> None:

    if not settings.smtp_host:
        raise RuntimeError("SMTP_HOST fehlt")

    if not settings.smtp_from_email:
        raise RuntimeError("SMTP_FROM_EMAIL fehlt")

    message = EmailMessage()

    message["Subject"] = "OrgaBoard – Passwort zurücksetzen"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient

    message.set_content(
        f"""Hallo,

für dein OrgaBoard-Konto wurde eine
Passwort-Zurücksetzung angefordert.

Öffne diesen Link:

{reset_url}

Der Link ist nur
{settings.password_reset_exp_minutes} Minuten gültig.

Falls du diese Anfrage nicht gestellt hast,
kannst du diese E-Mail ignorieren.

OrgaBoard
"""
    )

    message.add_alternative(
        f"""
<html>
<body style="
    margin:0;
    padding:30px;
    background:#071815;
    color:#eef7f3;
    font-family:Arial,sans-serif;
">

<div style="
    max-width:520px;
    margin:auto;
    padding:30px;
    background:#0b2621;
    border:1px solid #23845c;
    border-radius:18px;
">

<h2 style="
    margin-top:0;
    color:#31df88;
">
OrgaBoard
</h2>

<h3>Passwort zurücksetzen</h3>

<p>
Für dein OrgaBoard-Konto wurde eine
Passwort-Zurücksetzung angefordert.
</p>

<p style="margin:30px 0;">
<a
    href="{reset_url}"
    style="
        display:inline-block;
        padding:14px 22px;
        border-radius:10px;
        background:#20c875;
        color:#ffffff;
        text-decoration:none;
        font-weight:bold;
    "
>
Neues Passwort festlegen
</a>
</p>

<p style="color:#a8bbb5;">
Der Link ist nur
{settings.password_reset_exp_minutes} Minuten gültig.
</p>

<p style="color:#80958e;">
Falls du diese Anfrage nicht gestellt hast,
kannst du diese E-Mail ignorieren.
</p>

</div>
</body>
</html>
""",
        subtype="html",
    )

    with smtplib.SMTP(
        settings.smtp_host,
        settings.smtp_port,
        timeout=20,
    ) as smtp:

        smtp.ehlo()

        if settings.smtp_use_tls:
            smtp.starttls()
            smtp.ehlo()

        if (
            settings.smtp_user
            and settings.smtp_password
        ):
            smtp.login(
                settings.smtp_user,
                settings.smtp_password,
            )

        smtp.send_message(message)


@router.post("/password-reset/request")
def request_password_reset(
    data: PasswordResetRequestIn,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Fordert einen Passwort-Link an.

    Wichtig:
    Bei unbekannten E-Mail-Adressen kommt absichtlich
    dieselbe Antwort zurück. So kann niemand herausfinden,
    welche Personen ein OrgaBoard-Konto besitzen.
    """

    if (
        not settings.smtp_host
        or not settings.smtp_from_email
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "Der E-Mail-Versand für die "
                "Passwort-Zurücksetzung ist "
                "noch nicht eingerichtet."
            ),
        )

    normalized_email = data.email.lower().strip()

    user = db.scalar(
        select(User).where(
            User.email == normalized_email,
            User.is_active.is_(True),
        )
    )

    generic_response = {
        "ok": True,
        "message": (
            "Falls ein Konto mit dieser E-Mail-Adresse "
            "existiert, wurde ein Reset-Link versendet."
        ),
    }

    if not user:
        return generic_response

    token = create_password_reset_token(user)

    base_url = _password_reset_frontend_url(request)

    # Der Link zeigt direkt auf /login, nicht auf die Startseite: die
    # Startseite steckt hinter dem Guard und leitet einen ausgeloggten
    # Benutzer serverseitig zu /login um. Dieser Redirect (per <Navigate>)
    # ersetzt die Adresse jedoch komplett und nimmt den Query-String dabei
    # nicht mit - das Token ging so beim Redirect verloren, bevor die
    # Login-Seite es lesen konnte.
    reset_url = (
        f"{base_url}/login?"
        + urlencode(
            {
                "reset_token": token,
            }
        )
    )

    try:
        _send_password_reset_email(
            user.email,
            reset_url,
        )
    except Exception:
        logger.exception(
            "Passwort-Reset-E-Mail konnte "
            "nicht versendet werden"
        )

        # Nach außen weiterhin keine Information darüber,
        # ob die E-Mail-Adresse existiert.
        return generic_response

    return generic_response


@router.post("/password-reset/confirm")
def confirm_password_reset(
    data: PasswordResetConfirmIn,
    db: Session = Depends(get_db),
):
    if len(data.new_password) < 12:
        raise HTTPException(
            status_code=400,
            detail=(
                "Das neue Passwort muss mindestens "
                "12 Zeichen lang sein."
            ),
        )

    payload = decode_password_reset_token(
        data.token
    )

    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Der Passwort-Link ist ungültig.",
        )

    user = db.get(
        User,
        user_id,
    )

    if not user or not user.is_active:
        raise HTTPException(
            status_code=400,
            detail=(
                "Der Passwort-Link ist ungültig "
                "oder abgelaufen."
            ),
        )

    # Der Token enthält einen Fingerabdruck des alten
    # Passworts. Nach einem erfolgreichen Reset ist
    # derselbe Link deshalb automatisch unbrauchbar.
    if payload.get("pwd") != password_fingerprint(
        user.password_hash
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Dieser Passwort-Link wurde bereits "
                "verwendet oder ist ungültig."
            ),
        )

    user.password_hash = hash_password(
        data.new_password
    )

    # Der Reset ist eine vollwertige Passwortvergabe. Ohne diese Zeile blieb der
    # Nutzer im Zwangs-Dialog "Passwort aendern" haengen - und kam dort nicht
    # heraus, weil dieser das alte Passwort verlangt, das er nicht mehr kennt.
    user.must_change_password = False

    db.commit()

    return {
        "ok": True,
        "message": "Passwort wurde erfolgreich geändert.",
    }

