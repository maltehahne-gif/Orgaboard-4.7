"""Benachrichtigungen: erzeugen, einstellen, zustellen.

Die Anlaesse werden aus dem vorhandenen Datenbestand abgeleitet - Termine,
Wiedervorlagen, Verleihgeraete und ungelesene Nachrichten. Es gibt bewusst
keine zweite Datenhaltung: was faellig ist, steht bereits in den Tabellen,
und ein zusaetzlich gepflegter Merker liefe frueher oder spaeter daneben.

Dieses System hat keinen Hintergrunddienst (siehe services/report.py). Die
Ableitung laeuft deshalb beim Abruf des Postfachs. Damit derselbe Anlass
nicht bei jedem Abruf erneut erscheint, traegt jede Benachrichtigung einen
dedupe_key; die Datenbank laesst ihn je Benutzer nur einmal zu.

Grundsatz aus dem Auftrag: keine unnoetigen Benachrichtigungen. Deshalb
- wird je Anlass genau eine Meldung erzeugt, nicht eine je Abruf,
- fasst der Tagesueberblick alle Termine des Tages zu einer Meldung zusammen,
- entscheidet der Benutzer je Anlass, ob er ihn ueberhaupt bekommt.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.timeutils import day_bounds, local_today, to_business_tz, utc_aware
from app.models import (
    Appointment,
    AppointmentStatus,
    Customer,
    Employee,
    FollowUp,
    FollowUpStatus,
    Message,
    MessageHidden,
    MessageRead,
    Notification,
    NotificationCategory,
    NotificationSetting,
    Product,
    Rental,
    RentalStatus,
    User,
)

log = logging.getLogger("orgaboard.notify")

# Wie weit im Voraus ein Termin als "bald" gilt.
TERMIN_BALD_MINUTEN = 90

# Wie viele Tage vor Rueckgabe an ein Verleihgeraet erinnert wird. Entspricht
# ERINNERUNG_TAGE in routers/rentals.py - dort ist es die Anzeige, hier die
# Benachrichtigung; beide meinen denselben Zeitpunkt.
VERLEIH_ERINNERUNG_TAGE = 3

KATEGORIE_BEZEICHNUNG: dict[NotificationCategory, str] = {
    NotificationCategory.APPOINTMENT_SOON: "Termin beginnt bald",
    NotificationCategory.APPOINTMENT_TODAY: "Termine des Tages",
    NotificationCategory.FOLLOWUP_TODAY: "Nachfassen heute fällig",
    NotificationCategory.FOLLOWUP_OVERDUE: "Nachfassen überfällig",
    NotificationCategory.MESSAGE_NEW: "Neue private Nachricht",
    NotificationCategory.RENTAL_DUE: "Verleihgerät bald fällig",
    NotificationCategory.RENTAL_OVERDUE: "Verleihgerät überfällig",
}

# Was gilt, solange der Benutzer nichts anderes eingestellt hat. Der
# Tagesueberblick ist per Voreinstellung nicht als Push aktiv: er ist
# nuetzlich im Postfach, aber als Ton am Morgen schnell laestig.
STANDARD_PUSH_AUS = {NotificationCategory.APPOINTMENT_TODAY}


@dataclass(frozen=True)
class Anlass:
    """Ein erkannter Benachrichtigungsanlass, noch nicht gespeichert."""

    category: NotificationCategory
    dedupe_key: str
    title: str
    body: str | None = None
    link: str | None = None


# ------------------------------------------------------------ Einstellungen

def einstellungen(db: Session, user_id: str) -> dict[NotificationCategory, NotificationSetting]:
    rows = db.scalars(
        select(NotificationSetting).where(NotificationSetting.user_id == user_id)
    ).all()
    return {r.category: r for r in rows}


def moechte(
    gesetzt: dict[NotificationCategory, NotificationSetting],
    category: NotificationCategory,
    kanal: str,
) -> bool:
    """Ob dieser Anlass ueber diesen Kanal erwuenscht ist."""
    eintrag = gesetzt.get(category)
    if eintrag is not None:
        return eintrag.in_app if kanal == "in_app" else eintrag.push
    if kanal == "push":
        return category not in STANDARD_PUSH_AUS
    return True


def einstellungen_uebersicht(db: Session, user_id: str) -> list[dict]:
    """Alle Anlaesse mit ihrem Zustand - fuer die Einstellungsmaske."""
    gesetzt = einstellungen(db, user_id)
    return [
        {
            "category": kategorie.value,
            "label": KATEGORIE_BEZEICHNUNG[kategorie],
            "in_app": moechte(gesetzt, kategorie, "in_app"),
            "push": moechte(gesetzt, kategorie, "push"),
        }
        for kategorie in NotificationCategory
    ]


# --------------------------------------------------------------- Ableitung

def _termin_anlaesse(db: Session, employee_id: str, jetzt: datetime) -> list[Anlass]:
    anlaesse: list[Anlass] = []
    heute = local_today()
    tag_start, tag_ende = day_bounds(heute)

    offen = (
        Appointment.status.notin_([AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED])
    )

    # 1. Termine, die in Kuerze beginnen - je Termin eine Meldung.
    bald = db.scalars(
        select(Appointment).where(
            Appointment.employee_id == employee_id,
            Appointment.start_at >= jetzt,
            Appointment.start_at <= jetzt + timedelta(minutes=TERMIN_BALD_MINUTEN),
            offen,
        ).order_by(Appointment.start_at)
    ).all()
    for a in bald:
        kunde = db.get(Customer, a.customer_id) if a.customer_id else None
        name = f"{kunde.first_name} {kunde.last_name}" if kunde else "Termin"
        uhrzeit = to_business_tz(utc_aware(a.start_at)).strftime("%H:%M")
        anlaesse.append(Anlass(
            category=NotificationCategory.APPOINTMENT_SOON,
            dedupe_key=f"appointment_soon:{a.id}",
            title=f"Termin um {uhrzeit}",
            body=f"{name}" + (f" · {a.address_snapshot}" if a.address_snapshot else ""),
            link="/termine",
        ))

    # 2. Tagesueberblick - eine Meldung fuer alle Termine des Tages, nicht
    #    eine je Termin. Der Schluessel enthaelt das Datum, damit sie morgen
    #    erneut erscheinen darf.
    heutige = db.scalars(
        select(Appointment).where(
            Appointment.employee_id == employee_id,
            Appointment.start_at >= tag_start,
            Appointment.start_at < tag_ende,
            offen,
        ).order_by(Appointment.start_at)
    ).all()
    if heutige:
        erste = to_business_tz(utc_aware(heutige[0].start_at)).strftime("%H:%M")
        anzahl = len(heutige)
        anlaesse.append(Anlass(
            category=NotificationCategory.APPOINTMENT_TODAY,
            dedupe_key=f"appointment_today:{heute.isoformat()}",
            title=f"{anzahl} Termin{'e' if anzahl != 1 else ''} heute",
            body=f"Der erste beginnt um {erste} Uhr.",
            link="/termine",
        ))

    return anlaesse


def _wiedervorlage_anlaesse(db: Session, employee_id: str) -> list[Anlass]:
    heute = local_today()
    anlaesse: list[Anlass] = []

    offen = db.scalars(
        select(FollowUp).where(
            FollowUp.employee_id == employee_id,
            FollowUp.status == FollowUpStatus.OPEN,
            FollowUp.due_on <= heute,
        ).order_by(FollowUp.due_on)
    ).all()

    heute_faellig = [f for f in offen if f.due_on == heute]
    ueberfaellig = [f for f in offen if f.due_on < heute]

    # Zusammengefasst, mit Datum im Schluessel: einmal je Tag, nicht je Abruf.
    if heute_faellig:
        anzahl = len(heute_faellig)
        anlaesse.append(Anlass(
            category=NotificationCategory.FOLLOWUP_TODAY,
            dedupe_key=f"followup_today:{heute.isoformat()}",
            title=f"{anzahl} Nachfassaktion{'en' if anzahl != 1 else ''} heute",
            body="Heute steht der nächste Kontakt an.",
            link="/nachfassen",
        ))

    if ueberfaellig:
        anzahl = len(ueberfaellig)
        aeltestes = min(f.due_on for f in ueberfaellig)
        tage = (heute - aeltestes).days
        anlaesse.append(Anlass(
            category=NotificationCategory.FOLLOWUP_OVERDUE,
            dedupe_key=f"followup_overdue:{heute.isoformat()}",
            title=f"{anzahl} Nachfassaktion{'en' if anzahl != 1 else ''} überfällig",
            body=f"Die älteste liegt seit {tage} Tag{'en' if tage != 1 else ''} an.",
            link="/nachfassen",
        ))

    return anlaesse


def _verleih_anlaesse(db: Session, employee_id: str) -> list[Anlass]:
    heute = local_today()
    grenze = datetime.combine(heute + timedelta(days=VERLEIH_ERINNERUNG_TAGE), datetime.min.time(), tzinfo=timezone.utc)
    jetzt_tag = datetime.combine(heute, datetime.min.time(), tzinfo=timezone.utc)
    anlaesse: list[Anlass] = []

    laufend = db.scalars(
        select(Rental).where(
            Rental.employee_id == employee_id,
            Rental.status.in_([RentalStatus.RENTED, RentalStatus.DUE]),
            Rental.due_at.isnot(None),
            Rental.due_at < grenze,
        ).order_by(Rental.due_at)
    ).all()

    for r in laufend:
        faellig = utc_aware(r.due_at)
        produkt = db.get(Product, r.product_id)
        kunde = db.get(Customer, r.customer_id)
        bezeichnung = produkt.name if produkt else "Gerät"
        bei_wem = f"{kunde.first_name} {kunde.last_name}" if kunde else "Kunde"
        if faellig < jetzt_tag:
            tage = (heute - faellig.date()).days
            anlaesse.append(Anlass(
                category=NotificationCategory.RENTAL_OVERDUE,
                dedupe_key=f"rental_overdue:{r.id}:{heute.isoformat()}",
                title=f"{bezeichnung} überfällig",
                body=f"Seit {tage} Tag{'en' if tage != 1 else ''} bei {bei_wem}.",
                link="/verleih",
            ))
        else:
            anlaesse.append(Anlass(
                category=NotificationCategory.RENTAL_DUE,
                dedupe_key=f"rental_due:{r.id}",
                title=f"{bezeichnung} bald fällig",
                body=f"Rückgabe am {faellig.date():%d.%m.%Y} · {bei_wem}.",
                link="/verleih",
            ))

    return anlaesse


def _nachricht_anlaesse(db: Session, user_id: str) -> list[Anlass]:
    """Ungelesene private Nachrichten - je Nachricht eine Meldung.

    Nur Einzelnachrichten: eine Teamnachricht erreicht alle und wuerde sonst
    bei jedem Empfaenger eine Meldung ausloesen, ohne dass jemand persoenlich
    gemeint war.
    """
    ungelesen = db.scalars(
        select(Message).where(
            Message.recipient_user_id == user_id,
            Message.sender_user_id != user_id,
            Message.read_at.is_(None),
            Message.deleted_at.is_(None),
            ~Message.id.in_(select(MessageHidden.message_id).where(MessageHidden.user_id == user_id)),
            ~Message.id.in_(select(MessageRead.message_id).where(MessageRead.user_id == user_id)),
        ).order_by(Message.created_at.desc()).limit(20)
    ).all()

    anlaesse: list[Anlass] = []
    for m in ungelesen:
        absender = db.get(User, m.sender_user_id)
        name = absender.full_name if absender else "Unbekannt"
        text = (m.body or "").strip()
        anlaesse.append(Anlass(
            category=NotificationCategory.MESSAGE_NEW,
            dedupe_key=f"message_new:{m.id}",
            title=f"Nachricht von {name}",
            body=text[:140] + ("…" if len(text) > 140 else ""),
            link="/nachrichten",
        ))
    return anlaesse


def anlaesse_ermitteln(db: Session, user: User) -> list[Anlass]:
    """Alle derzeit zutreffenden Anlaesse fuer diesen Benutzer."""
    jetzt = datetime.now(timezone.utc)
    anlaesse: list[Anlass] = []

    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    if employee:
        anlaesse += _termin_anlaesse(db, employee.id, jetzt)
        anlaesse += _wiedervorlage_anlaesse(db, employee.id)
        anlaesse += _verleih_anlaesse(db, employee.id)

    anlaesse += _nachricht_anlaesse(db, user.id)
    return anlaesse


def sichtbare_kategorien(db: Session, user_id: str) -> set[NotificationCategory]:
    """Anlaesse, die dieser Benutzer im Postfach sehen moechte.

    Getrennt von der Frage, ob ein Anlass ueberhaupt entsteht: ein Eintrag
    kann allein fuer den Push angelegt worden sein (in_app aus, push an).
    Beim Auflisten wird er dann uebergangen.
    """
    gesetzt = einstellungen(db, user_id)
    return {k for k in NotificationCategory if moechte(gesetzt, k, "in_app")}


def benachrichtigungen_auffrischen(db: Session, user: User) -> tuple[list[Notification], list[Notification]]:
    """Faellige Anlaesse anlegen. Gibt (alle neuen, davon zu pushende) zurueck.

    Zwei Entscheidungen, die vorher zusammenfielen und beide falsch waren:

    1. Ein Anlass entstand nur, wenn in_app gewuenscht war. Wer das Postfach
       abgeschaltet, den Push aber angelassen hatte, bekam gar nichts.
    2. Verschickt wurde jeder neue Eintrag - die Push-Einstellung des
       Benutzers wurde beim Versand nie gelesen. "Push aus" schickte
       trotzdem.

    Deshalb: angelegt wird, sobald einer der beiden Kanaele ihn will; die
    zweite Liste enthaelt nur die, die auch wirklich als Push hinausgehen
    duerfen. Der Datenbankeintrag bleibt in beiden Faellen noetig - er ist
    zugleich der Merker, damit derselbe Anlass nicht bei jedem Abruf erneut
    verschickt wird.
    """
    gesetzt = einstellungen(db, user.id)
    neu: list[Notification] = []
    zu_pushen: list[Notification] = []

    for anlass in anlaesse_ermitteln(db, user):
        im_postfach = moechte(gesetzt, anlass.category, "in_app")
        per_push = moechte(gesetzt, anlass.category, "push")
        if not im_postfach and not per_push:
            continue

        vorhanden = db.scalar(
            select(Notification.id).where(
                Notification.user_id == user.id,
                Notification.dedupe_key == anlass.dedupe_key,
            )
        )
        if vorhanden:
            continue

        eintrag = Notification(
            user_id=user.id,
            kind=anlass.category.value,
            title=anlass.title,
            body=anlass.body,
            link=anlass.link,
            dedupe_key=anlass.dedupe_key,
        )
        try:
            # Jeder Eintrag in einem eigenen Sicherungspunkt: laeuft derselbe
            # Abruf zweimal gleichzeitig, faengt die Eindeutigkeitsregel den
            # zweiten ab - und zwar nur ihn. Ein einfaches rollback() wuerde
            # die zuvor angelegten Meldungen dieses Durchlaufs mitnehmen.
            with db.begin_nested():
                db.add(eintrag)
        except IntegrityError:
            continue
        neu.append(eintrag)
        if per_push:
            zu_pushen.append(eintrag)

    if neu:
        db.commit()
    return neu, zu_pushen
