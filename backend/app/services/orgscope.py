"""Vertriebshierarchie: Mitarbeiter, Team, Bezirk, Region an einer Stelle.

Team, Bezirk und Region existieren als eigene Tabellen (siehe models.py),
werden bisher aber nirgends genutzt, um Auswertungen einzugrenzen - nur die
Organisationsverwaltung im Betreiberbereich liest sie. Sobald mehr als eine
Stelle Kennzahlen nach Team, Bezirk oder Region aufteilen soll (Pipeline,
Management-Cockpit, Mitarbeitervergleich, Forecast), braucht es genau eine
Stelle, die "welche Mitarbeiter gehoeren zu diesem Team/Bezirk/Region"
beantwortet - sonst driften zwei Abfragen frueher oder spaeter auseinander.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.rbac import scoped_employee_id
from app.models import District, Employee, Region, Team, User


@dataclass
class TeamChain:
    team_id: str | None
    team_name: str | None
    district_id: str | None
    district_name: str | None
    region_id: str | None
    region_name: str | None


def employee_ids_in_team(db: Session, team_id: str) -> list[str]:
    return list(db.scalars(select(Employee.id).where(Employee.team_id == team_id)).all())


def employee_ids_in_district(db: Session, district_id: str) -> list[str]:
    team_ids = db.scalars(select(Team.id).where(Team.district_id == district_id)).all()
    if not team_ids:
        return []
    return list(db.scalars(select(Employee.id).where(Employee.team_id.in_(team_ids))).all())


def employee_ids_in_region(db: Session, region_id: str) -> list[str]:
    district_ids = db.scalars(select(District.id).where(District.region_id == region_id)).all()
    if not district_ids:
        return []
    team_ids = db.scalars(select(Team.id).where(Team.district_id.in_(district_ids))).all()
    if not team_ids:
        return []
    return list(db.scalars(select(Employee.id).where(Employee.team_id.in_(team_ids))).all())


def resolve_scope_employee_ids(
    db: Session,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
) -> list[str] | None:
    """Mitarbeiter-IDs fuer den engsten angegebenen Ausschnitt.

    Ein Team engt staerker ein als ein Bezirk, ein Bezirk staerker als eine
    Region - deshalb zaehlt die feinste gesetzte Angabe. None heisst: keine
    Einschraenkung ueber die Hierarchie.
    """
    if team_id:
        return employee_ids_in_team(db, team_id)
    if district_id:
        return employee_ids_in_district(db, district_id)
    if region_id:
        return employee_ids_in_region(db, region_id)
    return None


def resolve_management_scope(
    db: Session,
    user: User,
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
) -> str | list[str] | None:
    """Sichtbarer Mitarbeiterausschnitt fuer Auswertungen - eine Stelle fuer
    Pipeline, Management-Cockpit, Mitarbeitervergleich und Forecast.

    scoped_employee_id() bleibt die Grenze dessen, was ein Benutzer ueberhaupt
    sehen darf: ein einfacher Mitarbeiter bekommt dort immer seine eigene ID
    zurueck, ein angegebener fremder Mitarbeiter wird dort abgelehnt. Erst
    wenn diese Pruefung "alles erlaubt" zurueckgibt (kein employee_id, Rang
    mindestens Teamleiter), engt Team/Bezirk/Region das Ergebnis zusaetzlich
    ein - dieselbe Reihenfolge wie in der Pipeline (Block 2).
    """
    scope = scoped_employee_id(db, user, employee_id)
    if scope:
        return scope
    return resolve_scope_employee_ids(db, team_id, district_id, region_id)


def team_chain(db: Session, team_id: str | None) -> TeamChain:
    """Team samt Bezirk und Region eines Mitarbeiters, in einem Aufruf."""
    if not team_id:
        return TeamChain(None, None, None, None, None, None)
    team = db.get(Team, team_id)
    if not team:
        return TeamChain(None, None, None, None, None, None)
    district = db.get(District, team.district_id)
    region = db.get(Region, district.region_id) if district else None
    return TeamChain(
        team_id=team.id,
        team_name=team.name,
        district_id=district.id if district else None,
        district_name=district.name if district else None,
        region_id=region.id if region else None,
        region_name=region.name if region else None,
    )


def org_lookup(db: Session) -> dict:
    """Regionen, Bezirke und Teams als flache Listen - fuer Filterauswahlen.

    Bewusst ohne Mitarbeiterzahlen und ohne Systemadministrator-Pflicht: das
    hier ist nur die Auswahlliste fuer einen Filter, keine Verwaltung. Die
    volle Organisationsverwaltung mit Zaehlung bleibt /sysadmin/org
    vorbehalten.
    """
    regions = [
        {"id": r.id, "name": r.name}
        for r in db.scalars(select(Region).where(Region.is_active.is_(True)).order_by(Region.name)).all()
    ]
    districts = [
        {"id": d.id, "name": d.name, "region_id": d.region_id}
        for d in db.scalars(select(District).where(District.is_active.is_(True)).order_by(District.name)).all()
    ]
    teams = [
        {"id": t.id, "name": t.name, "district_id": t.district_id}
        for t in db.scalars(select(Team).where(Team.is_active.is_(True)).order_by(Team.name)).all()
    ]
    return {"regions": regions, "districts": districts, "teams": teams}
