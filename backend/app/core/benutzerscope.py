"""Wer wessen Konto sieht, verwaltet - und wem welche Rolle geben darf.

Drei Fragen, die vorher an jeder Stelle einzeln (und teils gar nicht)
beantwortet wurden:

1. Welche Konten gehoeren ueberhaupt in den Blick dieses Benutzers?
2. Welches dieser Konten darf er organisatorisch verwalten?
3. Welche Rolle darf er vergeben?

Alle drei haengen an derselben Rangfolge, deshalb stehen sie hier an einer
Stelle. Verteilt auf 20 Endpunkte faellt die eine vergessene Abfrage
niemandem auf: zu wenig zu sehen sieht aus wie ein leerer Datenbestand, zu
viel zu sehen faellt gar nicht erst auf.

Die Rangfolge aus models.Role wird organisatorisch so gelesen:

    Systemadministrator  technische Sonderrolle, ausserhalb der Linie
    Regionalleiter       Organisationsleitung - setzt Teamleiter ein
    Teamleiter           fuehrt die Mitarbeiter der eigenen Teams
    Mitarbeiter          keine Verwaltungsrechte

Wichtig ist der erste Punkt: der Systemadministrator ist keine Fuehrungskraft
ueber dem Teamleiter, sondern der Betreiber der Anlage. Fuer alles unterhalb
existiert sein Konto nicht - und zwar nicht "ohne Schaltflaeche", sondern
ohne Datensatz in der Antwort. Ein Teamleiter, der die ID errät, bekommt
404, nicht 403: ein 403 wuerde bestaetigen, dass es das Konto gibt.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import and_, false, or_, select, true
from sqlalchemy.sql.elements import ColumnElement

from app.core.permissions import ist_systemadmin
from app.models import Employee, ROLLEN_BEZEICHNUNG, Role, Team, User


# ------------------------------------------------------------ Sichtbarkeit

def verborgene_rollen(actor: User) -> tuple[Role, ...]:
    """Rollen, deren Konten fuer diesen Benutzer nicht existieren.

    Nur der Systemadministrator sieht Systemadministratoren. Erkannt wird er
    ueber die Rolle, nicht ueber Name oder E-Mail - eine Adresse aendert
    sich, eine Rolle ist die Zusicherung.
    """
    if ist_systemadmin(actor):
        return ()
    return (Role.SYSTEM_ADMIN,)


def benutzer_sichtbar_filter(actor: User) -> ColumnElement[bool]:
    """Bedingung fuer jede Abfrage, die Benutzerkonten ausgibt."""
    verborgen = verborgene_rollen(actor)
    if not verborgen:
        return true()
    return User.role.notin_(verborgen)


def mitarbeiter_sichtbar_filter(actor: User) -> ColumnElement[bool]:
    """Dasselbe fuer Mitarbeiterprofile - Listen, Statistiken, Vergleiche.

    Profile ohne Konto bleiben sichtbar: das sind die Reste geloeschter
    Benutzer, die die Verkaufshistorie zusammenhalten. Ohne die ausdrueckliche
    Ausnahme wuerde `NOT IN` sie wegen NULL aussortieren und alte Umsaetze
    verschwinden lassen.
    """
    verborgen = verborgene_rollen(actor)
    if not verborgen:
        return true()
    return or_(
        Employee.user_id.is_(None),
        Employee.user_id.notin_(select(User.id).where(User.role.in_(verborgen))),
    )


def sichtbar(actor: User, ziel: User) -> bool:
    return ziel.role not in verborgene_rollen(actor)


def unsichtbare_employee_ids(db, actor: User) -> set[str]:
    """Mitarbeiterprofile, die fuer diesen Benutzer nicht auftauchen duerfen.

    Fuer die Stellen, die ihre Zeilen nicht per SQL holen, sondern fertig
    berechnet bekommen (Vergleich, Bericht, Zielerreichung).
    """
    verborgen = verborgene_rollen(actor)
    if not verborgen:
        return set()
    return set(
        db.scalars(
            select(Employee.id)
            .join(User, User.id == Employee.user_id)
            .where(User.role.in_(verborgen))
        ).all()
    )


def ohne_verborgene(
    db, actor: User, zeilen: list[dict], schluessel: str = "employee_id"
) -> list[dict]:
    """Fertig berechnete Zeilen um die unsichtbaren Personen kuerzen.

    Fuer alles, was nicht per SQL geholt, sondern in den Auswertungsdiensten
    zusammengerechnet wird. Sobald eine Zeile einen Namen traegt, ist sie
    eine Benutzerliste - und dann gilt dieselbe Sichtbarkeit wie ueberall.
    """
    verborgen = unsichtbare_employee_ids(db, actor)
    if not verborgen:
        return zeilen
    return [z for z in zeilen if z.get(schluessel) not in verborgen]


def hole_sichtbaren_benutzer(db, actor: User, user_id: str) -> User:
    """Konto laden - oder so tun, als gebe es keines.

    Der einzige Weg, ein Konto ueber seine ID zu holen. Direkter
    `db.get(User, ...)` in einem Endpunkt umgeht die Sichtbarkeit.
    """
    ziel = db.get(User, user_id)
    if not ziel or not sichtbar(actor, ziel):
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    return ziel


# ---------------------------------------------------------- Verwaltbarkeit

def gefuehrte_team_ids(db, actor: User) -> list[str]:
    """Teams, deren Leitung bei diesem Benutzer liegt."""
    return list(db.scalars(select(Team.id).where(Team.lead_user_id == actor.id)).all())


def verwaltbar(db, actor: User, ziel: User) -> bool:
    """Ob actor das Konto ziel organisatorisch verwalten darf.

    Die Rolle allein reicht nicht: ein Teamleiter fuehrt seine Mitarbeiter,
    nicht die des Nachbarteams. Deshalb zaehlt zusaetzlich die
    Teamzugehoerigkeit.

    Mitarbeiter ohne Team gelten als zuweisbar. Andernfalls koennte ein
    Teamleiter niemanden aufnehmen, solange die Organisationsstruktur noch
    nicht gepflegt ist - und genau dafuer ist "Mitarbeiter hinzufuegen" da.
    """
    if not sichtbar(actor, ziel):
        return False
    if ist_systemadmin(actor):
        return True
    if actor.id == ziel.id:
        # Das eigene Konto sieht jeder. Was daran geaendert werden darf,
        # begrenzen die Sperren in den Endpunkten (keine eigene Rolle, keine
        # Selbstdeaktivierung).
        return True
    if not actor.role.mindestens(Role.TEAM_LEADER):
        return False

    if actor.role.mindestens(Role.REGIONAL_LEAD):
        # Organisationsleitung: alles unterhalb der eigenen Stufe, ueber
        # Teamgrenzen hinweg. Ein zweiter Regionalleiter gehoert nicht dazu.
        return ziel.role.rang < actor.role.rang

    # Teamleiter: ausschliesslich normale Mitarbeiter des eigenen Bereichs.
    if ziel.role != Role.EMPLOYEE:
        return False
    profil = db.scalar(select(Employee).where(Employee.user_id == ziel.id))
    if profil is None:
        return False
    if profil.team_id is None:
        return True
    return profil.team_id in gefuehrte_team_ids(db, actor)


def verwaltbare_benutzer_filter(db, actor: User) -> ColumnElement[bool]:
    """Dieselbe Regel als SQL-Bedingung - fuer die Benutzerliste.

    Muss mit verwaltbar() zusammenpassen: eine Liste, die mehr zeigt als der
    Einzelabruf hergibt, ist eine Liste voller Schaltflaechen, die 404
    liefern.
    """
    if ist_systemadmin(actor):
        return true()
    if not actor.role.mindestens(Role.TEAM_LEADER):
        return User.id == actor.id

    if actor.role.mindestens(Role.REGIONAL_LEAD):
        untergeordnet = [r for r in Role if r.rang < actor.role.rang]
        return or_(User.id == actor.id, User.role.in_(untergeordnet))

    eigene_teams = gefuehrte_team_ids(db, actor)
    zuweisbar = select(Employee.user_id).where(
        Employee.user_id.is_not(None),
        or_(
            Employee.team_id.is_(None),
            Employee.team_id.in_(eigene_teams) if eigene_teams else false(),
        ),
    )
    return or_(
        User.id == actor.id,
        and_(User.role == Role.EMPLOYEE, User.id.in_(zuweisbar)),
    )


def pruefe_verwaltbar(db, actor: User, ziel: User) -> None:
    """Fuer Aenderungen: unsichtbar wird 404, sichtbar aber fremd wird 403."""
    if not sichtbar(actor, ziel):
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden")
    if not verwaltbar(db, actor, ziel):
        raise HTTPException(
            status_code=403,
            detail="Dieser Benutzer gehört nicht zu deinem Verantwortungsbereich",
        )


# ------------------------------------------------------------- Rollenvergabe

def erlaubte_zielrollen(actor: User) -> set[Role]:
    """Welche Rolle dieser Benutzer vergeben darf.

    Eine Regel statt einer Aufzaehlung: nur unterhalb der eigenen Stufe. Wer
    seine eigene Stufe nicht vergeben kann, kann sie auch nicht
    weiterreichen - ein Teamleiter macht damit keinen zweiten Teamleiter, und
    hochstufen kann sich niemand, weil die eigene Rolle nie unter der eigenen
    Stufe liegt.

    Der Systemadministrator ist die Ausnahme nach oben: er ist der Betreiber
    und darf einen zweiten Betreiber einsetzen. Sonst haengt die ganze Anlage
    an genau einem Konto.
    """
    if ist_systemadmin(actor):
        return set(Role)
    if not actor.role.mindestens(Role.TEAM_LEADER):
        return set()
    return {r for r in Role if r.rang < actor.role.rang and r != Role.SYSTEM_ADMIN}


def pruefe_zielrolle(actor: User, rolle: Role) -> None:
    if rolle not in erlaubte_zielrollen(actor):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Die Rolle „{ROLLEN_BEZEICHNUNG.get(rolle, rolle.value)}“ "
                f"darfst du nicht vergeben"
            ),
        )


# ------------------------------------------------------------ Teamzuordnung

def pruefe_teamhoheit(db, actor: User, team_id: str) -> Team:
    """Ob actor ueber die Besetzung dieses Teams entscheiden darf.

    Bewusst getrennt von der Rollenvergabe: wer Leute in sein Team holen
    darf, darf deshalb noch lange keine Fuehrungsrolle vergeben.
    """
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team nicht gefunden")
    if ist_systemadmin(actor) or actor.role.mindestens(Role.REGIONAL_LEAD):
        return team
    if team.id not in gefuehrte_team_ids(db, actor):
        raise HTTPException(status_code=403, detail="Das ist nicht dein Team")
    return team


# -------------------------------------------------------------- Loeschrecht

def pruefe_loeschrecht(actor: User) -> None:
    """Endgueltiges Loeschen bleibt dem Betreiber vorbehalten.

    Bewusst kein Einzelrecht aus der Rechtetabelle: ein Recht, das sich
    zuteilen laesst, laesst sich auch versehentlich einem Teamleiter
    zuteilen. Loeschen ist die einzige Aktion ohne Rueckweg.
    """
    if not ist_systemadmin(actor):
        raise HTTPException(
            status_code=403,
            detail="Benutzerkonten endgültig löschen darf nur ein Systemadministrator",
        )
