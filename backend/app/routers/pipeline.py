"""Operative CRM-Pipeline: derselbe Kunde, derselbe Trichter, eine Ansicht.

Baut bewusst auf vorhandenen Bausteinen auf statt eine zweite Datenwelt zu
eroeffnen: die Stufe kommt aus services/timeline.funnel_stage(), die naechste
Wiedervorlage aus next_open_follow_up(), offene Angebote und ihr Betrag aus
routers/offers.serialize(). Neu ist nur die Zusammenfuehrung zu einer Zeile
pro Kunde samt Filterung nach Mitarbeiter, Team, Bezirk, Region und Zeitraum.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.core.timeutils import day_bounds, utc_aware
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    CustomerNote,
    Employee,
    Offer,
    OfferStatus,
    ProductPresentation,
    Sale,
    User,
)
from app.routers.offers import effective_status, serialize as offer_serialize
from app.services.orgscope import resolve_scope_employee_ids, team_chain
from app.services.serializers import sale_total
from app.services.stats import not_cancelled
from app.services.timeline import (
    FUNNEL_LABELS,
    FUNNEL_ORDER,
    FunnelStage,
    funnel_stage,
    next_open_follow_up,
)

router = APIRouter(prefix="/pipeline", tags=["pipeline"])

_OPEN_OFFER_STATUSES = (OfferStatus.DRAFT, OfferStatus.SENT, OfferStatus.ACCEPTED)


def _last_contact_at(db: Session, customer_id: str, created_at: datetime) -> datetime:
    """Juengstes Ereignis eines Kunden, ohne die volle Zeitleiste zu bauen.

    customer_timeline() liefert dieselbe Information, staffiert dafuer aber
    Verkaufspositionen, Vorfuehrungsnamen und Notiztexte mit ein - fuer eine
    Pipeline mit potenziell hunderten Karten reicht das reine Datum aus fuenf
    schmalen MAX-Abfragen.
    """
    kandidaten = [
        db.scalar(select(Appointment.start_at).where(Appointment.customer_id == customer_id).order_by(Appointment.start_at.desc())),
        db.scalar(select(ProductPresentation.presented_at).where(ProductPresentation.customer_id == customer_id).order_by(ProductPresentation.presented_at.desc())),
        db.scalar(select(Offer.created_at).where(Offer.customer_id == customer_id).order_by(Offer.created_at.desc())),
        db.scalar(select(Sale.sold_at).where(Sale.customer_id == customer_id).order_by(Sale.sold_at.desc())),
        db.scalar(select(CustomerNote.created_at).where(CustomerNote.customer_id == customer_id).order_by(CustomerNote.created_at.desc())),
    ]
    zeiten = [utc_aware(t) for t in kandidaten if t is not None]
    zeiten.append(utc_aware(created_at))
    return max(zeiten)


def _card(db: Session, customer: Customer) -> dict:
    stage = funnel_stage(db, customer.id)
    employee = db.get(Employee, customer.employee_id)
    chain = team_chain(db, employee.team_id if employee else None)

    next_appointment = db.scalar(
        select(Appointment)
        .where(
            Appointment.customer_id == customer.id,
            Appointment.start_at >= datetime.now(timezone.utc),
            Appointment.status.in_([AppointmentStatus.PLANNED, AppointmentStatus.CONFIRMED]),
        )
        .order_by(Appointment.start_at.asc())
    )

    open_offer = db.scalar(
        select(Offer)
        .where(Offer.customer_id == customer.id, Offer.status.in_(_OPEN_OFFER_STATUSES))
        .order_by(Offer.created_at.desc())
    )
    open_offer_out = None
    if open_offer is not None and effective_status(open_offer) in _OPEN_OFFER_STATUSES:
        payload = offer_serialize(db, open_offer)
        open_offer_out = {
            "id": payload["id"], "number": payload["number"],
            "status": payload["status"], "status_label": payload["status_label"],
            "total_cents": payload["total_cents"],
        }

    last_sale = None
    if stage in (FunnelStage.SALE, FunnelStage.AFTERCARE):
        sale = db.scalar(
            select(Sale)
            .where(Sale.customer_id == customer.id, not_cancelled())
            .order_by(Sale.sold_at.desc())
        )
        if sale is not None:
            last_sale = {"id": sale.id, "sold_at": sale.sold_at, "total_cents": sale_total(db, sale.id)}

    potential_revenue_cents = None
    if open_offer_out is not None:
        potential_revenue_cents = open_offer_out["total_cents"]
    elif last_sale is not None:
        potential_revenue_cents = last_sale["total_cents"]

    follow_up = next_open_follow_up(db, customer.id)
    if follow_up:
        next_action = "Nachfassen: " + (follow_up["note"] or "Kontakt aufnehmen")
    elif next_appointment:
        next_action = "Termin wahrnehmen"
    elif stage == FunnelStage.CONTACT:
        next_action = "Termin vereinbaren"
    elif stage == FunnelStage.APPOINTMENT_SET:
        next_action = "Termin durchführen"
    elif stage == FunnelStage.APPOINTMENT_DONE:
        next_action = "Vorführung anbieten"
    elif stage == FunnelStage.PRESENTATION:
        next_action = "Angebot erstellen"
    elif stage == FunnelStage.OFFER:
        next_action = "Angebot nachfassen"
    elif stage == FunnelStage.SALE:
        next_action = "Nachbetreuung planen"
    else:
        next_action = "Kontakt halten"

    return {
        "customer_id": customer.id,
        "customer_name": f"{customer.first_name} {customer.last_name}",
        "customer_phone": customer.phone,
        "customer_email": customer.email,
        "customer_city": customer.city,
        "employee_id": customer.employee_id,
        "employee_name": employee.display_name if employee else "Unbekannt",
        "team_id": chain.team_id, "team_name": chain.team_name,
        "district_id": chain.district_id, "district_name": chain.district_name,
        "region_id": chain.region_id, "region_name": chain.region_name,
        "stage": stage.value,
        "stage_label": FUNNEL_LABELS[stage],
        "last_contact_at": _last_contact_at(db, customer.id, customer.created_at),
        "next_action": next_action,
        "next_appointment": None if not next_appointment else {
            "id": next_appointment.id, "start_at": next_appointment.start_at,
            "appointment_type": next_appointment.appointment_type.value,
        },
        "next_follow_up": follow_up,
        "open_offer": open_offer_out,
        "last_sale": last_sale,
        "potential_revenue_cents": potential_revenue_cents,
    }


@router.get("")
def pipeline(
    employee_id: str | None = None,
    team_id: str | None = None,
    district_id: str | None = None,
    region_id: str | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    scope = scoped_employee_id(db, user, employee_id)

    stmt = select(Customer).where(Customer.deleted_at.is_(None))
    if scope:
        stmt = stmt.where(Customer.employee_id == scope)
    else:
        hierarchy_scope = resolve_scope_employee_ids(db, team_id, district_id, region_id)
        if hierarchy_scope is not None:
            if not hierarchy_scope:
                return {"customers": [], "counts": {stage.value: 0 for stage in FUNNEL_ORDER}}
            stmt = stmt.where(Customer.employee_id.in_(hierarchy_scope))

    customers = db.scalars(stmt.order_by(Customer.last_name, Customer.first_name)).all()
    cards = [_card(db, c) for c in customers]

    if q:
        needle = q.strip().casefold()
        cards = [
            card for card in cards
            if needle in " ".join(
                str(x) for x in [card["customer_name"], card["customer_phone"], card["customer_email"], card["customer_city"]] if x
            ).casefold()
        ]

    if date_from:
        start, _ = day_bounds(date_from)
        cards = [card for card in cards if card["last_contact_at"] >= start]
    if date_to:
        _, end = day_bounds(date_to)
        cards = [card for card in cards if card["last_contact_at"] < end]

    counts = {stage.value: 0 for stage in FUNNEL_ORDER}
    for card in cards:
        counts[card["stage"]] += 1

    return {"customers": cards, "counts": counts}
