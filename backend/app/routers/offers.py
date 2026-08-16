"""Angebote: Erstellung, Versand, Statuswechsel, Umwandlung in einen Verkauf.

Ein Angebot ist die Vorstufe eines Verkaufs. Positionen tragen wie beim
Verkauf einen Namens- und Preis-Schnappschuss, damit ein spaeter geaenderter
Katalogpreis ein bereits verschicktes Angebot nicht rueckwirkend veraendert.

Der Status "Abgelaufen" wird nicht geschrieben, sondern beim Lesen aus
gueltig_bis abgeleitet - aus demselben Grund, aus dem der Verkaufstrichter
seine Stufe nicht speichert (siehe services/timeline.py): ein gespeichertes
Ablaufdatum liefe sonst irgendwann am tatsaechlichen Datum vorbei.
"""
from __future__ import annotations

import smtplib
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.config import get_settings
from app.core.database import get_db
from app.core.permissions import sieht_fremde_daten
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.core.timeutils import datum_plausibel, fruehestes_datum, local_today, spaetestes_datum
from app.models import (
    Appointment,
    Customer,
    Offer,
    OfferItem,
    OfferStatus,
    Product,
    Sale,
    SaleChannel,
    SaleItem,
    SystemSetting,
    User,
)
from app.routers.sales import MAX_STUECKPREIS_CENT
from app.routers.sales import serialize as serialize_sale
from app.services.realtime import manager
from app.services.serializers import employee_name
from app.services.stats import refresh_weekly_stat

router = APIRouter(prefix="/offers", tags=["offers"])

STATUS_LABELS = {
    "draft": "Entwurf",
    "sent": "Versendet",
    "accepted": "Angenommen",
    "rejected": "Abgelehnt",
    "expired": "Abgelaufen",
    "converted": "In Verkauf umgewandelt",
}

# Ab diesem Status hat ein Angebot ein Ergebnis erreicht - weder Bearbeitung
# noch ein weiterer Statuswechsel darf danach noch etwas veraendern.
_TERMINAL = {OfferStatus.REJECTED, OfferStatus.CONVERTED}


class OfferItemIn(BaseModel):
    product_id: str
    quantity: int = Field(ge=1, le=999)
    unit_price_cents: int = Field(ge=0, le=MAX_STUECKPREIS_CENT)


class OfferIn(BaseModel):
    customer_id: str
    employee_id: str | None = None
    appointment_id: str | None = None
    issued_on: date | None = None
    valid_until: date | None = None
    discount_percent: int = Field(default=0, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=10_000)
    items: list[OfferItemIn]

    @field_validator("issued_on", "valid_until")
    @classmethod
    def datum_pruefen(cls, wert: date | None) -> date | None:
        if wert is not None and not datum_plausibel(wert):
            raise ValueError(
                f"Das Datum muss zwischen {fruehestes_datum():%d.%m.%Y} und "
                f"{spaetestes_datum():%d.%m.%Y} liegen"
            )
        return wert


class OfferRejectIn(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class OfferConvertIn(BaseModel):
    sold_at: datetime | None = None
    channel: SaleChannel = SaleChannel.OTHER


class OfferEmailIn(BaseModel):
    to: str | None = Field(default=None, max_length=255)


def _setting(db: Session, key: str) -> str | None:
    row = db.get(SystemSetting, key)
    if not row or not row.value_json:
        return None
    value = row.value_json.get("v")
    return str(value) if value not in (None, "") else None


def _money(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def effective_status(offer: Offer) -> OfferStatus:
    """Der Status, wie er nach aussen gilt - inklusive abgeleitetem Ablauf."""
    if offer.status == OfferStatus.SENT and offer.valid_until and offer.valid_until < local_today():
        return OfferStatus.EXPIRED
    return offer.status


def _next_number(db: Session, issued_on: date) -> str:
    prefix = f"AN-{issued_on.year}-"
    count = db.scalar(
        select(func.count()).select_from(Offer).where(Offer.number.like(f"{prefix}%"))
    ) or 0
    return f"{prefix}{count + 1:04d}"


def serialize(db: Session, offer: Offer) -> dict:
    items = db.scalars(select(OfferItem).where(OfferItem.offer_id == offer.id)).all()
    customer = db.get(Customer, offer.customer_id)
    subtotal = sum(i.quantity * i.unit_price_cents for i in items)
    discount_cents = round(subtotal * offer.discount_percent / 100)
    status = effective_status(offer)
    editable = status in (OfferStatus.DRAFT, OfferStatus.SENT)
    return {
        "id": offer.id,
        "number": offer.number,
        "customer_id": offer.customer_id,
        "customer_name": f"{customer.first_name} {customer.last_name}" if customer else "Unbekannt",
        "customer_address": (
            " ".join(x for x in [customer.street, customer.house_number, customer.postal_code, customer.city] if x)
            if customer else ""
        ),
        "employee_id": offer.employee_id,
        "employee_name": employee_name(db, offer.employee_id),
        "appointment_id": offer.appointment_id,
        "status": status.value,
        "status_label": STATUS_LABELS[status.value],
        "stored_status": offer.status.value,
        "issued_on": offer.issued_on,
        "valid_until": offer.valid_until,
        "discount_percent": offer.discount_percent,
        "notes": offer.notes,
        "created_at": offer.created_at,
        "updated_at": offer.updated_at,
        "sent_at": offer.sent_at,
        "accepted_at": offer.accepted_at,
        "rejected_at": offer.rejected_at,
        "rejection_reason": offer.rejection_reason,
        "converted_sale_id": offer.converted_sale_id,
        "converted_at": offer.converted_at,
        "items": [
            {
                "id": i.id, "product_id": i.product_id, "name": i.product_name_snapshot,
                "quantity": i.quantity, "unit_price_cents": i.unit_price_cents,
                "total_cents": i.quantity * i.unit_price_cents,
            }
            for i in items
        ],
        "subtotal_cents": subtotal,
        "discount_cents": discount_cents,
        "total_cents": subtotal - discount_cents,
        "can_edit": editable,
        "can_delete": status == OfferStatus.DRAFT,
        "can_send": status == OfferStatus.DRAFT,
        "can_accept": status in (OfferStatus.DRAFT, OfferStatus.SENT),
        "can_reject": status in (OfferStatus.DRAFT, OfferStatus.SENT),
        "can_convert": status in (OfferStatus.DRAFT, OfferStatus.SENT, OfferStatus.ACCEPTED),
    }


def _resolve_items(db: Session, items_in: list[OfferItemIn]) -> list[tuple[Product, OfferItemIn]]:
    if not items_in:
        raise HTTPException(status_code=400, detail="Ein Angebot benötigt mindestens ein Produkt")
    resolved = []
    for item in items_in:
        p = db.get(Product, item.product_id)
        if not p or not p.verified or not p.active:
            raise HTTPException(status_code=400, detail="Nur aktive, verifizierte Produkte dürfen angeboten werden")
        resolved.append((p, item))
    return resolved


@router.get("")
def list_offers(
    employee_id: str | None = None,
    customer_id: str | None = None,
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Offer).order_by(Offer.created_at.desc())
    if scope:
        stmt = stmt.where(Offer.employee_id == scope)
    if customer_id:
        stmt = stmt.where(Offer.customer_id == customer_id)
    offers = db.scalars(stmt).all()
    out = [serialize(db, o) for o in offers]
    if status:
        out = [o for o in out if o["status"] == status]
    return out


@router.get("/{offer_id}")
def get_offer(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")
    if not sieht_fremde_daten(user):
        eigener = scoped_employee_id(db, user, None)
        if offer.employee_id != eigener:
            raise HTTPException(status_code=403, detail="Zugriff auf fremde Angebote ist nicht erlaubt")
    return serialize(db, offer)


@router.post("", dependencies=[Depends(require_csrf)])
async def create_offer(data: OfferIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    employee_id = scoped_employee_id(db, user, data.employee_id)
    if employee_id is None:
        raise HTTPException(status_code=400, detail="Teamleiter muss einen Mitarbeiter auswählen")

    customer = db.get(Customer, data.customer_id)
    if not customer or customer.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if not sieht_fremde_daten(user) and customer.employee_id != employee_id:
        raise HTTPException(status_code=403, detail="Kunde gehört nicht zu diesem Mitarbeiter")

    if data.appointment_id:
        appointment = db.get(Appointment, data.appointment_id)
        if not appointment or appointment.customer_id != data.customer_id:
            raise HTTPException(status_code=400, detail="Termin gehört nicht zu diesem Kunden")

    if data.discount_percent > 0 and not sieht_fremde_daten(user):
        raise HTTPException(status_code=403, detail="Rabatte dürfen nur von Teamleitern oder höher gewährt werden")

    resolved = _resolve_items(db, data.items)

    issued_on = data.issued_on or local_today()
    valid_until = data.valid_until or (issued_on + timedelta(days=14))

    offer = Offer(
        number=_next_number(db, issued_on),
        customer_id=data.customer_id,
        employee_id=employee_id,
        appointment_id=data.appointment_id,
        issued_on=issued_on,
        valid_until=valid_until,
        discount_percent=data.discount_percent,
        notes=data.notes,
    )
    db.add(offer)
    db.flush()
    for p, item in resolved:
        db.add(OfferItem(
            offer_id=offer.id, product_id=p.id, product_name_snapshot=p.name,
            quantity=item.quantity, unit_price_cents=item.unit_price_cents,
        ))
    db.flush()
    audit(db, user, "offer.created", "offer", offer.id, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=employee_id)
    return serialize(db, offer)


def _load_editable_offer(db: Session, user: User, offer_id: str) -> Offer:
    offer = db.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Angebot nicht gefunden")
    if not sieht_fremde_daten(user):
        eigener = scoped_employee_id(db, user, None)
        if offer.employee_id != eigener:
            raise HTTPException(status_code=403, detail="Zugriff auf fremde Angebote ist nicht erlaubt")
    return offer


@router.put("/{offer_id}", dependencies=[Depends(require_csrf)])
async def update_offer(offer_id: str, data: OfferIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) not in (OfferStatus.DRAFT, OfferStatus.SENT):
        raise HTTPException(status_code=409, detail="Dieses Angebot lässt sich nicht mehr bearbeiten")

    customer = db.get(Customer, data.customer_id)
    if not customer or customer.deleted_at:
        raise HTTPException(status_code=404, detail="Kunde nicht gefunden")
    if data.discount_percent > 0 and not sieht_fremde_daten(user):
        raise HTTPException(status_code=403, detail="Rabatte dürfen nur von Teamleitern oder höher gewährt werden")

    resolved = _resolve_items(db, data.items)
    before = serialize(db, offer)

    offer.customer_id = data.customer_id
    offer.appointment_id = data.appointment_id
    if data.valid_until:
        offer.valid_until = data.valid_until
    offer.discount_percent = data.discount_percent
    offer.notes = data.notes

    for existing in db.scalars(select(OfferItem).where(OfferItem.offer_id == offer.id)).all():
        db.delete(existing)
    db.flush()
    for p, item in resolved:
        db.add(OfferItem(
            offer_id=offer.id, product_id=p.id, product_name_snapshot=p.name,
            quantity=item.quantity, unit_price_cents=item.unit_price_cents,
        ))
    db.flush()

    audit(db, user, "offer.updated", "offer", offer.id, before=before, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return serialize(db, offer)


@router.post("/{offer_id}/duplicate", dependencies=[Depends(require_csrf)])
async def duplicate_offer(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    original = _load_editable_offer(db, user, offer_id)
    items = db.scalars(select(OfferItem).where(OfferItem.offer_id == original.id)).all()
    issued_on = local_today()

    copy = Offer(
        number=_next_number(db, issued_on),
        customer_id=original.customer_id,
        employee_id=original.employee_id,
        appointment_id=None,
        issued_on=issued_on,
        valid_until=issued_on + timedelta(days=14),
        discount_percent=original.discount_percent,
        notes=original.notes,
    )
    db.add(copy)
    db.flush()
    for i in items:
        db.add(OfferItem(
            offer_id=copy.id, product_id=i.product_id, product_name_snapshot=i.product_name_snapshot,
            quantity=i.quantity, unit_price_cents=i.unit_price_cents,
        ))
    db.flush()
    audit(db, user, "offer.duplicated", "offer", copy.id, after=serialize(db, copy))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=copy.employee_id)
    return serialize(db, copy)


@router.delete("/{offer_id}", dependencies=[Depends(require_csrf)])
async def delete_offer(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) != OfferStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Nur Angebote im Entwurf lassen sich löschen")

    before = serialize(db, offer)
    # Die Positionen entfernt die Datenbank selbst (ON DELETE CASCADE) -
    # ein zusaetzlicher Objektloesch-Durchlauf hier wuerde nur zu einem
    # bereits erledigten DELETE fuehren.
    db.delete(offer)
    audit(db, user, "offer.deleted", "offer", offer_id, before=before)
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return {"deleted": True}


@router.post("/{offer_id}/send", dependencies=[Depends(require_csrf)])
async def send_offer(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if offer.status != OfferStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Nur Angebote im Entwurf lassen sich versenden")

    before = serialize(db, offer)
    offer.status = OfferStatus.SENT
    offer.sent_at = datetime.now(timezone.utc)
    db.flush()
    audit(db, user, "offer.sent", "offer", offer.id, before=before, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return serialize(db, offer)


@router.post("/{offer_id}/accept", dependencies=[Depends(require_csrf)])
async def accept_offer(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) not in (OfferStatus.DRAFT, OfferStatus.SENT):
        raise HTTPException(status_code=409, detail="Dieses Angebot lässt sich nicht mehr annehmen")

    before = serialize(db, offer)
    offer.status = OfferStatus.ACCEPTED
    offer.accepted_at = datetime.now(timezone.utc)
    db.flush()
    audit(db, user, "offer.accepted", "offer", offer.id, before=before, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return serialize(db, offer)


@router.post("/{offer_id}/reject", dependencies=[Depends(require_csrf)])
async def reject_offer(offer_id: str, data: OfferRejectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) not in (OfferStatus.DRAFT, OfferStatus.SENT):
        raise HTTPException(status_code=409, detail="Dieses Angebot lässt sich nicht mehr ablehnen")

    before = serialize(db, offer)
    offer.status = OfferStatus.REJECTED
    offer.rejected_at = datetime.now(timezone.utc)
    offer.rejection_reason = (data.reason or "").strip() or None
    db.flush()
    audit(db, user, "offer.rejected", "offer", offer.id, before=before, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return serialize(db, offer)


@router.post("/{offer_id}/convert-to-sale", dependencies=[Depends(require_csrf)])
async def convert_offer_to_sale(offer_id: str, data: OfferConvertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Angebot in einen Verkauf umwandeln.

    Produkte, Mengen und Preise werden unveraendert uebernommen - ein
    gewaehrter Rabatt fliesst dabei in den Stueckpreis jeder Position ein,
    damit die Summe des Verkaufs der Angebotssumme entspricht, ohne dass
    jemand die Positionen ein zweites Mal eintippen muss.
    """
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) not in (OfferStatus.DRAFT, OfferStatus.SENT, OfferStatus.ACCEPTED):
        raise HTTPException(status_code=409, detail="Dieses Angebot lässt sich nicht mehr in einen Verkauf umwandeln")

    items = db.scalars(select(OfferItem).where(OfferItem.offer_id == offer.id)).all()
    if not items:
        raise HTTPException(status_code=400, detail="Angebot ohne Positionen lässt sich nicht umwandeln")

    factor = (100 - offer.discount_percent) / 100
    before = serialize(db, offer)

    sale = Sale(
        customer_id=offer.customer_id,
        employee_id=offer.employee_id,
        appointment_id=offer.appointment_id,
        sold_at=data.sold_at or datetime.now(timezone.utc),
        channel=data.channel,
        notes=f"Aus Angebot {offer.number} übernommen" + (f"\n{offer.notes}" if offer.notes else ""),
    )
    db.add(sale)
    db.flush()
    for i in items:
        db.add(SaleItem(
            sale_id=sale.id, product_id=i.product_id, product_name_snapshot=i.product_name_snapshot,
            quantity=i.quantity, unit_price_cents=round(i.unit_price_cents * factor),
        ))
    db.flush()

    offer.status = OfferStatus.CONVERTED
    offer.converted_sale_id = sale.id
    offer.converted_at = datetime.now(timezone.utc)
    db.flush()

    refresh_weekly_stat(db, offer.employee_id, sale.sold_at.date())
    audit(db, user, "offer.converted", "offer", offer.id, before=before, after=serialize(db, offer))
    audit(db, user, "sale.created", "sale", sale.id, after=serialize_sale(db, sale))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    await manager.publish({"type": "data.changed", "entity": "sale"}, employee_id=offer.employee_id)
    return {"offer": serialize(db, offer), "sale": serialize_sale(db, sale)}


def build_pdf(db: Session, offer: Offer) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    payload = serialize(db, offer)
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []

    company_name = _setting(db, "company.name") or "OrgaBoard"
    company_address = _setting(db, "company.address") or ""

    story.append(Paragraph(company_name, styles["Heading2"]))
    if company_address:
        story.append(Paragraph(company_address.replace("\n", "<br/>"), styles["Normal"]))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Angebot {payload['number']}", styles["Heading1"]))
    story.append(Spacer(1, 6))
    story.append(Paragraph(payload["customer_name"], styles["Normal"]))
    if payload["customer_address"]:
        story.append(Paragraph(payload["customer_address"], styles["Normal"]))
    story.append(Spacer(1, 10))

    meta = [
        ["Angebotsnummer", payload["number"]],
        ["Datum", f"{offer.issued_on:%d.%m.%Y}"],
        ["Gültig bis", f"{offer.valid_until:%d.%m.%Y}" if offer.valid_until else "—"],
        ["Berater", payload["employee_name"]],
    ]
    mt = Table(meta, colWidths=[130, 300])
    mt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(mt)
    story.append(Spacer(1, 14))

    rows = [["Produkt", "Menge", "Einzelpreis", "Gesamt"]]
    for item in payload["items"]:
        rows.append([item["name"], str(item["quantity"]), _money(item["unit_price_cents"]), _money(item["total_cents"])])
    table = Table(rows, colWidths=[240, 60, 90, 90])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#8a8a8a")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d8ddc4")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
    ]))
    story.append(table)
    story.append(Spacer(1, 10))

    totals = [["Zwischensumme", _money(payload["subtotal_cents"])]]
    if offer.discount_percent:
        totals.append([f"Rabatt ({offer.discount_percent}%)", f"−{_money(payload['discount_cents'])}"])
    totals.append(["Gesamtbetrag", _money(payload["total_cents"])])
    tt = Table(totals, colWidths=[240, 90])
    tt.setStyle(TableStyle([
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, colors.HexColor("#333333")),
    ]))
    story.append(tt)

    if offer.notes:
        story.append(Spacer(1, 14))
        story.append(Paragraph("Notizen", styles["Heading3"]))
        story.append(Paragraph(offer.notes.replace("\n", "<br/>"), styles["Normal"]))

    doc.build(story)
    return buffer.getvalue()


@router.get("/{offer_id}/pdf")
def export_offer_pdf(offer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    pdf = build_pdf(db, offer)
    filename = f"{offer.number}.pdf"
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/{offer_id}/email", dependencies=[Depends(require_csrf)])
async def email_offer(offer_id: str, data: OfferEmailIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    offer = _load_editable_offer(db, user, offer_id)
    if effective_status(offer) not in (OfferStatus.DRAFT, OfferStatus.SENT):
        raise HTTPException(status_code=409, detail="Dieses Angebot lässt sich nicht mehr versenden")

    customer = db.get(Customer, offer.customer_id)
    recipient = (data.to or (customer.email if customer else None) or "").strip()
    if not recipient:
        raise HTTPException(status_code=400, detail="Für diesen Kunden ist keine E-Mail-Adresse hinterlegt")

    settings = get_settings()
    if not settings.smtp_host or not settings.smtp_from_email:
        raise HTTPException(status_code=503, detail="Für dieses System ist kein E-Mail-Versand eingerichtet")

    pdf = build_pdf(db, offer)
    message = EmailMessage()
    message["Subject"] = f"Ihr Angebot {offer.number}"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    signature = _setting(db, "mail.signature") or "OrgaBoard"
    body = f"Guten Tag,\n\nanbei erhalten Sie unser Angebot {offer.number}."
    if offer.valid_until:
        body += f"\n\nEs ist gültig bis {offer.valid_until:%d.%m.%Y}."
    body += f"\n\n{signature}"
    message.set_content(body)
    message.add_attachment(pdf, maintype="application", subtype="pdf", filename=f"{offer.number}.pdf")

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            smtp.ehlo()
            if settings.smtp_use_tls:
                smtp.starttls()
                smtp.ehlo()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        raise HTTPException(status_code=502, detail="Der Versand ist fehlgeschlagen") from exc

    before = serialize(db, offer)
    if offer.status == OfferStatus.DRAFT:
        offer.status = OfferStatus.SENT
        offer.sent_at = datetime.now(timezone.utc)
        db.flush()
    audit(db, user, "offer.emailed", "offer", offer.id, before=before, after=serialize(db, offer))
    db.commit()
    await manager.publish({"type": "data.changed", "entity": "offer"}, employee_id=offer.employee_id)
    return {"sent": True, "to": recipient}
