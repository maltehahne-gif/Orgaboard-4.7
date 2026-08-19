from datetime import date, datetime
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.models import Customer, Employee, Product, ProductImage, ProductPrice, Sale, SaleItem, User
from app.core.timeutils import local_today
from app.services.stats import is_k70_category, product_unit_count_from_name


def customer_name(db: Session, customer_id: str | None) -> str | None:
    if not customer_id:
        return None
    c = db.get(Customer, customer_id)
    return f"{c.first_name} {c.last_name}" if c else None


def employee_name(db: Session, employee_id: str) -> str:
    e = db.get(Employee, employee_id)
    return e.display_name if e else "Unbekannt"


def current_price(db: Session, product_id: str) -> ProductPrice | None:
    today = local_today()
    return db.scalar(
        select(ProductPrice)
        .where(
            ProductPrice.product_id == product_id,
            ProductPrice.verified.is_(True),
            (ProductPrice.valid_from.is_(None) | (ProductPrice.valid_from <= today)),
            (ProductPrice.valid_to.is_(None) | (ProductPrice.valid_to >= today)),
        )
        .order_by(ProductPrice.valid_from.desc().nullslast(), ProductPrice.fetched_at.desc())
    )


def product_out(db: Session, p: Product) -> dict:
    price = current_price(db, p.id)
    image = db.scalar(select(ProductImage).where(ProductImage.product_id == p.id, ProductImage.verified.is_(True)).order_by(ProductImage.fetched_at.desc()))
    return {
        "id": p.id,
        "name": p.name,
        "category": p.category,
        "description": p.description,
        "functions": p.functions_json or [],
        "technical": p.technical_json or {},
        "variants": p.variants_json or [],
        "accessories": p.accessories_json or [],
        "official_url": p.official_url,
        "source_url": p.source_url,
        "source_kind": p.source_kind,
        "source_updated_at": p.source_updated_at,
        "verified": p.verified,
        "price": None if not price else {"amount_cents": price.amount_cents, "currency": price.currency, "source_url": price.source_url, "fetched_at": price.fetched_at},
        "image": None if not image else {"url": image.url, "alt_text": image.alt_text, "source_url": image.source_url, "usage_note": image.usage_note},
    }


def sale_total(db: Session, sale_id: str) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(SaleItem.quantity * SaleItem.unit_price_cents), 0)).where(SaleItem.sale_id == sale_id)) or 0)


def sale_units(db: Session, sale_id: str) -> int:
    rows = db.execute(
        select(SaleItem.quantity, Product.name, Product.category)
        .select_from(SaleItem)
        .outerjoin(Product, Product.id == SaleItem.product_id)
        .where(SaleItem.sale_id == sale_id)
    ).all()
    return sum(
        int(quantity or 0) * product_unit_count_from_name(product_name)
        for quantity, product_name, category in rows
        if not is_k70_category(category)
    )

