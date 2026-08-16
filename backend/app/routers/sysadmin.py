"""Betreiberbereich: Plattform verwalten.

Getrennt vom bestehenden /admin, das der Teamleitung gehoert. Hier liegt,
was nur den Inhaber angeht: Organisationsstruktur, Rollen ueber
Teamleiterebene hinaus, Einzelrechte und Systemeinstellungen.

Jeder Endpunkt prueft require_system_admin. Die Pruefung sitzt im Backend,
nicht in der Oberflaeche - eine versteckte Schaltflaeche ist kein Schutz.
Jede Aenderung landet im Protokoll.
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.benutzerscope import (
    erlaubte_zielrollen,
    pruefe_loeschrecht,
    pruefe_zielrolle,
)
from app.core.database import get_db
from app.core.permissions import (
    RECHTE_BEZEICHNUNG,
    rechte_uebersicht,
    require_system_admin,
)
from app.core.security import get_current_user, hash_password, require_csrf
from app.core.timeutils import local_today, month_bounds
from app.models import (
    Appointment,
    Customer,
    District,
    Employee,
    Permission,
    Product,
    Region,
    Rental,
    RentalStatus,
    Role,
    ROLLEN_BEZEICHNUNG,
    Sale,
    SaleItem,
    SystemSetting,
    Team,
    TradeIn,
    User,
    UserPermission,
)
from app.services.kontoloeschung import (
    aktive_systemadmins,
    konto_endgueltig_loeschen,
)
from app.services.stats import not_cancelled, revenue_between

router = APIRouter(prefix="/sysadmin", tags=["sysadmin"])


def _admin(user: User = Depends(get_current_user)) -> User:
    return require_system_admin(user)


# ============================================================ Organisation

class RegionIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    lead_user_id: str | None = None
    is_active: bool = True


class DistrictIn(BaseModel):
    region_id: str
    name: str = Field(min_length=1, max_length=160)
    lead_user_id: str | None = None
    is_active: bool = True


class TeamIn(BaseModel):
    district_id: str
    name: str = Field(min_length=1, max_length=160)
    lead_user_id: str | None = None
    is_active: bool = True


def _leiter_name(db: Session, user_id: str | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.full_name if u else None


def _pruefe_leiter(db: Session, user_id: str | None) -> None:
    if user_id and db.get(User, user_id) is None:
        raise HTTPException(status_code=400, detail="Die angegebene Leitung gibt es nicht")


@router.get("/org")
def org_baum(user: User = Depends(_admin), db: Session = Depends(get_db)):
    """Die Struktur als Baum, mit Mitarbeiterzahl je Ebene.

    Ein flacher Baum waere schneller zu bauen, aber die Zahl der Ebenen ist
    fest und klein - drei Abfragen sind hier billiger als eine, die niemand
    mehr liest.
    """
    mitarbeiter_je_team: dict[str, int] = dict(
        db.execute(
            select(Employee.team_id, func.count(Employee.id))
            .where(Employee.team_id.is_not(None))
            .group_by(Employee.team_id)
        ).all()
    )

    teams_je_bezirk: dict[str, list[dict]] = {}
    for t in db.scalars(select(Team).order_by(Team.name)).all():
        teams_je_bezirk.setdefault(t.district_id, []).append({
            "id": t.id,
            "name": t.name,
            "lead_user_id": t.lead_user_id,
            "lead_name": _leiter_name(db, t.lead_user_id),
            "is_active": t.is_active,
            "employees": mitarbeiter_je_team.get(t.id, 0),
        })

    bezirke_je_region: dict[str, list[dict]] = {}
    for d in db.scalars(select(District).order_by(District.name)).all():
        teams = teams_je_bezirk.get(d.id, [])
        bezirke_je_region.setdefault(d.region_id, []).append({
            "id": d.id,
            "name": d.name,
            "lead_user_id": d.lead_user_id,
            "lead_name": _leiter_name(db, d.lead_user_id),
            "is_active": d.is_active,
            "teams": teams,
            "employees": sum(t["employees"] for t in teams),
        })

    regionen = []
    for r in db.scalars(select(Region).order_by(Region.name)).all():
        bezirke = bezirke_je_region.get(r.id, [])
        regionen.append({
            "id": r.id,
            "name": r.name,
            "lead_user_id": r.lead_user_id,
            "lead_name": _leiter_name(db, r.lead_user_id),
            "is_active": r.is_active,
            "districts": bezirke,
            "employees": sum(b["employees"] for b in bezirke),
        })

    ohne_team = int(db.scalar(
        select(func.count(Employee.id)).where(Employee.team_id.is_(None))
    ) or 0)

    return {"regions": regionen, "employees_without_team": ohne_team}


@router.post("/regions", dependencies=[Depends(require_csrf)])
def region_anlegen(data: RegionIn, user: User = Depends(_admin), db: Session = Depends(get_db)):
    _pruefe_leiter(db, data.lead_user_id)
    if db.scalar(select(Region).where(Region.name == data.name.strip())):
        raise HTTPException(status_code=400, detail="Diese Region gibt es bereits")

    r = Region(name=data.name.strip(), lead_user_id=data.lead_user_id, is_active=data.is_active)
    db.add(r)
    db.flush()
    audit(db, user, "region.created", "region", r.id, after={"name": r.name})
    db.commit()
    return {"id": r.id, "name": r.name}


@router.put("/regions/{region_id}", dependencies=[Depends(require_csrf)])
def region_aendern(region_id: str, data: RegionIn, user: User = Depends(_admin),
                   db: Session = Depends(get_db)):
    r = db.get(Region, region_id)
    if not r:
        raise HTTPException(status_code=404, detail="Region nicht gefunden")
    _pruefe_leiter(db, data.lead_user_id)

    vorher = {"name": r.name, "lead_user_id": r.lead_user_id, "is_active": r.is_active}
    r.name, r.lead_user_id, r.is_active = data.name.strip(), data.lead_user_id, data.is_active
    audit(db, user, "region.updated", "region", r.id, before=vorher,
          after={"name": r.name, "lead_user_id": r.lead_user_id, "is_active": r.is_active})
    db.commit()
    return {"id": r.id, "name": r.name}


@router.delete("/regions/{region_id}", dependencies=[Depends(require_csrf)])
def region_loeschen(region_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    """Nur eine leere Region laesst sich loeschen.

    Sonst wuerde die Kaskade Bezirke und Teams mitnehmen und die
    Mitarbeiter darin still auf "kein Team" zuruecksetzen - ein Klick, der
    eine ganze Struktur aufloest.
    """
    r = db.get(Region, region_id)
    if not r:
        raise HTTPException(status_code=404, detail="Region nicht gefunden")

    bezirke = int(db.scalar(
        select(func.count(District.id)).where(District.region_id == region_id)
    ) or 0)
    if bezirke:
        raise HTTPException(
            status_code=400,
            detail=f"Die Region enthält noch {bezirke} Bezirk(e). Erst diese entfernen.",
        )

    audit(db, user, "region.deleted", "region", r.id, before={"name": r.name})
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/districts", dependencies=[Depends(require_csrf)])
def bezirk_anlegen(data: DistrictIn, user: User = Depends(_admin), db: Session = Depends(get_db)):
    if not db.get(Region, data.region_id):
        raise HTTPException(status_code=400, detail="Region nicht gefunden")
    _pruefe_leiter(db, data.lead_user_id)

    d = District(region_id=data.region_id, name=data.name.strip(),
                 lead_user_id=data.lead_user_id, is_active=data.is_active)
    db.add(d)
    db.flush()
    audit(db, user, "district.created", "district", d.id,
          after={"name": d.name, "region_id": d.region_id})
    db.commit()
    return {"id": d.id, "name": d.name}


@router.put("/districts/{district_id}", dependencies=[Depends(require_csrf)])
def bezirk_aendern(district_id: str, data: DistrictIn, user: User = Depends(_admin),
                   db: Session = Depends(get_db)):
    d = db.get(District, district_id)
    if not d:
        raise HTTPException(status_code=404, detail="Bezirk nicht gefunden")
    if not db.get(Region, data.region_id):
        raise HTTPException(status_code=400, detail="Region nicht gefunden")
    _pruefe_leiter(db, data.lead_user_id)

    vorher = {"name": d.name, "region_id": d.region_id, "is_active": d.is_active}
    d.region_id, d.name = data.region_id, data.name.strip()
    d.lead_user_id, d.is_active = data.lead_user_id, data.is_active
    audit(db, user, "district.updated", "district", d.id, before=vorher,
          after={"name": d.name, "region_id": d.region_id, "is_active": d.is_active})
    db.commit()
    return {"id": d.id, "name": d.name}


@router.delete("/districts/{district_id}", dependencies=[Depends(require_csrf)])
def bezirk_loeschen(district_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    d = db.get(District, district_id)
    if not d:
        raise HTTPException(status_code=404, detail="Bezirk nicht gefunden")

    teams = int(db.scalar(select(func.count(Team.id)).where(Team.district_id == district_id)) or 0)
    if teams:
        raise HTTPException(
            status_code=400,
            detail=f"Der Bezirk enthält noch {teams} Team(s). Erst diese entfernen.",
        )

    audit(db, user, "district.deleted", "district", d.id, before={"name": d.name})
    db.delete(d)
    db.commit()
    return {"ok": True}


@router.post("/teams", dependencies=[Depends(require_csrf)])
def team_anlegen(data: TeamIn, user: User = Depends(_admin), db: Session = Depends(get_db)):
    if not db.get(District, data.district_id):
        raise HTTPException(status_code=400, detail="Bezirk nicht gefunden")
    _pruefe_leiter(db, data.lead_user_id)

    t = Team(district_id=data.district_id, name=data.name.strip(),
             lead_user_id=data.lead_user_id, is_active=data.is_active)
    db.add(t)
    db.flush()
    audit(db, user, "team.created", "team", t.id,
          after={"name": t.name, "district_id": t.district_id})
    db.commit()
    return {"id": t.id, "name": t.name}


@router.put("/teams/{team_id}", dependencies=[Depends(require_csrf)])
def team_aendern(team_id: str, data: TeamIn, user: User = Depends(_admin),
                 db: Session = Depends(get_db)):
    t = db.get(Team, team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Team nicht gefunden")
    if not db.get(District, data.district_id):
        raise HTTPException(status_code=400, detail="Bezirk nicht gefunden")
    _pruefe_leiter(db, data.lead_user_id)

    vorher = {"name": t.name, "district_id": t.district_id, "is_active": t.is_active}
    t.district_id, t.name = data.district_id, data.name.strip()
    t.lead_user_id, t.is_active = data.lead_user_id, data.is_active
    audit(db, user, "team.updated", "team", t.id, before=vorher,
          after={"name": t.name, "district_id": t.district_id, "is_active": t.is_active})
    db.commit()
    return {"id": t.id, "name": t.name}


@router.delete("/teams/{team_id}", dependencies=[Depends(require_csrf)])
def team_loeschen(team_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    """Mitarbeiter im Team verhindern das Loeschen.

    Sie wuerden sonst still auf "kein Team" fallen und aus jeder
    Teamauswertung verschwinden, ohne dass jemand davon erfaehrt.
    """
    t = db.get(Team, team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Team nicht gefunden")

    leute = int(db.scalar(select(func.count(Employee.id)).where(Employee.team_id == team_id)) or 0)
    if leute:
        raise HTTPException(
            status_code=400,
            detail=f"Dem Team sind noch {leute} Mitarbeiter zugeordnet. Erst umhängen.",
        )

    audit(db, user, "team.deleted", "team", t.id, before={"name": t.name})
    db.delete(t)
    db.commit()
    return {"ok": True}


# ========================================================= Benutzerverwaltung

class BenutzerIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: Role = Role.EMPLOYEE
    phone: str | None = Field(default=None, max_length=80)
    avatar_url: str | None = Field(default=None, max_length=1000)
    password: str | None = Field(default=None, min_length=12, max_length=200)
    is_active: bool = True

    position: str = Field(default="Vertriebspartner", max_length=120)
    employee_number: str | None = Field(default=None, max_length=60)
    hired_on: date | None = None
    location: str | None = Field(default=None, max_length=160)
    team_id: str | None = None
    monthly_units_target: int = Field(default=30, ge=1, le=1000)


class BenutzerUpdate(BaseModel):
    first_name: str | None = Field(default=None, max_length=120)
    last_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None
    role: Role | None = None
    phone: str | None = Field(default=None, max_length=80)
    avatar_url: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None

    position: str | None = Field(default=None, max_length=120)
    employee_number: str | None = Field(default=None, max_length=60)
    hired_on: date | None = None
    location: str | None = Field(default=None, max_length=160)
    team_id: str | None = None
    monthly_units_target: int | None = Field(default=None, ge=1, le=1000)


def _team_pfad(db: Session, team_id: str | None) -> dict | None:
    """Team mit Bezirk und Region - abgeleitet, nicht gespeichert."""
    if not team_id:
        return None
    t = db.get(Team, team_id)
    if not t:
        return None
    d = db.get(District, t.district_id)
    r = db.get(Region, d.region_id) if d else None
    return {
        "team_id": t.id, "team": t.name,
        "district_id": d.id if d else None, "district": d.name if d else None,
        "region_id": r.id if r else None, "region": r.name if r else None,
    }


def _benutzer_out(db: Session, u: User) -> dict:
    e = db.scalar(select(Employee).where(Employee.user_id == u.id))
    return {
        "id": u.id,
        "email": u.email,
        "full_name": u.full_name,
        "first_name": u.first_name,
        "last_name": u.last_name,
        "phone": u.phone,
        "avatar_url": u.avatar_url,
        "role": u.role.value,
        "role_label": ROLLEN_BEZEICHNUNG.get(u.role, u.role.value),
        "is_active": u.is_active,
        "must_change_password": u.must_change_password,
        "created_at": u.created_at,
        "employee": None if not e else {
            "id": e.id,
            "display_name": e.display_name,
            "position": e.position,
            "employee_number": e.employee_number,
            "hired_on": e.hired_on,
            "location": e.location,
            "monthly_units_target": e.monthly_units_target,
            **( _team_pfad(db, e.team_id) or {
                "team_id": None, "team": None,
                "district_id": None, "district": None,
                "region_id": None, "region": None,
            }),
        },
    }


def _zusammengesetzter_name(vorname: str | None, nachname: str | None, rueckfall: str) -> str:
    teile = [t.strip() for t in (vorname, nachname) if t and t.strip()]
    return " ".join(teile) if teile else rueckfall


@router.get("/users")
def benutzer_liste(user: User = Depends(_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).order_by(User.full_name)).all()
    return [_benutzer_out(db, u) for u in rows]


@router.get("/users/{user_id}")
def benutzer_einzeln(user_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return {**_benutzer_out(db, ziel), "permissions": rechte_uebersicht(db, ziel)}


@router.post("/users", dependencies=[Depends(require_csrf)])
def benutzer_anlegen(data: BenutzerIn, user: User = Depends(_admin),
                     db: Session = Depends(get_db)):
    """Legt Benutzerkonto und Mitarbeiterprofil in einem Zug an."""
    pruefe_zielrolle(user, data.role)
    adresse = data.email.lower().strip()
    if db.scalar(select(User).where(User.email == adresse)):
        raise HTTPException(status_code=400, detail="Diese E-Mail ist bereits vergeben")
    if data.team_id and not db.get(Team, data.team_id):
        raise HTTPException(status_code=400, detail="Team nicht gefunden")

    # Ohne gesetztes Passwort ein zufaelliges: ein leeres Passwort waere ein
    # offenes Konto, und ein festes waere in jeder Anlage dasselbe.
    startpasswort = data.password or _startpasswort()
    voller_name = _zusammengesetzter_name(data.first_name, data.last_name, adresse)

    neu = User(
        email=adresse,
        full_name=voller_name,
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        phone=data.phone,
        avatar_url=data.avatar_url,
        password_hash=hash_password(startpasswort),
        role=data.role,
        is_active=data.is_active,
        must_change_password=True,
    )
    db.add(neu)
    db.flush()

    db.add(Employee(
        user_id=neu.id,
        display_name=voller_name,
        position=data.position,
        employee_number=data.employee_number,
        hired_on=data.hired_on,
        location=data.location,
        team_id=data.team_id,
        monthly_units_target=data.monthly_units_target,
    ))
    db.flush()

    # Das Passwort steht bewusst nicht im Protokoll.
    audit(db, user, "sysadmin.user_created", "user", neu.id,
          after={"email": neu.email, "role": neu.role.value, "team_id": data.team_id})
    db.commit()

    return {**_benutzer_out(db, neu), "start_password": startpasswort}


def _startpasswort() -> str:
    import secrets
    import string

    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(16))


@router.put("/users/{user_id}", dependencies=[Depends(require_csrf)])
def benutzer_aendern(user_id: str, data: BenutzerUpdate, user: User = Depends(_admin),
                     db: Session = Depends(get_db)):
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    # Der Betreiber darf sich weder herabstufen noch abschalten. Sonst
    # steht die Anlage ohne Systemadministrator da, und niemand kann einen
    # neuen ernennen - die Rolle gibt es nur ueber die .env.
    if ziel.id == user.id:
        if data.role is not None and data.role != ziel.role:
            raise HTTPException(status_code=400, detail="Du kannst deine eigene Rolle nicht ändern")
        if data.is_active is False:
            raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst deaktivieren")

    # Die Anlage darf nie ohne handlungsfaehigen Betreiber dastehen - weder
    # durch Herabstufen noch durch Abschalten des letzten.
    verliert_admin = (
        ziel.role == Role.SYSTEM_ADMIN
        and (
            (data.role is not None and data.role != Role.SYSTEM_ADMIN)
            or data.is_active is False
        )
    )
    if verliert_admin and aktive_systemadmins(db, ausser=ziel.id) == 0:
        raise HTTPException(
            status_code=400,
            detail="Das ist der letzte aktive Systemadministrator",
        )

    if data.role is not None and data.role != ziel.role:
        pruefe_zielrolle(user, data.role)

    if data.email is not None:
        adresse = data.email.lower().strip()
        belegt = db.scalar(select(User).where(User.email == adresse, User.id != ziel.id))
        if belegt:
            raise HTTPException(status_code=400, detail="Diese E-Mail ist bereits vergeben")
        ziel.email = adresse

    vorher = {"role": ziel.role.value, "is_active": ziel.is_active, "email": ziel.email}

    for feld in ("first_name", "last_name", "phone", "avatar_url"):
        wert = getattr(data, feld)
        if wert is not None:
            setattr(ziel, feld, wert.strip() or None)

    if data.first_name is not None or data.last_name is not None:
        ziel.full_name = _zusammengesetzter_name(ziel.first_name, ziel.last_name, ziel.full_name)

    if data.role is not None:
        ziel.role = data.role
    if data.is_active is not None:
        ziel.is_active = data.is_active

    e = db.scalar(select(Employee).where(Employee.user_id == ziel.id))
    if e:
        if data.team_id is not None:
            if data.team_id and not db.get(Team, data.team_id):
                raise HTTPException(status_code=400, detail="Team nicht gefunden")
            e.team_id = data.team_id or None
        for feld in ("position", "employee_number", "location"):
            wert = getattr(data, feld)
            if wert is not None:
                setattr(e, feld, wert.strip() or None)
        if data.hired_on is not None:
            e.hired_on = data.hired_on
        if data.monthly_units_target is not None:
            e.monthly_units_target = data.monthly_units_target
        if data.first_name is not None or data.last_name is not None:
            e.display_name = ziel.full_name

    audit(db, user, "sysadmin.user_updated", "user", ziel.id, before=vorher,
          after={"role": ziel.role.value, "is_active": ziel.is_active, "email": ziel.email})
    db.commit()
    return _benutzer_out(db, ziel)


@router.delete("/users/{user_id}", dependencies=[Depends(require_csrf)])
def benutzer_endgueltig_loeschen(user_id: str, user: User = Depends(_admin),
                                 db: Session = Depends(get_db)):
    """Benutzerkonto wirklich entfernen - nicht nur abschalten.

    Der andere Weg, ein Konto stillzulegen, ist PUT mit is_active=false. Der
    laesst alles stehen und ist umkehrbar. Dieser hier nicht: E-Mail,
    Passwort, Telefonnummer, Einzelrechte, Push-Anmeldungen und
    Benachrichtigungen sind danach fort, und die Anmeldung ist mit dem
    naechsten Aufruf ungueltig - get_current_user schlaegt das Konto bei
    jeder Anfrage frisch nach.

    Die Unternehmenshistorie bleibt. Was genau mit den abhaengigen Daten
    passiert, steht in services/kontoloeschung.py.
    """
    pruefe_loeschrecht(user)
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    bericht = konto_endgueltig_loeschen(db, user, ziel)
    db.commit()
    return {
        "ok": True,
        "deleted_user_id": bericht.user_id,
        "employee_profile": (
            "anonymized" if bericht.profil_anonymisiert
            else "deleted" if bericht.profil_geloescht
            else "none"
        ),
        "removed": bericht.geloeschte_zeilen,
        "detached": bericht.entkoppelte_zeilen,
    }


@router.post("/users/{user_id}/password", dependencies=[Depends(require_csrf)])
def passwort_neu(user_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    """Neues Startpasswort. Wird einmal zurueckgegeben und nie protokolliert."""
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")

    neu = _startpasswort()
    ziel.password_hash = hash_password(neu)
    ziel.must_change_password = True
    audit(db, user, "sysadmin.password_reset", "user", ziel.id, after={"email": ziel.email})
    db.commit()
    return {"start_password": neu}


# ============================================================== Einzelrechte

class RechtIn(BaseModel):
    permission: Permission
    # None entfernt die Abweichung - danach gilt wieder die Rolle.
    allowed: bool | None = None


@router.get("/users/{user_id}/permissions")
def rechte_lesen(user_id: str, user: User = Depends(_admin), db: Session = Depends(get_db)):
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return rechte_uebersicht(db, ziel)


@router.put("/users/{user_id}/permissions", dependencies=[Depends(require_csrf)])
def recht_setzen(user_id: str, data: RechtIn, user: User = Depends(_admin),
                 db: Session = Depends(get_db)):
    ziel = db.get(User, user_id)
    if not ziel:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    if ziel.role == Role.SYSTEM_ADMIN:
        raise HTTPException(
            status_code=400,
            detail="Einem Systemadministrator lässt sich kein Recht entziehen",
        )

    vorhanden = db.scalar(
        select(UserPermission).where(
            UserPermission.user_id == user_id,
            UserPermission.permission == data.permission,
        )
    )

    if data.allowed is None:
        if vorhanden:
            db.delete(vorhanden)
    elif vorhanden:
        vorhanden.allowed = data.allowed
    else:
        db.add(UserPermission(user_id=user_id, permission=data.permission, allowed=data.allowed))

    audit(db, user, "sysadmin.permission_set", "user", ziel.id,
          after={"permission": data.permission.value, "allowed": data.allowed,
                 "label": RECHTE_BEZEICHNUNG.get(data.permission)})
    db.commit()
    return rechte_uebersicht(db, ziel)


@router.get("/roles")
def rollen(user: User = Depends(_admin)):
    """Rollen mit Rang - fuer Auswahllisten.

    Es sind genau die Rollen, die dieser Benutzer auch vergeben darf. Eine
    Auswahl anzubieten, die der Server anschliessend ablehnt, ist eine
    Einladung zum Fehler.
    """
    return [
        {"value": r.value, "label": ROLLEN_BEZEICHNUNG.get(r, r.value), "rank": r.rang}
        for r in sorted(erlaubte_zielrollen(user), key=lambda x: x.rang)
    ]


# ======================================================= Systemeinstellungen

class EinstellungIn(BaseModel):
    value: dict | list | str | int | float | bool | None = None


# Was der Betreiberbereich kennt. Eine feste Liste, damit die Oberflaeche
# weiss, was sie anbieten soll - und damit ein Tippfehler nicht still eine
# neue Einstellung erzeugt, die nie jemand liest.
BEKANNTE_EINSTELLUNGEN: dict[str, str] = {
    "company.name": "Firmenname",
    "company.address": "Firmenanschrift",
    "company.logo_url": "Logo (URL)",
    "brand.accent_color": "Akzentfarbe",
    "mail.from_address": "Absenderadresse",
    "mail.signature": "E-Mail-Signatur",
    "notify.rental_due_days": "Verleih: Erinnerung X Tage vorher",
    "defaults.monthly_units_target": "Standard-Monatsziel (Einheiten)",
}


@router.get("/settings")
def einstellungen_lesen(user: User = Depends(_admin), db: Session = Depends(get_db)):
    gespeichert = {s.key: s.value_json for s in db.scalars(select(SystemSetting)).all()}
    return [
        {"key": key, "label": label, "value": gespeichert.get(key)}
        for key, label in BEKANNTE_EINSTELLUNGEN.items()
    ]


@router.put("/settings/{key}", dependencies=[Depends(require_csrf)])
def einstellung_setzen(key: str, data: EinstellungIn, user: User = Depends(_admin),
                       db: Session = Depends(get_db)):
    if key not in BEKANNTE_EINSTELLUNGEN:
        raise HTTPException(status_code=404, detail="Unbekannte Einstellung")

    eintrag = db.get(SystemSetting, key)
    vorher = eintrag.value_json if eintrag else None

    if eintrag is None:
        eintrag = SystemSetting(key=key, value_json={"v": data.value})
        db.add(eintrag)
    else:
        eintrag.value_json = {"v": data.value}
    eintrag.updated_by_user_id = user.id

    audit(db, user, "sysadmin.setting_changed", "setting", key,
          before={"value": vorher}, after={"value": {"v": data.value}})
    db.commit()
    return {"key": key, "value": {"v": data.value}}


# ========================================================== Admin-Dashboard

@router.get("/overview")
def uebersicht(user: User = Depends(_admin), db: Session = Depends(get_db)):
    """Kennzahlen ueber die ganze Plattform, ohne Einschraenkung auf eine Person."""
    monat_start, monat_ende = month_bounds(local_today())

    benutzer_gesamt = int(db.scalar(select(func.count(User.id))) or 0)
    benutzer_aktiv = int(db.scalar(
        select(func.count(User.id)).where(User.is_active.is_(True))
    ) or 0)

    nach_rolle = {
        rolle.value: int(db.scalar(
            select(func.count(User.id)).where(User.role == rolle)
        ) or 0)
        for rolle in Role
    }

    verkaeufe = int(db.scalar(select(func.count(Sale.id)).where(not_cancelled())) or 0)
    offene_verleihe = int(db.scalar(
        select(func.count(Rental.id)).where(
            Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE])
        )
    ) or 0)

    return {
        "users": {
            "total": benutzer_gesamt,
            "active": benutzer_aktiv,
            "inactive": benutzer_gesamt - benutzer_aktiv,
            "by_role": nach_rolle,
        },
        "data": {
            "customers": int(db.scalar(
                select(func.count(Customer.id)).where(Customer.deleted_at.is_(None))
            ) or 0),
            "appointments": int(db.scalar(select(func.count(Appointment.id))) or 0),
            "sales": verkaeufe,
            "products": int(db.scalar(
                select(func.count(Product.id)).where(Product.active.is_(True))
            ) or 0),
            "rentals_open": offene_verleihe,
            "trade_ins": int(db.scalar(select(func.count(TradeIn.id))) or 0),
        },
        "revenue": {
            "month_cents": revenue_between(db, monat_start, monat_ende, None),
            # Gesamtumsatz ueber alle Zeiten, stornierte Verkaeufe aussen vor -
            # dieselbe Regel wie in jeder anderen Auswertung.
            "total_cents": int(db.scalar(
                select(func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price_cents), 0))
                .select_from(SaleItem)
                .join(Sale, Sale.id == SaleItem.sale_id)
                .where(not_cancelled())
            ) or 0),
        },
        "org": {
            "regions": int(db.scalar(select(func.count(Region.id))) or 0),
            "districts": int(db.scalar(select(func.count(District.id))) or 0),
            "teams": int(db.scalar(select(func.count(Team.id))) or 0),
            "employees_without_team": int(db.scalar(
                select(func.count(Employee.id)).where(Employee.team_id.is_(None))
            ) or 0),
        },
        "system": {
            "server_time": datetime.now(timezone.utc),
            "system_admins": nach_rolle.get(Role.SYSTEM_ADMIN.value, 0),
        },
    }
