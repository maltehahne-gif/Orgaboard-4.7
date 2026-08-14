from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Customer, Product, ProductPresentation, User

router = APIRouter(prefix="/presentations", tags=["presentations"])


class PresentationIn(BaseModel):
    customer_id: str
    employee_id: str | None = None
    appointment_id: str | None = None
    product_id: str
    presented_at: datetime
    notes: str | None = None


@router.get("")
def list_presentations(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(ProductPresentation).order_by(ProductPresentation.presented_at.desc())
    if scope:
        stmt = stmt.where(ProductPresentation.employee_id == scope)
    rows = db.scalars(stmt).all()
    result = []
    for row in rows:
        c = db.get(Customer, row.customer_id); p = db.get(Product, row.product_id)
        result.append({"id": row.id, "customer_id": row.customer_id, "customer_name": f"{c.first_name} {c.last_name}" if c else None, "product_id": row.product_id, "product_name": p.name if p else None, "appointment_id": row.appointment_id, "presented_at": row.presented_at, "notes": row.notes})
    return result


@router.post("", dependencies=[Depends(require_csrf)])
def create_presentation(data: PresentationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Mitarbeiter fehlt")
    c = db.get(Customer, data.customer_id); p = db.get(Product, data.product_id)
    if not c or not p or not p.verified or not p.active:
        raise HTTPException(status_code=400, detail="Kunde oder aktives, verifiziertes Produkt nicht gefunden")
    row = ProductPresentation(employee_id=employee_id, **data.model_dump(exclude={"employee_id"}))
    db.add(row); db.flush(); audit(db, user, "presentation.created", "product_presentation", row.id); db.commit()
    return {"id": row.id}
