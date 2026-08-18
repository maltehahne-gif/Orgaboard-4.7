"""Sichtbarkeit: wer wessen Daten sehen und aendern darf.

Alle Pruefungen laufen ueber sieht_fremde_daten() bzw. den Rollenrang, nie
ueber einen Vergleich auf eine einzelne Rolle. Sonst wuerde eine hoehere
Stufe - Regionalleiter, Systemadministrator - weniger sehen als ein
Teamleiter, und das faellt beim Lesen des Codes nicht auf.
"""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.permissions import sieht_fremde_daten
from app.models import Employee, Role, User


def require_team_leader(user: User) -> User:
    """Mindestens Teamleiter.

    Der Name bleibt, weil er an 27 Stellen steht und dort weiterhin das
    Richtige aussagt. Geprueft wird der Rang: Regionalleiter und
    Systemadministrator kommen damit ebenfalls durch, statt an einer
    Gleichheitspruefung zu scheitern.
    """
    if not user.role.mindestens(Role.TEAM_LEADER):
        raise HTTPException(status_code=403, detail="Nur für Teamleiter")
    return user


def current_employee(db: Session, user: User) -> Employee:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if not employee:
        raise HTTPException(status_code=403, detail="Kein Mitarbeiterprofil zugeordnet")
    return employee


def scoped_employee_id(db: Session, user: User, requested_employee_id: str | None = None) -> str | None:
    if sieht_fremde_daten(user):
        if requested_employee_id is None:
            return None
        # Nur die Sichtbarkeit war bisher geprueft, nicht die Existenz: eine
        # erfundene oder vertippte ID lief unveraendert bis in die Zuordnung
        # durch - in SQLite ohne Fremdschluessel-Durchsetzung unbemerkt, in
        # Produktion (PostgreSQL) als rohe 500er-Antwort statt einer
        # verstaendlichen Fehlermeldung.
        if db.get(Employee, requested_employee_id) is None:
            raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")
        return requested_employee_id
    employee = current_employee(db, user)
    if requested_employee_id and requested_employee_id != employee.id:
        raise HTTPException(status_code=403, detail="Zugriff auf fremde Mitarbeiterdaten ist nicht erlaubt")
    return employee.id


def resolve_employee_by_name(db: Session, user: User, name: str | None) -> Employee:
    if not name:
        return current_employee(db, user)
    if not sieht_fremde_daten(user):
        own = current_employee(db, user)
        if name.casefold() not in own.display_name.casefold():
            raise HTTPException(status_code=403, detail="Zugriff auf fremde Mitarbeiterdaten ist nicht erlaubt")
        return own
    # Auch die Namenssuche laeuft durch die Sichtbarkeit: sonst waere sie der
    # bequemste Weg, an ein Konto zu kommen, das in keiner Liste steht.
    from app.core.benutzerscope import mitarbeiter_sichtbar_filter

    candidates = db.scalars(
        select(Employee).where(
            Employee.display_name.ilike(f"%{name}%"),
            mitarbeiter_sichtbar_filter(user),
        )
    ).all()
    if len(candidates) != 1:
        raise HTTPException(status_code=400, detail="Mitarbeitername ist nicht eindeutig")
    return candidates[0]
