from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Employee, Role, User


def require_team_leader(user: User) -> User:
    if user.role != Role.TEAM_LEADER:
        raise HTTPException(status_code=403, detail="Nur für Teamleiter")
    return user


def current_employee(db: Session, user: User) -> Employee:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if not employee:
        raise HTTPException(status_code=403, detail="Kein Mitarbeiterprofil zugeordnet")
    return employee


def scoped_employee_id(db: Session, user: User, requested_employee_id: str | None = None) -> str | None:
    if user.role == Role.TEAM_LEADER:
        return requested_employee_id
    employee = current_employee(db, user)
    if requested_employee_id and requested_employee_id != employee.id:
        raise HTTPException(status_code=403, detail="Zugriff auf fremde Mitarbeiterdaten ist nicht erlaubt")
    return employee.id


def resolve_employee_by_name(db: Session, user: User, name: str | None) -> Employee:
    if not name:
        return current_employee(db, user)
    if user.role != Role.TEAM_LEADER:
        own = current_employee(db, user)
        if name.casefold() not in own.display_name.casefold():
            raise HTTPException(status_code=403, detail="Zugriff auf fremde Mitarbeiterdaten ist nicht erlaubt")
        return own
    candidates = db.scalars(select(Employee).where(Employee.display_name.ilike(f"%{name}%"))).all()
    if len(candidates) != 1:
        raise HTTPException(status_code=400, detail="Mitarbeitername ist nicht eindeutig")
    return candidates[0]
