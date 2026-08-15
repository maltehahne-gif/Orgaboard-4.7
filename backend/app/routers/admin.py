"""Zentrale Verwaltung: Benutzer, Rollen, Mitarbeiterprofile und Ziele.

Alles hier ist Teamleitern vorbehalten. Zwei Regeln ziehen sich durch den
ganzen Router und sind bewusst hart verdrahtet:

1. Niemand kann sich selbst die Rechte nehmen oder sich selbst abschalten.
   Ein Versehen wuerde sonst mitten in der Arbeit aussperren.
2. Der letzte aktive Teamleiter bleibt Teamleiter und bleibt aktiv. Ohne
   diese Sperre laesst sich das System in einen Zustand bringen, aus dem
   heraus niemand mehr verwalten kann - reparabel nur noch direkt auf der
   Datenbank.

Jede Aenderung landet im Audit-Log, damit spaeter nachvollziehbar ist, wer
wem welche Rechte gegeben hat.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import require_team_leader
from app.core.security import get_current_user, hash_password, require_csrf
from app.models import Employee, Role, User

router = APIRouter(prefix="/admin", tags=["admin"])

MIN_PASSWORT = 12


class BenutzerAnlegenIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: Role = Role.EMPLOYEE
    display_name: str | None = Field(default=None, max_length=255)
    position: str = Field(default="Vertriebspartner", max_length=120)
    monthly_units_target: int = Field(default=30, ge=0, le=1000)
    # Leer lassen erzeugt ein sicheres Startpasswort, das einmalig
    # zurueckgegeben wird.
    password: str | None = None


class BenutzerAendernIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Role | None = None
    is_active: bool | None = None


class PasswortSetzenIn(BaseModel):
    password: str | None = None


class ProfilAendernIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    position: str | None = Field(default=None, max_length=120)
    monthly_units_target: int | None = Field(default=None, ge=0, le=1000)
    weekly_revenue_target_cents: int | None = Field(default=None, ge=0)


def _out(db: Session, user: User) -> dict:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "created_at": user.created_at,
        "employee": None
        if not employee
        else {
            "id": employee.id,
            "display_name": employee.display_name,
            "position": employee.position,
            "monthly_units_target": employee.monthly_units_target,
            "weekly_revenue_target_cents": employee.weekly_revenue_target_cents,
        },
    }


def _aktive_teamleiter(db: Session, ausser: str | None = None) -> int:
    """Aktive Benutzer, die verwalten duerfen.

    Seit es Regionalleiter und Systemadministratoren gibt, zaehlt nicht mehr
    die Rolle "Teamleiter", sondern die Faehigkeit zu verwalten. Sonst
    koennte der letzte Teamleiter nicht heruntergestuft werden, obwohl der
    Betreiber selbst danebensteht - und umgekehrt liesse sich der letzte
    Administrator entfernen, weil er als Teamleiter nicht mitgezaehlt wurde.
    """
    verwaltende = [r for r in Role if r.mindestens(Role.TEAM_LEADER)]
    stmt = select(func.count(User.id)).where(
        User.role.in_(verwaltende), User.is_active.is_(True)
    )
    if ausser:
        stmt = stmt.where(User.id != ausser)
    return int(db.scalar(stmt) or 0)


def _pruefe_letzter_teamleiter(db: Session, ziel: User) -> None:
    """Verhindert, dass der letzte handlungsfaehige Teamleiter wegfaellt."""
    if not ziel.role.mindestens(Role.TEAM_LEADER) or not ziel.is_active:
        return
    if _aktive_teamleiter(db, ausser=ziel.id) == 0:
        raise HTTPException(
            status_code=400,
            detail="Das ist der letzte aktive Teamleiter - sonst kann niemand mehr verwalten",
        )


def _hole(db: Session, user_id: str) -> User:
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return ziel


@router.get("/users")
def liste(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_leader(user)
    rows = db.scalars(select(User).order_by(User.full_name)).all()
    return [_out(db, row) for row in rows]


@router.post("/users", dependencies=[Depends(require_csrf)])
def anlegen(
    data: BenutzerAnlegenIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_leader(user)

    email = data.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=400, detail="Diese E-Mail-Adresse wird bereits verwendet")

    passwort = data.password or secrets.token_urlsafe(12)
    if len(passwort) < MIN_PASSWORT:
        raise HTTPException(
            status_code=400,
            detail=f"Das Startpasswort muss mindestens {MIN_PASSWORT} Zeichen lang sein",
        )

    neuer = User(
        email=email,
        full_name=data.full_name.strip(),
        password_hash=hash_password(passwort),
        role=data.role,
        is_active=True,
        # Das Startpasswort kennt die anlegende Person - es muss beim ersten
        # Anmelden ersetzt werden.
        must_change_password=True,
    )
    db.add(neuer)
    db.flush()

    profil = Employee(
        user_id=neuer.id,
        display_name=(data.display_name or data.full_name).strip(),
        position=data.position,
        monthly_units_target=data.monthly_units_target,
    )
    db.add(profil)
    db.flush()

    audit(db, user, "user.created", "user", neuer.id,
          after={"email": neuer.email, "role": neuer.role.value})
    db.commit()

    # Das Passwort wird genau hier einmal ausgeliefert und nirgends gespeichert.
    return {**_out(db, neuer), "start_password": passwort}


@router.patch("/users/{user_id}", dependencies=[Depends(require_csrf)])
def aendern(
    user_id: str,
    data: BenutzerAendernIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_leader(user)
    ziel = _hole(db, user_id)
    vorher = _out(db, ziel)

    if data.is_active is False:
        if ziel.id == user.id:
            raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst deaktivieren")
        _pruefe_letzter_teamleiter(db, ziel)

    if data.role is not None and data.role != ziel.role:
        if ziel.id == user.id:
            raise HTTPException(status_code=400, detail="Du kannst deine eigene Rolle nicht ändern")
        if not data.role.mindestens(Role.TEAM_LEADER):
            _pruefe_letzter_teamleiter(db, ziel)

    if data.full_name is not None:
        ziel.full_name = data.full_name.strip()
    if data.role is not None:
        ziel.role = data.role
    if data.is_active is not None:
        ziel.is_active = data.is_active

    audit(db, user, "user.updated", "user", ziel.id, before=vorher, after=_out(db, ziel))
    db.commit()
    return _out(db, ziel)


@router.patch("/users/{user_id}/password", dependencies=[Depends(require_csrf)])
def passwort_setzen(
    user_id: str,
    data: PasswortSetzenIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Startpasswort neu setzen, etwa wenn jemand ausgesperrt ist.

    Der Weg ueber "Passwort vergessen" bleibt der Normalfall - das hier ist
    fuer den Fall, dass kein Postfach erreichbar ist.
    """
    require_team_leader(user)
    ziel = _hole(db, user_id)

    passwort = data.password or secrets.token_urlsafe(12)
    if len(passwort) < MIN_PASSWORT:
        raise HTTPException(
            status_code=400,
            detail=f"Das Passwort muss mindestens {MIN_PASSWORT} Zeichen lang sein",
        )

    ziel.password_hash = hash_password(passwort)
    ziel.must_change_password = True

    # Das Passwort selbst wird bewusst nicht ins Audit-Log geschrieben.
    audit(db, user, "user.password_reset", "user", ziel.id)
    db.commit()
    return {"ok": True, "start_password": passwort}


@router.patch("/employees/{employee_id}", dependencies=[Depends(require_csrf)])
def profil_aendern(
    employee_id: str,
    data: ProfilAendernIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Anzeigename, Position und Ziele eines Mitarbeiters."""
    require_team_leader(user)
    profil = db.get(Employee, employee_id)
    if not profil:
        raise HTTPException(status_code=404, detail="Mitarbeiterprofil nicht gefunden")

    vorher = {
        "display_name": profil.display_name,
        "position": profil.position,
        "monthly_units_target": profil.monthly_units_target,
        "weekly_revenue_target_cents": profil.weekly_revenue_target_cents,
    }

    if data.display_name is not None:
        profil.display_name = data.display_name.strip()
    if data.position is not None:
        profil.position = data.position
    if data.monthly_units_target is not None:
        profil.monthly_units_target = data.monthly_units_target
    if data.weekly_revenue_target_cents is not None:
        profil.weekly_revenue_target_cents = data.weekly_revenue_target_cents

    audit(db, user, "employee.updated", "employee", profil.id, before=vorher,
          after={
              "display_name": profil.display_name,
              "position": profil.position,
              "monthly_units_target": profil.monthly_units_target,
              "weekly_revenue_target_cents": profil.weekly_revenue_target_cents,
          })
    db.commit()
    return _out(db, db.get(User, profil.user_id))
