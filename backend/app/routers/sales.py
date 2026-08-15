from datetime import datetime, timezone
from io import BytesIO
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.permissions import sieht_fremde_daten
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import require_team_leader, scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import local_today
from app.models import Customer, Product, Sale, SaleChannel, SaleItem, User
from app.services.realtime import manager
from app.services.serializers import employee_name, sale_total, sale_units
from app.services.stats import refresh_weekly_stat

router = APIRouter(prefix="/sales", tags=["sales"])

CHANNEL_LABELS = {"field": "Außendienst", "promotion": "Promotion", "k70": "K70", "other": "Sonstiges"}


class SaleItemIn(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=999)
    unit_price_cents: int = Field(ge=0)


class SaleCancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class SaleIn(BaseModel):
    customer_id: str
    employee_id: str | None = None
    appointment_id: str | None = None
    sold_at: datetime
    channel: SaleChannel = SaleChannel.OTHER
    notes: str | None = None
    items: list[SaleItemIn]


def serialize(db: Session, s: Sale):
    c = db.get(Customer, s.customer_id)
    items = db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all()
    return {
        "id": s.id, "customer_id": s.customer_id,
        "customer_name": f"{c.first_name} {c.last_name}" if c else "Unbekannt",
        "employee_id": s.employee_id, "appointment_id": s.appointment_id, "sold_at": s.sold_at,
        "channel": s.channel.value, "notes": s.notes,
        "cancelled": s.cancelled_at is not None,
        "cancelled_at": s.cancelled_at,
        "cancellation_reason": s.cancellation_reason,
        "items": [{"id": i.id, "product_id": i.product_id, "name": i.product_name_snapshot, "quantity": i.quantity, "unit_price_cents": i.unit_price_cents, "total_cents": i.quantity*i.unit_price_cents} for i in items],
        "total_cents": sum(i.quantity*i.unit_price_cents for i in items),
        "units": sale_units(db, s.id),
        # Was der Verkauf zu den Kennzahlen beitraegt. Bei einem Storno null,
        # ohne dass die urspruenglichen Betraege verschwinden.
        "counts_total_cents": 0 if s.cancelled_at else sum(i.quantity*i.unit_price_cents for i in items),
        "counts_units": 0 if s.cancelled_at else sale_units(db, s.id),
    }


@router.get("")
def list_sales(employee_id: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Sale).order_by(Sale.sold_at.desc())
    if scope:
        stmt = stmt.where(Sale.employee_id == scope)
    return [serialize(db, s) for s in db.scalars(stmt).all()]


@router.get("/export.xlsx")
def export_sales(ids: list[str] = Query(default=[]), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Verkaufsdaten als Excel-Datei. Ohne `ids` wird der komplette
    sichtbare Bestand exportiert; die Oberfläche schickt normalerweise die
    Verkäufe, die nach den aktiven Filtern gerade angezeigt werden."""
    scope = scoped_employee_id(db, user, None)
    stmt = select(Sale).order_by(Sale.sold_at.desc())
    if ids:
        stmt = stmt.where(Sale.id.in_(ids))
    if scope:
        stmt = stmt.where(Sale.employee_id == scope)
    sales = db.scalars(stmt).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Verkäufe"
    headers = ["Datum", "Kunde", "Mitarbeiter", "Produkt", "Menge", "Einzelpreis", "Gesamtpreis", "Kanal", "Storniert", "Stornogrund"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    for s in sales:
        customer = db.get(Customer, s.customer_id)
        customer_label = f"{customer.first_name} {customer.last_name}" if customer else "Unbekannt"
        items = db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all()
        cancelled = s.cancelled_at is not None
        for item in items:
            ws.append([
                s.sold_at.replace(tzinfo=None) if s.sold_at else None,
                customer_label,
                employee_name(db, s.employee_id),
                item.product_name_snapshot,
                item.quantity,
                item.unit_price_cents / 100,
                item.quantity * item.unit_price_cents / 100,
                CHANNEL_LABELS.get(s.channel.value, s.channel.value),
                "Ja" if cancelled else "Nein",
                s.cancellation_reason or "",
            ])

    for column_cells in ws.columns:
        length = max((len(str(c.value)) for c in column_cells if c.value is not None), default=10)
        ws.column_dimensions[column_cells[0].column_letter].width = min(max(length + 2, 12), 40)

    buffer = BytesIO()
    wb.save(buffer)
    buffer.seek(0)

    filename = f"Verkaufsdaten_{local_today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", dependencies=[Depends(require_csrf)])
async def create_sale(data: SaleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")
    c = db.get(Customer, data.customer_id)
    if not c or c.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if not sieht_fremde_daten(user) and c.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Kunde gehört nicht zu diesem Mitarbeiter")
    if not data.items:
        raise HTTPException(status_code=400, detail="Ein Verkauf benötigt mindestens ein Produkt")
    resolved: list[tuple[Product, SaleItemIn]] = []
    for item in data.items:
        p = db.get(Product, item.product_id)
        # Auch auf active pruefen: sonst liesse sich ein archiviertes Produkt
        # weiter verkaufen und das Archivieren waere reine Zierde.
        if not p or not p.verified or not p.active:
            raise HTTPException(status_code=400, detail="Nur aktive, verifizierte Produkte dürfen verkauft werden")
        resolved.append((p, item))
    s = Sale(customer_id=data.customer_id, employee_id=employee_id, appointment_id=data.appointment_id, sold_at=data.sold_at, channel=data.channel, notes=data.notes)
    db.add(s); db.flush()
    for p, item in resolved:
        db.add(SaleItem(sale_id=s.id, product_id=p.id, product_name_snapshot=p.name, quantity=item.quantity, unit_price_cents=item.unit_price_cents))
    db.flush()
    refresh_weekly_stat(db, employee_id, s.sold_at.date())
    audit(db, user, "sale.created", "sale", s.id, after=serialize(db, s))
    db.commit()
    await manager.publish({"type":"data.changed","entity":"sale"}, employee_id=employee_id)
    return serialize(db, s)

@router.post("/{sale_id}/cancel", dependencies=[Depends(require_csrf)])
async def cancel_sale(
    sale_id: str,
    data: SaleCancelIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verkauf stornieren.

    Ersetzt das bisherige Loeschen. Der Verkauf bleibt vollstaendig erhalten -
    mit Positionen, Kunde und Datum - zaehlt aber in keiner Auswertung mehr.
    Loeschen zerstoerte die Nachvollziehbarkeit, was gerade dann schmerzt,
    wenn spaeter jemand fragt, warum eine Provision anders ausfiel.
    """
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Verkauf nicht gefunden")

    if not sieht_fremde_daten(user):
        eigener = scoped_employee_id(db, user, None)
        if sale.employee_id != eigener:
            raise HTTPException(
                status_code=403,
                detail="Du darfst nur deine eigenen Verkäufe stornieren",
            )

    if sale.cancelled_at:
        raise HTTPException(status_code=409, detail="Dieser Verkauf ist bereits storniert")

    before = serialize(db, sale)

    sale.cancelled_at = datetime.now(timezone.utc)
    sale.cancelled_by_user_id = user.id
    sale.cancellation_reason = (data.reason or "").strip() or None
    db.flush()

    # Wochenstatistik neu rechnen, damit der Umsatz sofort stimmt.
    refresh_weekly_stat(db, sale.employee_id, sale.sold_at.date())

    audit(db, user, "sale.cancelled", "sale", sale_id, before=before, after=serialize(db, sale))
    db.commit()

    await manager.publish(
        {"type": "data.changed", "entity": "sale", "action": "cancelled", "id": sale_id},
        employee_id=sale.employee_id,
    )
    return serialize(db, sale)


@router.post("/{sale_id}/restore", dependencies=[Depends(require_csrf)])
async def restore_sale(
    sale_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Storno zurücknehmen. Nur Teamleiter."""
    require_team_leader(user)

    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Verkauf nicht gefunden")
    if not sale.cancelled_at:
        raise HTTPException(status_code=409, detail="Dieser Verkauf ist nicht storniert")

    before = serialize(db, sale)
    sale.cancelled_at = None
    sale.cancelled_by_user_id = None
    sale.cancellation_reason = None
    db.flush()

    refresh_weekly_stat(db, sale.employee_id, sale.sold_at.date())
    audit(db, user, "sale.restored", "sale", sale_id, before=before, after=serialize(db, sale))
    db.commit()

    await manager.publish(
        {"type": "data.changed", "entity": "sale", "action": "restored", "id": sale_id},
        employee_id=sale.employee_id,
    )
    return serialize(db, sale)
