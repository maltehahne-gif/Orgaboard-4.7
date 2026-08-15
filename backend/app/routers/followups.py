"""Wiedervorlagen: was wann bei welchem Kunden ansteht."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import datum_plausibel, fruehestes_datum, local_today, spaetestes_datum
from app.models import (
    Customer,
    Employee,
    FollowUp,
    FollowUpReason,
    FollowUpStatus,
    User,
)
from app.services.realtime import manager

router = APIRouter(prefix="/followups", tags=["followups"])


def _faelligkeit_pruefen(wert: date) -> date:
    """Haelt Tippfehler in der Jahreszahl aus der Wiedervorlage heraus.

    Eine Wiedervorlage aus dem Jahr 1990 waere ab dem ersten Tag ueberfaellig
    und stuende von da an dauerhaft ganz oben in den Tagesprioritaeten - dort,
    wo die Arbeit von heute stehen soll.
    """
    if not datum_plausibel(wert):
        raise ValueError(
            f"Das Datum muss zwischen {fruehestes_datum():%d.%m.%Y} und "
            f"{spaetestes_datum():%d.%m.%Y} liegen"
        )
    return wert


class FollowUpIn(BaseModel):
    customer_id: str
    due_on: date
    reason: FollowUpReason = FollowUpReason.MANUAL
    note: str | None = Field(default=None, max_length=2000)
    employee_id: str | None = None
    appointment_id: str | None = None
    sale_id: str | None = None

    @field_validator("due_on")
    @classmethod
    def faelligkeit(cls, wert: date) -> date:
        return _faelligkeit_pruefen(wert)


class FollowUpUpdate(BaseModel):
    due_on: date | None = None
    note: str | None = Field(default=None, max_length=2000)

    @field_validator("due_on")
    @classmethod
    def faelligkeit(cls, wert: date | None) -> date | None:
        return None if wert is None else _faelligkeit_pruefen(wert)


class FollowUpComplete(BaseModel):
    completed_note: str | None = Field(default=None, max_length=2000)


REASON_LABELS = {
    FollowUpReason.NO_RESULT: "Termin ohne Abschluss",
    FollowUpReason.AFTER_SALE: "Nachbetreuung nach Verkauf",
    FollowUpReason.RENTAL_RETURN: "Gerät zurückholen",
    FollowUpReason.OFFER: "Angebot nachfassen",
    FollowUpReason.MANUAL: "Wiedervorlage",
}


def serialize(db: Session, f: FollowUp) -> dict:
    customer = db.get(Customer, f.customer_id)
    today = local_today()
    return {
        "id": f.id,
        "customer_id": f.customer_id,
        "customer_name": f"{customer.first_name} {customer.last_name}" if customer else "Unbekannt",
        "customer_address": (
            " ".join(x for x in [customer.street, customer.house_number, customer.postal_code, customer.city] if x)
            if customer
            else None
        ),
        "customer_phone": customer.phone if customer else None,
        "employee_id": f.employee_id,
        "due_on": f.due_on,
        "reason": f.reason.value,
        "reason_label": REASON_LABELS.get(f.reason, "Wiedervorlage"),
        "status": f.status.value,
        "note": f.note,
        "appointment_id": f.appointment_id,
        "sale_id": f.sale_id,
        "created_at": f.created_at,
        "completed_at": f.completed_at,
        "completed_note": f.completed_note,
        # Für die Oberfläche vorberechnet, damit sie nicht selbst mit
        # Zeitzonen rechnen muss.
        "is_overdue": f.status == FollowUpStatus.OPEN and f.due_on < today,
        "is_due_today": f.status == FollowUpStatus.OPEN and f.due_on == today,
        "days_overdue": (today - f.due_on).days if f.due_on < today else 0,
    }


def load_scoped(db: Session, user: User, follow_up_id: str) -> FollowUp:
    f = db.get(FollowUp, follow_up_id)
    if not f:
        raise HTTPException(status_code=404, detail="Wiedervorlage nicht gefunden")
    scoped_employee_id(db, user, f.employee_id)
    return f


@router.get("")
def list_follow_ups(
    scope: str = Query(default="open", pattern="^(open|today|overdue|done|all)$"),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Wiedervorlagen im gewählten Ausschnitt.

    open    – alles Offene
    today   – heute fällig oder überfällig (die Arbeitsliste des Tages)
    overdue – nur Überfälliges
    done    – erledigt
    all     – alles
    """
    employee = scoped_employee_id(db, user, employee_id)
    today = local_today()

    stmt = select(FollowUp)
    if employee:
        stmt = stmt.where(FollowUp.employee_id == employee)

    if scope == "open":
        stmt = stmt.where(FollowUp.status == FollowUpStatus.OPEN)
    elif scope == "today":
        stmt = stmt.where(FollowUp.status == FollowUpStatus.OPEN, FollowUp.due_on <= today)
    elif scope == "overdue":
        stmt = stmt.where(FollowUp.status == FollowUpStatus.OPEN, FollowUp.due_on < today)
    elif scope == "done":
        stmt = stmt.where(FollowUp.status == FollowUpStatus.DONE)

    rows = db.scalars(stmt.order_by(FollowUp.due_on, FollowUp.created_at)).all()
    return [serialize(db, f) for f in rows]


@router.get("/summary")
def summary(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zähler für Dashboard und Navigationshinweis."""
    employee = scoped_employee_id(db, user, employee_id)
    today = local_today()

    stmt = select(FollowUp).where(FollowUp.status == FollowUpStatus.OPEN)
    if employee:
        stmt = stmt.where(FollowUp.employee_id == employee)
    rows = db.scalars(stmt).all()

    return {
        "open": len(rows),
        "due_today": len([f for f in rows if f.due_on == today]),
        "overdue": len([f for f in rows if f.due_on < today]),
        "upcoming": len([f for f in rows if f.due_on > today]),
    }


@router.post("", dependencies=[Depends(require_csrf)])
async def create_follow_up(
    data: FollowUpIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    if not db.get(Employee, employee_id):
        raise HTTPException(status_code=404, detail="Mitarbeiter nicht gefunden")

    customer = db.get(Customer, data.customer_id)
    if not customer or customer.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if customer.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Kunde gehört nicht zu diesem Mitarbeiter")

    f = FollowUp(
        customer_id=customer.id,
        employee_id=employee_id,
        due_on=data.due_on,
        reason=data.reason,
        note=data.note,
        appointment_id=data.appointment_id,
        sale_id=data.sale_id,
    )
    db.add(f)
    db.flush()
    audit(db, user, "followup.created", "follow_up", f.id, after={"customer_id": customer.id, "due_on": str(data.due_on)})
    db.commit()

    await manager.publish({"type": "data.changed", "entity": "followup"}, employee_id=employee_id)
    return serialize(db, f)


@router.put("/{follow_up_id}", dependencies=[Depends(require_csrf)])
async def update_follow_up(
    follow_up_id: str,
    data: FollowUpUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = load_scoped(db, user, follow_up_id)
    if f.status != FollowUpStatus.OPEN:
        raise HTTPException(status_code=409, detail="Nur offene Wiedervorlagen lassen sich ändern")

    before = {"due_on": str(f.due_on), "note": f.note}
    if data.due_on is not None:
        f.due_on = data.due_on
    if data.note is not None:
        f.note = data.note

    audit(db, user, "followup.updated", "follow_up", f.id, before=before, after={"due_on": str(f.due_on), "note": f.note})
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "followup"}, employee_id=f.employee_id)
    return serialize(db, f)


@router.post("/{follow_up_id}/complete", dependencies=[Depends(require_csrf)])
async def complete_follow_up(
    follow_up_id: str,
    data: FollowUpComplete,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = load_scoped(db, user, follow_up_id)
    if f.status != FollowUpStatus.OPEN:
        raise HTTPException(status_code=409, detail="Diese Wiedervorlage ist bereits abgeschlossen")

    f.status = FollowUpStatus.DONE
    f.completed_at = datetime.now(timezone.utc)
    f.completed_note = data.completed_note

    audit(db, user, "followup.completed", "follow_up", f.id, after={"completed_note": data.completed_note})
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "followup"}, employee_id=f.employee_id)
    return serialize(db, f)


@router.post("/{follow_up_id}/cancel", dependencies=[Depends(require_csrf)])
async def cancel_follow_up(
    follow_up_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    f = load_scoped(db, user, follow_up_id)
    if f.status != FollowUpStatus.OPEN:
        raise HTTPException(status_code=409, detail="Diese Wiedervorlage ist bereits abgeschlossen")

    f.status = FollowUpStatus.CANCELLED
    f.completed_at = datetime.now(timezone.utc)

    audit(db, user, "followup.cancelled", "follow_up", f.id)
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "followup"}, employee_id=f.employee_id)
    return serialize(db, f)
