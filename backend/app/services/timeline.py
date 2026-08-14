"""Kundenhistorie und Verkaufstrichter.

Die Ereignisse liegen bereits verteilt in appointments, product_presentations,
sales, rentals, customer_notes und follow_ups - jeweils mit customer_id. Dieses
Modul fuehrt sie zu einer Zeitleiste zusammen und leitet daraus die Trichter-
stufe ab.

Die Stufe wird bewusst nicht gespeichert: sonst laufen Stufe und Wirklichkeit
auseinander, sobald jemand einen Termin oder Verkauf nachtraegt oder loescht.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.timeutils import utc_aware
from app.services.stats import not_cancelled
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    CustomerNote,
    Employee,
    FollowUp,
    FollowUpStatus,
    FunnelStage,
    Product,
    ProductPresentation,
    Rental,
    Sale,
    SaleItem,
)


# Die Timeline wird gelesen, nicht ausgewertet - dort gehoeren deutsche
# Bezeichnungen hin, keine Enum-Werte aus der Datenbank.
APPOINTMENT_TYPE_LABELS = {
    "customer": "Kundentermin",
    "promotion": "Promotion",
    "recommendation": "Empfehlung",
    "premium_checkin": "Premium Check-in",
    "team": "Team",
    "telephone": "Telefonie",
    "other": "Sonstiges",
}

APPOINTMENT_STATUS_LABELS = {
    "planned": "geplant",
    "confirmed": "bestätigt",
    "completed": "durchgeführt",
    "cancelled": "abgesagt",
    "rescheduled": "verschoben",
}

OUTCOME_LABELS = {
    "sale": "mit Verkauf",
    "rental": "mit Verleih",
    "none": "ohne Abschluss",
}


@dataclass
class TimelineEvent:
    kind: str
    at: datetime
    title: str
    detail: str | None = None
    entity_id: str | None = None
    meta: dict | None = None

    def as_dict(self) -> dict:
        return {
            "kind": self.kind,
            "at": self.at,
            "title": self.title,
            "detail": self.detail,
            "entity_id": self.entity_id,
            "meta": self.meta or {},
        }


def _money(cents: int) -> str:
    return f"{cents / 100:,.2f} €".replace(",", "X").replace(".", ",").replace("X", ".")


def customer_timeline(db: Session, customer_id: str) -> list[dict]:
    """Alle Ereignisse eines Kunden, neueste zuerst."""
    events: list[TimelineEvent] = []

    appointments = db.scalars(
        select(Appointment).where(Appointment.customer_id == customer_id)
    ).all()
    for a in appointments:
        parts = [
            APPOINTMENT_TYPE_LABELS.get(a.appointment_type.value, a.appointment_type.value),
            APPOINTMENT_STATUS_LABELS.get(a.status.value, a.status.value),
        ]
        outcome_label = OUTCOME_LABELS.get(a.outcome or "")
        if outcome_label:
            parts.append(outcome_label)
        detail = " · ".join(parts)
        events.append(
            TimelineEvent(
                kind="appointment",
                at=utc_aware(a.start_at),
                title="Termin",
                detail=detail,
                entity_id=a.id,
                meta={
                    "status": a.status.value,
                    "appointment_type": a.appointment_type.value,
                    "outcome": a.outcome,
                    "address": a.address_snapshot,
                },
            )
        )

    presentations = db.scalars(
        select(ProductPresentation).where(ProductPresentation.customer_id == customer_id)
    ).all()
    for p in presentations:
        product = db.get(Product, p.product_id)
        events.append(
            TimelineEvent(
                kind="presentation",
                at=utc_aware(p.presented_at),
                title="Vorführung",
                detail=product.name if product else None,
                entity_id=p.id,
                meta={"product_id": p.product_id, "notes": p.notes},
            )
        )

    sales = db.scalars(select(Sale).where(Sale.customer_id == customer_id)).all()
    for s in sales:
        items = db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all()
        total = sum(i.quantity * i.unit_price_cents for i in items)
        names = ", ".join(f"{i.quantity}× {i.product_name_snapshot}" for i in items)
        events.append(
            TimelineEvent(
                kind="sale",
                at=utc_aware(s.sold_at),
                title=f"Verkauf {_money(total)}",
                detail=names or None,
                entity_id=s.id,
                meta={"total_cents": total, "channel": s.channel.value},
            )
        )

    rentals = db.scalars(select(Rental).where(Rental.customer_id == customer_id)).all()
    for r in rentals:
        product = db.get(Product, r.product_id)
        detail = product.name if product else "Gerät"
        if r.serial_number:
            detail += f" · Nr. {r.serial_number}"
        events.append(
            TimelineEvent(
                kind="rental",
                at=utc_aware(r.issued_at),
                title="Verleih ausgegeben",
                detail=detail,
                entity_id=r.id,
                meta={"status": r.status.value, "due_at": r.due_at, "serial_number": r.serial_number},
            )
        )
        if r.returned_at:
            events.append(
                TimelineEvent(
                    kind="rental_return",
                    at=utc_aware(r.returned_at),
                    title="Verleih zurück",
                    detail=detail,
                    entity_id=r.id,
                )
            )

    notes = db.scalars(
        select(CustomerNote).where(CustomerNote.customer_id == customer_id)
    ).all()
    for n in notes:
        author = db.get(Employee, n.employee_id)
        events.append(
            TimelineEvent(
                kind="note",
                at=utc_aware(n.created_at),
                title="Notiz",
                detail=n.body,
                entity_id=n.id,
                meta={"author": author.display_name if author else None},
            )
        )

    follow_ups = db.scalars(
        select(FollowUp).where(FollowUp.customer_id == customer_id)
    ).all()
    for f in follow_ups:
        events.append(
            TimelineEvent(
                kind="follow_up",
                at=utc_aware(f.created_at),
                title="Nachfassen geplant",
                detail=f.note,
                entity_id=f.id,
                meta={
                    "due_on": f.due_on,
                    "status": f.status.value,
                    "reason": f.reason.value,
                },
            )
        )

    events.sort(key=lambda e: e.at, reverse=True)
    return [e.as_dict() for e in events]


def funnel_stage(db: Session, customer_id: str) -> FunnelStage:
    """Weiteste erreichte Stufe eines Kunden.

    Wird aus den Ereignissen abgeleitet, nicht gespeichert.
    """
    # Ein stornierter Verkauf darf den Kunden nicht auf der Stufe "Verkauf"
    # halten - sonst bliebe der Trichter nach einem Storno falsch.
    has_sale = db.scalar(
        select(Sale.id).where(Sale.customer_id == customer_id, not_cancelled())
    ) is not None

    if has_sale:
        # Nachbetreuung zaehlt erst, wenn nach dem Verkauf etwas passiert ist.
        aftercare = db.scalar(
            select(FollowUp.id).where(
                FollowUp.customer_id == customer_id,
                FollowUp.sale_id.isnot(None),
            )
        )
        return FunnelStage.AFTERCARE if aftercare else FunnelStage.SALE

    has_presentation = (
        db.scalar(
            select(ProductPresentation.id).where(
                ProductPresentation.customer_id == customer_id
            )
        )
        is not None
    )
    if has_presentation:
        return FunnelStage.PRESENTATION

    has_done_appointment = (
        db.scalar(
            select(Appointment.id).where(
                Appointment.customer_id == customer_id,
                Appointment.status == AppointmentStatus.COMPLETED,
            )
        )
        is not None
    )
    if has_done_appointment:
        return FunnelStage.APPOINTMENT_DONE

    has_appointment = (
        db.scalar(select(Appointment.id).where(Appointment.customer_id == customer_id))
        is not None
    )
    if has_appointment:
        return FunnelStage.APPOINTMENT_SET

    return FunnelStage.CONTACT


# Reihenfolge der Stufen, damit die Oberflaeche sie sortiert darstellen kann.
FUNNEL_ORDER = [
    FunnelStage.CONTACT,
    FunnelStage.APPOINTMENT_SET,
    FunnelStage.APPOINTMENT_DONE,
    FunnelStage.PRESENTATION,
    FunnelStage.OFFER,
    FunnelStage.SALE,
    FunnelStage.AFTERCARE,
]

FUNNEL_LABELS = {
    FunnelStage.CONTACT: "Kontakt",
    FunnelStage.APPOINTMENT_SET: "Termin vereinbart",
    FunnelStage.APPOINTMENT_DONE: "Termin durchgeführt",
    FunnelStage.PRESENTATION: "Vorführung",
    FunnelStage.OFFER: "Angebot",
    FunnelStage.SALE: "Verkauf",
    FunnelStage.AFTERCARE: "Nachbetreuung",
}


def funnel_overview(db: Session, employee_id: str | None = None) -> dict:
    """Trichter mit Stufenbesetzung und Umwandlungsquoten."""
    stmt = select(Customer).where(Customer.deleted_at.is_(None))
    if employee_id:
        stmt = stmt.where(Customer.employee_id == employee_id)
    customers = db.scalars(stmt).all()

    counts = {stage: 0 for stage in FUNNEL_ORDER}
    for c in customers:
        counts[funnel_stage(db, c.id)] += 1

    # Kumuliert: wer verkauft hat, hat auch einen Termin gehabt. Fuer Quoten
    # zaehlt "mindestens diese Stufe erreicht", nicht "steht genau hier".
    reached = {}
    running = 0
    for stage in reversed(FUNNEL_ORDER):
        running += counts[stage]
        reached[stage] = running

    total = len(customers) or 0

    def quote(a: FunnelStage, b: FunnelStage) -> float:
        base = reached.get(a, 0)
        return round(reached.get(b, 0) / base * 100, 1) if base else 0.0

    return {
        "total_customers": total,
        "stages": [
            {
                "stage": stage.value,
                "label": FUNNEL_LABELS[stage],
                "current": counts[stage],
                "reached": reached[stage],
            }
            for stage in FUNNEL_ORDER
        ],
        "contact_to_appointment_percent": quote(
            FunnelStage.CONTACT, FunnelStage.APPOINTMENT_SET
        ),
        "appointment_to_sale_percent": quote(
            FunnelStage.APPOINTMENT_DONE, FunnelStage.SALE
        ),
        "close_rate_percent": round(reached[FunnelStage.SALE] / total * 100, 1) if total else 0.0,
    }


def appointment_kpis(db: Session, start: datetime, end: datetime, employee_id: str | None = None) -> dict:
    """Kennzahlen rund um Termine im Zeitraum."""
    stmt = select(Appointment).where(
        Appointment.start_at >= start, Appointment.start_at < end
    )
    if employee_id:
        stmt = stmt.where(Appointment.employee_id == employee_id)
    appointments = db.scalars(stmt).all()

    done = [a for a in appointments if a.status == AppointmentStatus.COMPLETED]
    with_sale = [a for a in done if a.outcome == "sale"]

    sale_stmt = select(Sale).where(Sale.sold_at >= start, Sale.sold_at < end, not_cancelled())
    if employee_id:
        sale_stmt = sale_stmt.where(Sale.employee_id == employee_id)
    sales = db.scalars(sale_stmt).all()

    revenue = 0
    for s in sales:
        items = db.scalars(select(SaleItem).where(SaleItem.sale_id == s.id)).all()
        revenue += sum(i.quantity * i.unit_price_cents for i in items)

    pres_stmt = select(ProductPresentation).where(
        ProductPresentation.presented_at >= start,
        ProductPresentation.presented_at < end,
    )
    if employee_id:
        pres_stmt = pres_stmt.where(ProductPresentation.employee_id == employee_id)
    presentations = len(db.scalars(pres_stmt).all())

    return {
        "appointments_total": len(appointments),
        "appointments_done": len(done),
        "appointments_with_sale": len(with_sale),
        "presentations": presentations,
        "close_rate_percent": round(len(with_sale) / len(done) * 100, 1) if done else 0.0,
        "revenue_per_appointment_cents": round(revenue / len(done)) if done else 0,
    }


def open_follow_ups(db: Session, employee_id: str | None, until: object | None = None):
    """Offene Wiedervorlagen, faelligste zuerst."""
    stmt = select(FollowUp).where(FollowUp.status == FollowUpStatus.OPEN)
    if employee_id:
        stmt = stmt.where(FollowUp.employee_id == employee_id)
    if until is not None:
        stmt = stmt.where(FollowUp.due_on <= until)
    return db.scalars(stmt.order_by(FollowUp.due_on)).all()
