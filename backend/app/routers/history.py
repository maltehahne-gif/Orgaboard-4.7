from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.models import Customer, Product, Sale, SaleItem, User

router = APIRouter(prefix="/history", tags=["history"])


@router.get("")
def customer_history(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Customer).where(Customer.deleted_at.is_(None)).order_by(Customer.last_name, Customer.first_name)
    if scope:
        stmt = stmt.where(Customer.employee_id == scope)
    result = []
    for c in db.scalars(stmt).all():
        sales = db.scalars(select(Sale).where(Sale.customer_id == c.id).order_by(Sale.sold_at.desc())).all()
        purchased = []
        for s in sales:
            items = db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all()
            purchased.extend([{"name": i.product_name_snapshot, "quantity": i.quantity, "unit_price_cents": i.unit_price_cents, "sold_at": s.sold_at} for i in items])
        if sales or c.phone or c.email:
            result.append({
                "customer_id": c.id, "name": f"{c.first_name} {c.last_name}",
                "address": " ".join(x for x in [c.street, c.house_number, c.postal_code, c.city] if x),
                "phone": c.phone, "email": c.email, "purchased_products": purchased,
            })
    return result
