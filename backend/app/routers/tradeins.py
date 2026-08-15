"""Altgeraete: bei Kunden hereingenommene Geraete erfassen und nachverfolgen.

Sichtbarkeit folgt derselben Regel wie ueberall: Mitarbeiter sehen ihre
eigenen Altgeraete, Teamleiter den ganzen Bestand und koennen auf einen
einzelnen Mitarbeiter einschraenken.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Customer, Sale, TradeIn, TradeInCondition, TradeInStatus, User

router = APIRouter(prefix="/tradeins", tags=["tradeins"])

CONDITION_LABELS = {
    TradeInCondition.WORKING: "Funktionsfähig",
    TradeInCondition.DEFECTIVE: "Defekt",
    TradeInCondition.PARTS: "Nur Ersatzteile",
    TradeInCondition.UNKNOWN: "Noch nicht geprüft",
}

STATUS_LABELS = {
    TradeInStatus.RECEIVED: "Angenommen",
    TradeInStatus.STORED: "Eingelagert",
    TradeInStatus.RETURNED: "Zurückgegeben",
    TradeInStatus.DISPOSED: "Entsorgt",
    TradeInStatus.SOLD: "Weiterverkauft",
}


class TradeInIn(BaseModel):
    customer_id: str
    model: str = Field(min_length=1, max_length=255)
    serial_number: str | None = Field(default=None, max_length=120)
    condition: TradeInCondition = TradeInCondition.UNKNOWN
    status: TradeInStatus = TradeInStatus.RECEIVED
    received_on: date
    notes: str | None = Field(default=None, max_length=2000)
    sale_id: str | None = None
    employee_id: str | None = None


class TradeInUpdate(BaseModel):
    model: str | None = Field(default=None, min_length=1, max_length=255)
    serial_number: str | None = Field(default=None, max_length=120)
    condition: TradeInCondition | None = None
    status: TradeInStatus | None = None
    received_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    sale_id: str | None = None


def _out(db: Session, row: TradeIn) -> dict:
    customer = db.get(Customer, row.customer_id)
    return {
        "id": row.id,
        "customer_id": row.customer_id,
        "customer_name": f"{customer.first_name} {customer.last_name}" if customer else "Unbekannt",
        "employee_id": row.employee_id,
        "sale_id": row.sale_id,
        "model": row.model,
        "serial_number": row.serial_number,
        "condition": row.condition.value,
        "condition_label": CONDITION_LABELS[row.condition],
        "status": row.status.value,
        "status_label": STATUS_LABELS[row.status],
        "received_on": row.received_on,
        "notes": row.notes,
        "created_at": row.created_at,
    }


def _hole(db: Session, user: User, trade_in_id: str) -> TradeIn:
    row = db.get(TradeIn, trade_in_id)
    if not row:
        raise HTTPException(status_code=404, detail="Altgerät nicht gefunden")
    # Wirft, sobald jemand auf ein fremdes Geraet zugreifen will.
    scoped_employee_id(db, user, row.employee_id)
    return row


@router.get("")
def liste(
    q: str | None = Query(default=None),
    status: TradeInStatus | None = None,
    condition: TradeInCondition | None = None,
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Altgeraete mit Suche ueber Modell, Seriennummer und Kundenname."""
    scope = scoped_employee_id(db, user, employee_id)

    stmt = select(TradeIn).order_by(TradeIn.received_on.desc(), TradeIn.created_at.desc())
    if scope:
        stmt = stmt.where(TradeIn.employee_id == scope)
    if status:
        stmt = stmt.where(TradeIn.status == status)
    if condition:
        stmt = stmt.where(TradeIn.condition == condition)

    if q and q.strip():
        begriff = f"%{q.strip()}%"
        # Kundennamen liegen in einer anderen Tabelle - passende Kunden
        # vorab suchen, statt ueber einen Join die Sichtbarkeit aufzuweichen.
        kunden = db.scalars(
            select(Customer.id).where(
                or_(
                    Customer.first_name.ilike(begriff),
                    Customer.last_name.ilike(begriff),
                )
            )
        ).all()
        stmt = stmt.where(
            or_(
                TradeIn.model.ilike(begriff),
                TradeIn.serial_number.ilike(begriff),
                TradeIn.customer_id.in_(kunden) if kunden else False,
            )
        )

    return [_out(db, row) for row in db.scalars(stmt).all()]


@router.get("/summary")
def zusammenfassung(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zaehler je Status - fuer Filterknoepfe und spaetere Kennzahlen."""
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(TradeIn)
    if scope:
        stmt = stmt.where(TradeIn.employee_id == scope)
    rows = db.scalars(stmt).all()
    return {
        "total": len(rows),
        **{status.value: len([r for r in rows if r.status == status]) for status in TradeInStatus},
    }


@router.post("", dependencies=[Depends(require_csrf)])
def anlegen(
    data: TradeInIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen zuständigen Mitarbeiter auswählen")

    kunde = db.get(Customer, data.customer_id)
    if not kunde or kunde.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    if data.sale_id and not db.get(Sale, data.sale_id):
        raise HTTPException(status_code=404, detail="Verkauf nicht gefunden")

    row = TradeIn(
        customer_id=data.customer_id,
        employee_id=employee_id,
        sale_id=data.sale_id,
        model=data.model.strip(),
        serial_number=(data.serial_number or "").strip() or None,
        condition=data.condition,
        status=data.status,
        received_on=data.received_on,
        notes=data.notes,
    )
    db.add(row)
    db.flush()
    audit(db, user, "tradein.created", "tradein", row.id, after=_out(db, row))
    db.commit()
    return _out(db, row)


@router.put("/{trade_in_id}", dependencies=[Depends(require_csrf)])
def aendern(
    trade_in_id: str,
    data: TradeInUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _hole(db, user, trade_in_id)
    vorher = _out(db, row)

    if data.sale_id is not None and data.sale_id and not db.get(Sale, data.sale_id):
        raise HTTPException(status_code=404, detail="Verkauf nicht gefunden")

    for feld, wert in data.model_dump(exclude_unset=True).items():
        if feld == "model" and wert is not None:
            wert = wert.strip()
        if feld == "serial_number":
            wert = (wert or "").strip() or None
        setattr(row, feld, wert)

    audit(db, user, "tradein.updated", "tradein", row.id, before=vorher, after=_out(db, row))
    db.commit()
    return _out(db, row)


@router.delete("/{trade_in_id}", dependencies=[Depends(require_csrf)])
def loeschen(
    trade_in_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = _hole(db, user, trade_in_id)
    vorher = _out(db, row)
    db.delete(row)
    audit(db, user, "tradein.deleted", "tradein", trade_in_id, before=vorher)
    db.commit()
    return {"ok": True}
