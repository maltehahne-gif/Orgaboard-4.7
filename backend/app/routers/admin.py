"""Verwaltung fuer die Fuehrungsebene: Benutzer, Teams, Profile und Ziele.

Erreichbar ab Teamleiter. Was ein Aufrufer hier tatsaechlich sieht und
aendern darf, entscheidet nicht die Rolle allein, sondern
core/benutzerscope.py - eine Stelle fuer alle drei Fragen "wen sehe ich",
"wen darf ich verwalten", "welche Rolle darf ich vergeben".

Vier Regeln ziehen sich durch den ganzen Router und sind bewusst hart
verdrahtet:

1. Niemand kann sich selbst die Rechte nehmen oder sich selbst abschalten.
   Ein Versehen wuerde sonst mitten in der Arbeit aussperren.
2. Der letzte aktive Teamleiter bleibt Teamleiter und bleibt aktiv. Ohne
   diese Sperre laesst sich das System in einen Zustand bringen, aus dem
   heraus niemand mehr verwalten kann - reparabel nur noch direkt auf der
   Datenbank.
3. Niemand vergibt die eigene Stufe. Ein Teamleiter macht deshalb keinen
   zweiten Teamleiter, und hochstufen kann sich niemand.
4. Das Systemadministrator-Konto existiert hier fuer niemanden ausser dem
   Systemadministrator selbst - nicht in der Liste, nicht ueber die ID.

Jede Aenderung landet im Audit-Log, damit spaeter nachvollziehbar ist, wer
wem welche Rechte gegeben hat.
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.benutzerscope import (
    benutzer_sichtbar_filter,
    erlaubte_zielrollen,
    gefuehrte_team_ids,
    hole_sichtbaren_benutzer,
    pruefe_teamhoheit,
    pruefe_verwaltbar,
    pruefe_zielrolle,
    verwaltbar,
    verwaltbare_benutzer_filter,
)
from app.core.database import get_db
from app.core.permissions import require_permission
from app.core.rbac import require_team_leader
from app.core.security import get_current_user, hash_password, require_csrf
from app.models import (
    District,
    Employee,
    Permission,
    Region,
    ROLLEN_BEZEICHNUNG,
    Role,
    Team,
    User,
)

router = APIRouter(prefix="/admin", tags=["admin"])

MIN_PASSWORT = 12


class BenutzerAnlegenIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    # Voreinstellung und in aller Regel der einzige zulaessige Wert: ein
    # Teamleiter nimmt Mitarbeiter auf, keine Fuehrungskraefte. Geprueft wird
    # serverseitig gegen erlaubte_zielrollen() - das Feld auszublenden waere
    # nur Oberflaeche.
    role: Role = Role.EMPLOYEE
    display_name: str | None = Field(default=None, max_length=255)
    position: str = Field(default="Vertriebspartner", max_length=120)
    monthly_units_target: int = Field(default=30, ge=0, le=1000)
    # In welches Team die neue Person kommt. Ohne Angabe waehlt der Server das
    # Team des Anlegenden, sofern er genau eines fuehrt - sonst haette ein
    # Teamleiter gerade jemanden angelegt, den er anschliessend nicht mehr
    # sieht.
    team_id: str | None = None
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


class TeamMitgliedIn(BaseModel):
    employee_id: str


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
            "team_id": employee.team_id,
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


def _hole(db: Session, actor: User, user_id: str) -> User:
    """Konto holen und die Zustaendigkeit pruefen - in dieser Reihenfolge.

    Unsichtbar ergibt 404, sichtbar aber ausserhalb des eigenen Bereichs 403.
    Ein 403 auf ein unsichtbares Konto waere die Bestaetigung, dass es
    existiert.
    """
    ziel = hole_sichtbaren_benutzer(db, actor, user_id)
    pruefe_verwaltbar(db, actor, ziel)
    return ziel


@router.get("/users")
def liste(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Nur Konten aus dem eigenen Verantwortungsbereich.

    Fuer einen Teamleiter sind das die Mitarbeiter seiner Teams und die noch
    keinem Team zugeordneten - plus er selbst. Fuehrungskraefte anderer Teams
    und der Systemadministrator kommen nicht vor.
    """
    require_team_leader(user)
    rows = db.scalars(
        select(User)
        .where(benutzer_sichtbar_filter(user), verwaltbare_benutzer_filter(db, user))
        .order_by(User.full_name)
    ).all()
    return [_out(db, row) for row in rows]


@router.get("/assignable-roles")
def zuweisbare_rollen(user: User = Depends(get_current_user)):
    """Welche Rollen dieser Benutzer vergeben darf.

    Die Oberflaeche baut daraus ihre Auswahl. Sie ist damit nicht die
    Absicherung, sondern nur deren Abbild - abgelehnt wird ohnehin im
    Backend.
    """
    require_team_leader(user)
    return [
        {"value": r.value, "label": ROLLEN_BEZEICHNUNG.get(r, r.value), "rank": r.rang}
        for r in sorted(erlaubte_zielrollen(user), key=lambda x: x.rang)
    ]


@router.post("/users", dependencies=[Depends(require_csrf)])
def anlegen(
    data: BenutzerAnlegenIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_leader(user)
    # Die eigentliche Sperre gegen Rechteausweitung: eine Rolle, die der
    # Anlegende nicht vergeben darf, wird hier abgewiesen - unabhaengig
    # davon, was die Oberflaeche angeboten hat.
    pruefe_zielrolle(user, data.role)
    if data.role.mindestens(Role.TEAM_LEADER):
        require_permission(db, user, Permission.ROLLE_TEAMLEITER_VERGEBEN)

    email = data.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=400, detail="Diese E-Mail-Adresse wird bereits verwendet")

    team_id = _team_fuer_neuanlage(db, user, data.team_id)

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
        team_id=team_id,
    )
    db.add(profil)
    db.flush()

    audit(db, user, "user.created", "user", neuer.id,
          after={"email": neuer.email, "role": neuer.role.value, "team_id": team_id})
    db.commit()

    # Das Passwort wird genau hier einmal ausgeliefert und nirgends gespeichert.
    return {**_out(db, neuer), "start_password": passwort}


def _team_fuer_neuanlage(db: Session, actor: User, gewuenscht: str | None) -> str | None:
    """In welches Team die neue Person kommt.

    Ein angegebenes Team muss in der Hoheit des Anlegenden liegen. Ohne
    Angabe faellt die Wahl auf das Team des Anlegenden, sofern er genau eines
    fuehrt - fuehrt er mehrere, kann der Server nicht raten, und fuehrt er
    keines, bleibt die Person ohne Team und damit zuweisbar.
    """
    if gewuenscht:
        return pruefe_teamhoheit(db, actor, gewuenscht).id
    eigene = gefuehrte_team_ids(db, actor)
    return eigene[0] if len(eigene) == 1 else None


@router.patch("/users/{user_id}", dependencies=[Depends(require_csrf)])
def aendern(
    user_id: str,
    data: BenutzerAendernIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_team_leader(user)
    ziel = _hole(db, user, user_id)
    vorher = _out(db, ziel)

    if data.is_active is False:
        if ziel.id == user.id:
            raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst deaktivieren")
        _pruefe_letzter_teamleiter(db, ziel)

    if data.role is not None and data.role != ziel.role:
        if ziel.id == user.id:
            raise HTTPException(status_code=400, detail="Du kannst deine eigene Rolle nicht ändern")
        # Beide Richtungen sind Rollenverwaltung: wer eine Fuehrungsrolle
        # nicht vergeben darf, darf sie auch nicht entziehen.
        pruefe_zielrolle(user, data.role)
        if data.role.mindestens(Role.TEAM_LEADER):
            require_permission(db, user, Permission.ROLLE_TEAMLEITER_VERGEBEN)
        if ziel.role.mindestens(Role.TEAM_LEADER):
            require_permission(db, user, Permission.ROLLE_TEAMLEITER_ENTZIEHEN)
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
    ziel = _hole(db, user, user_id)

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
    # Das Profil haengt am Konto - also entscheidet die Zustaendigkeit fuer
    # das Konto. Ohne diese Pruefung waere der Umweg ueber die Profil-ID die
    # offene Tuer neben der verschlossenen.
    _pruefe_profilhoheit(db, user, profil)

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
    besitzer = db.get(User, profil.user_id) if profil.user_id else None
    return _out(db, besitzer) if besitzer else {"employee": {"id": profil.id}}


def _pruefe_profilhoheit(db: Session, actor: User, profil: Employee) -> None:
    if profil.user_id is None:
        # Rest eines geloeschten Kontos. Er traegt nur noch Zahlen; daran
        # gibt es nichts mehr zu verwalten.
        raise HTTPException(status_code=404, detail="Mitarbeiterprofil nicht gefunden")
    besitzer = hole_sichtbaren_benutzer(db, actor, profil.user_id)
    pruefe_verwaltbar(db, actor, besitzer)


# ------------------------------------------------------------ Teamzuordnung
#
# Bewusst eigene Endpunkte und ein eigenes Recht. "Mitarbeiter ins Team
# aufnehmen" ist Teamverwaltung, "Teamleiter ernennen" ist Rollenverwaltung -
# wer beides ueber denselben Weg erledigt, verschenkt beim ersten Haken
# unweigerlich auch das zweite.


@router.get("/teams")
def teams(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Teams, deren Besetzung dieser Benutzer verantwortet."""
    require_team_leader(user)
    if user.role.mindestens(Role.REGIONAL_LEAD):
        rows = db.scalars(select(Team).order_by(Team.name)).all()
    else:
        eigene = gefuehrte_team_ids(db, user)
        rows = (
            db.scalars(select(Team).where(Team.id.in_(eigene)).order_by(Team.name)).all()
            if eigene else []
        )

    ergebnis = []
    for t in rows:
        d = db.get(District, t.district_id)
        r = db.get(Region, d.region_id) if d else None
        ergebnis.append({
            "id": t.id,
            "name": t.name,
            "district": d.name if d else None,
            "region": r.name if r else None,
            "is_active": t.is_active,
            "members": int(db.scalar(
                select(func.count(Employee.id)).where(Employee.team_id == t.id)
            ) or 0),
        })
    return ergebnis


@router.post("/teams/{team_id}/members", dependencies=[Depends(require_csrf)])
def team_mitglied_aufnehmen(
    team_id: str,
    data: TeamMitgliedIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Einen Mitarbeiter ins eigene Team holen.

    Zulaessig nur fuer Konten, die ohnehin im Verantwortungsbereich liegen -
    also fuer Mitarbeiter ohne Team oder aus einem eigenen Team. Jemanden aus
    einem fremden Team zu uebernehmen bleibt der Organisationsleitung
    vorbehalten.
    """
    require_team_leader(user)
    require_permission(db, user, Permission.TEAM_MITGLIED_HINZUFUEGEN)
    team = pruefe_teamhoheit(db, user, team_id)

    profil = db.get(Employee, data.employee_id)
    if not profil or profil.user_id is None:
        raise HTTPException(status_code=404, detail="Mitarbeiterprofil nicht gefunden")
    besitzer = hole_sichtbaren_benutzer(db, user, profil.user_id)
    if not verwaltbar(db, user, besitzer):
        raise HTTPException(
            status_code=403,
            detail="Dieser Mitarbeiter gehört nicht zu deinem Verantwortungsbereich",
        )

    vorher = profil.team_id
    profil.team_id = team.id
    audit(db, user, "team.member_added", "employee", profil.id,
          before={"team_id": vorher}, after={"team_id": team.id})
    db.commit()
    return {"ok": True, "employee_id": profil.id, "team_id": team.id}


@router.delete("/teams/{team_id}/members/{employee_id}", dependencies=[Depends(require_csrf)])
def team_mitglied_entfernen(
    team_id: str,
    employee_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Einen Mitarbeiter aus dem eigenen Team nehmen.

    Das Konto bleibt bestehen und der Mitarbeiter bleibt aktiv - er ist
    danach nur keinem Team mehr zugeordnet.
    """
    require_team_leader(user)
    require_permission(db, user, Permission.TEAM_MITGLIED_ENTFERNEN)
    team = pruefe_teamhoheit(db, user, team_id)

    profil = db.get(Employee, employee_id)
    if not profil or profil.team_id != team.id:
        raise HTTPException(status_code=404, detail="Der Mitarbeiter ist nicht in diesem Team")
    if profil.user_id is not None:
        besitzer = hole_sichtbaren_benutzer(db, user, profil.user_id)
        if not verwaltbar(db, user, besitzer):
            raise HTTPException(
                status_code=403,
                detail="Dieser Mitarbeiter gehört nicht zu deinem Verantwortungsbereich",
            )

    profil.team_id = None
    audit(db, user, "team.member_removed", "employee", profil.id,
          before={"team_id": team.id}, after={"team_id": None})
    db.commit()
    return {"ok": True}
