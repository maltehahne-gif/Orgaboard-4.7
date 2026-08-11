from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Customer, User

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
