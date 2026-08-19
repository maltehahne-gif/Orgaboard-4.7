"""Rechnungen ansehen, ergänzen und als PDF herunterladen.

Der Ausschnitt läuft über dieselbe Regel wie bei den Verkäufen: ein
Mitarbeiter sieht ausschließlich seine eigenen Rechnungen, eine
Führungsrolle die des gewählten Mitarbeiters oder alle. Die Prüfung steht
in scoped_employee_id() und wird hier nicht nachgebaut - zwei Auslegungen
derselben Regel laufen früher oder später auseinander.
"""
from __future__ import annotations

import unicodedata
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.permissions import sieht_fremde_daten
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Invoice, PaymentMethod, Sale, User
from app.services.rechnung import build_pdf, rechnung_zu_verkauf, serialize

router = APIRouter(prefix="/invoices", tags=["invoices"])


class InvoiceUpdate(BaseModel):
    payment_method: PaymentMethod | None = None
    notes: str | None = Field(default=None, max_length=5_000)
    customer_contact: str | None = Field(default=None, max_length=255)


def _sichtbare_rechnung(db: Session, user: User, invoice_id: str) -> Invoice:
    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    if not sieht_fremde_daten(user):
        eigener = scoped_employee_id(db, user, None)
        if invoice.employee_id != eigener:
            # Bewusst 404 und nicht 403: ein "verboten" verriete, dass es
            # diese Rechnungsnummer gibt.
            raise HTTPException(status_code=404, detail="Rechnung nicht gefunden")
    return invoice


@router.get("")
def list_invoices(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)
    stmt = select(Invoice).order_by(Invoice.issued_on.desc(), Invoice.number.desc())
    if scope:
        stmt = stmt.where(Invoice.employee_id == scope)
    return [serialize(db, invoice) for invoice in db.scalars(stmt).all()]


@router.get("/{invoice_id}")
def get_invoice(invoice_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return serialize(db, _sichtbare_rechnung(db, user, invoice_id))


@router.patch("/{invoice_id}", dependencies=[Depends(require_csrf)])
def update_invoice(
    invoice_id: str,
    data: InvoiceUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zahlungsart, Ansprechpartner und Bemerkungen nachtragen.

    Beträge und Positionen bleiben unangetastet: sie gehören zum Verkauf.
    Wäre die Rechnung dort änderbar, stünden auf Beleg und Auswertung zwei
    verschiedene Summen.
    """
    invoice = _sichtbare_rechnung(db, user, invoice_id)
    vorher = serialize(db, invoice)
    if data.payment_method is not None:
        invoice.payment_method = data.payment_method
    if data.notes is not None:
        invoice.notes = data.notes.strip() or None
    if data.customer_contact is not None:
        invoice.customer_contact = data.customer_contact.strip() or None
    db.flush()
    audit(db, user, "invoice.updated", "invoice", invoice.id, before=vorher, after=serialize(db, invoice))
    db.commit()
    return serialize(db, invoice)


@router.post("/aus-verkauf/{sale_id}", dependencies=[Depends(require_csrf)])
def create_from_sale(sale_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Rechnung zu einem Verkauf, der noch keine hat.

    Neue Verkäufe bekommen ihre Rechnung beim Speichern. Diesen Weg
    braucht es für Verkäufe aus der Zeit davor - und er ist harmlos, weil
    rechnung_zu_verkauf() eine vorhandene Rechnung zurückgibt, statt eine
    zweite mit neuer Nummer anzulegen.
    """
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Verkauf nicht gefunden")
    if not sieht_fremde_daten(user) and sale.employee_id != scoped_employee_id(db, user, None):
        raise HTTPException(status_code=403, detail="Du darfst nur zu eigenen Verkäufen Rechnungen erstellen")

    vorhanden = db.scalar(select(Invoice).where(Invoice.sale_id == sale.id))
    invoice = rechnung_zu_verkauf(db, sale, user)
    if not vorhanden:
        audit(db, user, "invoice.created", "invoice", invoice.id, after=serialize(db, invoice))
    db.commit()
    return serialize(db, invoice)


@router.get("/{invoice_id}/pdf")
def invoice_pdf(invoice_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    invoice = _sichtbare_rechnung(db, user, invoice_id)
    pdf = build_pdf(db, invoice)
    sicher = unicodedata.normalize("NFKD", invoice.number).encode("ascii", "ignore").decode("ascii")
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{sicher or "Rechnung"}.pdf"'},
    )
