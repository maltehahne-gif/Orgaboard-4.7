from datetime import date, datetime
from pydantic import BaseModel, HttpUrl
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import require_team_leader
from app.core.security import get_current_user, require_csrf
from app.models import Product, User
from app.services.product_data import upsert_verified_product
from app.services.serializers import product_out

router = APIRouter(prefix="/products", tags=["products"])


class PricePayload(BaseModel):
    amount_cents: int
    currency: str = "EUR"
    source_url: str
    verified: bool = False
    valid_from: date | None = None
    valid_to: date | None = None


class ImagePayload(BaseModel):
    url: str
    source_url: str
    alt_text: str | None = None
    usage_note: str | None = None
    verified: bool = False


class ProductImport(BaseModel):
    name: str
    category: str = ""
    description: str | None = None
    functions: list[str] = []
    technical: dict = {}
    variants: list = []
    accessories: list = []
    official_url: str | None = None
    source_url: str
    source_kind: str = "manual_verified"
    source_updated_at: datetime | None = None
    verified: bool = False
    price: PricePayload | None = None
    image: ImagePayload | None = None


@router.get("")
def list_products(q: str | None = Query(default=None), include_unverified: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.name)
    if not include_unverified or user.role.value != "TEAM_LEADER":
        stmt = stmt.where(Product.verified.is_(True))
    if q:
        stmt = stmt.where(Product.name.ilike(f"%{q}%"))
    return [product_out(db, p) for p in db.scalars(stmt).all()]


@router.get("/{product_id}")
def product_detail(product_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p or not p.active or (not p.verified and user.role.value != "TEAM_LEADER"):
        raise HTTPException(status_code=404, detail="Produkt nicht gefunden")
    return product_out(db, p)


@router.post("/import", dependencies=[Depends(require_csrf)])
def import_product(data: ProductImport, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_team_leader(user)
    if data.verified and not data.source_url:
        raise HTTPException(status_code=400, detail="Verifizierte Produktdaten benötigen eine nachvollziehbare Quelle")
    if data.price and data.price.verified and not data.price.source_url:
        raise HTTPException(status_code=400, detail="Verifizierte Preise benötigen eine Quelle")
    payload = data.model_dump()
    p = upsert_verified_product(db, payload)
    db.flush()
    audit(db, user, "product.imported", "product", p.id, after={"name": p.name, "source_url": p.source_url, "verified": p.verified})
    db.commit()
    return product_out(db, p)
