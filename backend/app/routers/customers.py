from datetime import datetime, timezone
from pydantic import BaseModel, EmailStr, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import current_employee, scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Customer, CustomerNote, Employee, User
from app.services.timeline import FUNNEL_LABELS, customer_timeline, funnel_stage

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerIn(BaseModel):
    first_name: str
    last_name: str
    street: str = ""
    house_number: str = ""
    postal_code: str = ""
    city: str = ""
    phone: str | None = None
    email: EmailStr | None = None
    notes: str | None = None
    employee_id: str | None = None


def out(c: Customer):
    return {
        "id": c.id, "employee_id": c.employee_id, "first_name": c.first_name, "last_name": c.last_name,
        "street": c.street, "house_number": c.house_number, "postal_code": c.postal_code, "city": c.city,
        "phone": c.phone, "email": c.email, "notes": c.notes,
        "created_at": c.created_at,
        "full_name": f"{c.first_name} {c.last_name}",
        "address": " ".join(x for x in [c.street, c.house_number, c.postal_code, c.city] if x),
    }


@router.get("")
def list_customers(q: str | None = Query(default=None), employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Customer).where(Customer.deleted_at.is_(None)).order_by(Customer.last_name, Customer.first_name)
    if scope:
        stmt = stmt.where(Customer.employee_id == scope)
    if q:
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Customer.first_name.ilike(term), Customer.last_name.ilike(term), Customer.city.ilike(term), Customer.phone.ilike(term)))
    return [out(c) for c in db.scalars(stmt).all()]


@router.get("/{customer_id}")
def get_customer(customer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    scoped_employee_id(db, user, c.employee_id)
    return out(c)


@router.post("", dependencies=[Depends(require_csrf)])
def create_customer(data: CustomerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen zuständigen Mitarbeiter auswählen")
    c = Customer(employee_id=employee_id, **data.model_dump(exclude={"employee_id"}))
    db.add(c); db.flush()
    audit(db, user, "customer.created", "customer", c.id, after=out(c))
    db.commit()
    return out(c)


@router.put("/{customer_id}", dependencies=[Depends(require_csrf)])
def update_customer(customer_id: str, data: CustomerIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    scoped_employee_id(db, user, c.employee_id)
    before = out(c)
    for key, value in data.model_dump(exclude={"employee_id"}).items():
        setattr(c, key, value)
    if data.employee_id:
        c.employee_id = scoped_employee_id(db, user, data.employee_id) or c.employee_id
    audit(db, user, "customer.updated", "customer", c.id, before=before, after=out(c))
    db.commit()
    return out(c)


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


@router.get("/{customer_id}/timeline")
def customer_timeline_view(
    customer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Komplette Kundenhistorie auf einen Blick.

    Termine, Vorführungen, Verkäufe, Verleih, Notizen und Wiedervorlagen in
    einer Zeitleiste, dazu die abgeleitete Trichterstufe.
    """
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    scoped_employee_id(db, user, c.employee_id)

    stage = funnel_stage(db, c.id)
    return {
        "customer": out(c),
        "funnel_stage": stage.value,
        "funnel_label": FUNNEL_LABELS[stage],
        "events": customer_timeline(db, c.id),
    }


@router.get("/{customer_id}/notes")
def list_notes(
    customer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    scoped_employee_id(db, user, c.employee_id)

    rows = db.scalars(
        select(CustomerNote)
        .where(CustomerNote.customer_id == c.id)
        .order_by(CustomerNote.created_at.desc())
    ).all()
    return [
        {
            "id": n.id,
            "body": n.body,
            "created_at": n.created_at,
            "author": (e.display_name if (e := db.get(Employee, n.employee_id)) else None),
        }
        for n in rows
    ]


@router.post("/{customer_id}/notes", dependencies=[Depends(require_csrf)])
def create_note(
    customer_id: str,
    data: NoteIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    scoped_employee_id(db, user, c.employee_id)

    # Die Notiz wird dem angemeldeten Mitarbeiter zugeschrieben. Ein Teamleiter,
    # der bei einem fremden Kunden notiert, erscheint mit seinem eigenen Namen -
    # das ist gewollt, sonst waere der Verlauf nicht nachvollziehbar.
    author = current_employee(db, user)

    note = CustomerNote(customer_id=c.id, employee_id=author.id, body=data.body.strip())
    db.add(note)
    db.flush()
    audit(db, user, "customer.note_added", "customer", c.id, after={"note_id": note.id})
    db.commit()
    return {
        "id": note.id,
        "body": note.body,
        "created_at": note.created_at,
        "author": author.display_name,
    }


@router.delete("/{customer_id}", status_code=204, dependencies=[Depends(require_csrf)])
def delete_customer(
    customer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.get(Customer, customer_id)

    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")

    # Mitarbeiter nur eigene Kunden, Teamleiter darf alle.
    scoped_employee_id(db, user, c.employee_id)

    before = out(c)

    # Kunde wird absichtlich nicht physisch gelöscht.
    # Dadurch bleiben Verkäufe, Termine und Kundenhistorie erhalten.
    c.deleted_at = datetime.now(timezone.utc)

    audit(
        db,
        user,
        "customer.deleted",
        "customer",
        c.id,
        before=before,
        after={"deleted": True},
    )

    db.commit()
    return None
