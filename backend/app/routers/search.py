from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.models import Appointment, Customer, Product, Sale, User
from app.services.serializers import sale_total

router = APIRouter(prefix="/search", tags=["search"])


@router.get("")
def global_search(q: str = Query(min_length=2), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, None)
    term = f"%{q.strip()}%"
    results = []
    cstmt = select(Customer).where(Customer.deleted_at.is_(None), or_(Customer.first_name.ilike(term), Customer.last_name.ilike(term), Customer.city.ilike(term)))
    if scope: cstmt = cstmt.where(Customer.employee_id == scope)
    for c in db.scalars(cstmt.limit(15)).all():
        results.append({"kind":"customer","id":c.id,"title":f"{c.first_name} {c.last_name}","subtitle":f"{c.street} {c.house_number}, {c.postal_code} {c.city}".strip()})
    pselect = select(Product).where(Product.verified.is_(True), Product.active.is_(True), Product.name.ilike(term)).limit(15)
    for p in db.scalars(pselect).all():
        results.append({"kind":"product","id":p.id,"title":p.name,"subtitle":p.category})
    astmt = select(Appointment).join(Customer, Customer.id == Appointment.customer_id, isouter=True).where(or_(Customer.first_name.ilike(term), Customer.last_name.ilike(term), Appointment.notes.ilike(term)))
    if scope: astmt = astmt.where(Appointment.employee_id == scope)
    for a in db.scalars(astmt.limit(15)).all():
        c = db.get(Customer, a.customer_id) if a.customer_id else None
        results.append({"kind":"appointment","id":a.id,"title":f"Termin: {c.first_name} {c.last_name}" if c else "Termin","subtitle":a.start_at.isoformat()})
    sstmt = select(Sale).join(Customer, Customer.id == Sale.customer_id).where(or_(Customer.first_name.ilike(term), Customer.last_name.ilike(term)))
    if scope: sstmt = sstmt.where(Sale.employee_id == scope)
    for s in db.scalars(sstmt.limit(15)).all():
        c = db.get(Customer, s.customer_id)
        results.append({"kind":"sale","id":s.id,"title":f"Verkauf: {c.first_name} {c.last_name}","subtitle":f"{sale_total(db, s.id)/100:.2f} €"})
    return results
