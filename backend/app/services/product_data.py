"""Controlled product-data ingestion.

No scraper is bundled intentionally. Only official/licensed sources should feed this service.
Every record stores source URL, verification state and timestamps so the UI can refuse to
show uncertain prices/images as facts.
"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Product, ProductImage, ProductPrice


def upsert_verified_product(db: Session, payload: dict) -> Product:
    product = db.query(Product).filter(Product.name == payload["name"]).one_or_none()
    if not product:
        product = Product(name=payload["name"])
        db.add(product)
        db.flush()
    product.category = payload.get("category", "")
    product.description = payload.get("description")
    product.functions_json = payload.get("functions", [])
    product.technical_json = payload.get("technical", {})
    product.variants_json = payload.get("variants", [])
    product.accessories_json = payload.get("accessories", [])
    product.official_url = payload.get("official_url")
    product.source_url = payload.get("source_url")
    product.source_kind = payload.get("source_kind", "manual_verified")
    product.source_updated_at = payload.get("source_updated_at") or datetime.now(timezone.utc)
    product.verified = bool(payload.get("verified", False))
    if payload.get("price"):
        price = payload["price"]
        db.add(ProductPrice(
            product_id=product.id,
            amount_cents=int(price["amount_cents"]),
            currency=price.get("currency", "EUR"),
            valid_from=price.get("valid_from"),
            valid_to=price.get("valid_to"),
            source_url=price["source_url"],
            verified=bool(price.get("verified", False)),
        ))
    if payload.get("image"):
        image = payload["image"]
        db.add(ProductImage(
            product_id=product.id,
            url=image["url"],
            alt_text=image.get("alt_text"),
            source_url=image["source_url"],
            usage_note=image.get("usage_note"),
            verified=bool(image.get("verified", False)),
        ))
    return product
