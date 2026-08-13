"""Import the manually verified K70 material catalogue.

Run inside the backend container with ``python -m app.import_k70_catalog``.
The import is idempotent and uses the article number as its stable identifier.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Product, ProductPrice


CATALOG_PATH = Path(__file__).with_name("catalog") / "k70_products.json"
SOURCE = "K70-Material Bestellformular · Nutzerfotos vom 13.08.2026"


def article_number(product: Product) -> str:
    technical = product.technical_json or {}
    return str(technical.get("article_number") or "").strip().casefold()


def import_catalog() -> tuple[int, int, int]:
    rows = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    created = updated = prices_created = 0

    with SessionLocal() as db:
        existing = db.scalars(select(Product)).all()
        by_article = {article_number(product): product for product in existing if article_number(product)}
        by_name = {product.name.casefold(): product for product in existing}

        for row in rows:
            sku = str(row["article_number"]).strip()
            product = by_article.get(sku.casefold())
            if product is None:
                candidates = [row["name"], *row.get("aliases", [])]
                product = next((by_name.get(name.casefold()) for name in candidates if by_name.get(name.casefold())), None)

            if product is None:
                product = Product(name=row["name"])
                db.add(product)
                db.flush()
                existing.append(product)
                by_name[product.name.casefold()] = product
                created += 1
            else:
                updated += 1

            technical = dict(product.technical_json or {})
            technical.update({
                "article_number": sku,
                "k70_group": row["group"],
                "available": row.get("available", True),
            })
            product.category = "K70"
            product.description = product.description or f"K70-Material · {row['group']} · Artikel-Nr. {sku}"
            product.technical_json = technical
            product.source_url = SOURCE
            product.source_kind = "manual_verified_from_customer_material"
            product.source_updated_at = datetime.now(timezone.utc)
            product.verified = True
            product.active = bool(row.get("available", True))
            by_article[sku.casefold()] = product

            price_cents = int(row["price_cents"])
            same_price = db.scalar(
                select(ProductPrice.id).where(
                    ProductPrice.product_id == product.id,
                    ProductPrice.amount_cents == price_cents,
                    ProductPrice.verified.is_(True),
                    ProductPrice.valid_to.is_(None),
                ).limit(1)
            )
            if same_price is None:
                db.add(ProductPrice(
                    product_id=product.id,
                    amount_cents=price_cents,
                    currency="EUR",
                    source_url=SOURCE,
                    fetched_at=datetime.now(timezone.utc),
                    verified=True,
                ))
                prices_created += 1

        db.commit()

    return created, updated, prices_created


if __name__ == "__main__":
    created, updated, prices_created = import_catalog()
    print(f"K70-Import abgeschlossen: {created} neu, {updated} aktualisiert, {prices_created} Preise ergänzt.")
