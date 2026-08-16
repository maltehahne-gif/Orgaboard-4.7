"""Benutzerkonten deaktivieren oder endgueltig loeschen.

Zwei Vorgaenge, die nichts miteinander zu tun haben und deshalb hier
ausdruecklich getrennt stehen:

*Deaktivieren* setzt is_active=False. Das Konto bleibt vollstaendig
erhalten, die Anmeldung ist gesperrt, jede Zuordnung bleibt bestehen, und
ein spaeteres Reaktivieren stellt den alten Zustand her.

*Endgueltig loeschen* entfernt den Benutzerdatensatz wirklich - mit
Passwort-Hash, E-Mail, Telefonnummer, Avatar, Einzelrechten,
Push-Anmeldungen und Benachrichtigungen. Danach existiert kein Konto mehr,
mit dem sich jemand anmelden koennte. Ein "endgueltig loeschen", das nur
einen Haken umlegt, waere eine Luege in der Oberflaeche.

Was dabei *nicht* verschwindet, ist die Unternehmenshistorie. Kunden,
Termine, Verkaeufe, Angebote, Verleihe, Altgeraete und Wochenstatistiken
haengen am Mitarbeiterprofil, nicht am Konto. Wuerde das Profil mitgeloescht,
riss es entweder die halbe Umsatzhistorie mit oder scheiterte am
Fremdschluessel - beides waere falsch. Deshalb bleibt das Profil als
namenloser Rest zurueck: entkoppelt vom Konto, ohne persoenliche Angaben,
aber mit allen Zahlen, an denen Auswertungen frueherer Monate haengen.

Ein Profil ganz ohne Geschaeftsdaten wird stattdessen mitgeloescht - ein
leerer Rest hilft niemandem und stuende fuer immer in jeder Mitarbeiterliste.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.models import (
    Appointment,
    AuditLog,
    Conversation,
    Customer,
    CustomerNote,
    District,
    Employee,
    FollowUp,
    Message,
    MessageHidden,
    MessageRead,
    Notification,
    NotificationSetting,
    Offer,
    ProductPresentation,
    PushSubscription,
    Region,
    Rental,
    Role,
    Sale,
    Team,
    TradeIn,
    User,
    UserPermission,
    WeeklyStatistic,
)

# Name, unter dem ein entkoppeltes Mitarbeiterprofil in Auswertungen
# frueherer Monate erscheint. Kein echter Name, keine Nummer, kein Ort -
# die Zeile steht nur noch fuer die Zahlen dahinter.
GELOESCHT_ANZEIGENAME = "Gelöschtes Konto"

# Tabellen, die am Mitarbeiterprofil haengen und Unternehmenshistorie sind.
# Solange eine davon Zeilen hat, bleibt das Profil bestehen.
GESCHAEFTSDATEN = (
    (Customer, Customer.employee_id),
    (CustomerNote, CustomerNote.employee_id),
    (FollowUp, FollowUp.employee_id),
    (Appointment, Appointment.employee_id),
    (Sale, Sale.employee_id),
    (Offer, Offer.employee_id),
    (ProductPresentation, ProductPresentation.employee_id),
    (Rental, Rental.employee_id),
    (TradeIn, TradeIn.employee_id),
    (WeeklyStatistic, WeeklyStatistic.employee_id),
)


@dataclass
class Loeschbericht:
    """Was die Loeschung mit den abhaengigen Daten gemacht hat."""

    user_id: str
    employee_id: str | None = None
    profil_geloescht: bool = False
    profil_anonymisiert: bool = False
    geloeschte_zeilen: dict[str, int] = field(default_factory=dict)
    entkoppelte_zeilen: dict[str, int] = field(default_factory=dict)


# --------------------------------------------------------------- Sperren

def aktive_systemadmins(db: Session, ausser: str | None = None) -> int:
    stmt = select(func.count(User.id)).where(
        User.role == Role.SYSTEM_ADMIN, User.is_active.is_(True)
    )
    if ausser:
        stmt = stmt.where(User.id != ausser)
    return int(db.scalar(stmt) or 0)


def pruefe_loeschbar(db: Session, actor: User, ziel: User) -> None:
    """Die drei Sackgassen, aus denen es keinen Rueckweg gibt.

    1. Das eigene Konto. Ein Fehlklick in der eigenen Zeile wuerde die
       laufende Sitzung mitnehmen.
    2. Der letzte handlungsfaehige Systemadministrator. Danach koennte
       niemand mehr einen neuen einsetzen - die Rolle kommt nur ueber die
       .env zurueck.
    3. Ein Konto, das es fuer diesen Benutzer nicht gibt. Das faengt schon
       die Sichtbarkeitspruefung ab, hier steht es der Vollstaendigkeit
       halber noch einmal.
    """
    if ziel.id == actor.id:
        raise HTTPException(
            status_code=400,
            detail="Das eigene Systemadministrator-Konto lässt sich nicht löschen",
        )
    if ziel.role == Role.SYSTEM_ADMIN and aktive_systemadmins(db, ausser=ziel.id) == 0:
        raise HTTPException(
            status_code=400,
            detail=(
                "Das ist der letzte aktive Systemadministrator – danach könnte "
                "niemand mehr verwalten"
            ),
        )


# --------------------------------------------------------------- Vorgaenge

def konto_deaktivieren(db: Session, actor: User, ziel: User, aktiv: bool) -> User:
    """Anmeldung sperren oder wieder freigeben. Nichts wird entfernt."""
    if ziel.id == actor.id and not aktiv:
        raise HTTPException(status_code=400, detail="Du kannst dich nicht selbst deaktivieren")
    if not aktiv and ziel.role == Role.SYSTEM_ADMIN and aktive_systemadmins(db, ausser=ziel.id) == 0:
        raise HTTPException(
            status_code=400,
            detail="Das ist der letzte aktive Systemadministrator",
        )

    vorher = ziel.is_active
    ziel.is_active = aktiv
    audit(
        db, actor,
        "sysadmin.user_deactivated" if not aktiv else "sysadmin.user_activated",
        "user", ziel.id,
        before={"is_active": vorher},
        after={"is_active": aktiv},
    )
    return ziel


def _profil_hat_geschaeftsdaten(db: Session, employee_id: str) -> bool:
    for modell, spalte in GESCHAEFTSDATEN:
        if db.scalar(select(func.count()).select_from(modell).where(spalte == employee_id)):
            return True
    return False


def konto_endgueltig_loeschen(db: Session, actor: User, ziel: User) -> Loeschbericht:
    """Konto entfernen, Historie behalten.

    Die Reihenfolge ist nicht beliebig. Erst wird alles geloest, was auf den
    Benutzer zeigt, danach faellt der Datensatz. Umgekehrt scheitert die
    Loeschung am Fremdschluessel - oder schlimmer: eine Kaskade nimmt
    stillschweigend Daten mit, die niemand loeschen wollte.

    Bewusst mit ausdruecklichen Anweisungen statt ueber ORM-Kaskaden. Die
    Kaskade an User.employee wuerde das Mitarbeiterprofil mitnehmen, sobald
    es vom Konto geloest wird - genau das, was hier verhindert werden soll.
    """
    pruefe_loeschbar(db, actor, ziel)

    bericht = Loeschbericht(user_id=ziel.id)
    merkmale = {
        "user_id": ziel.id,
        "email": ziel.email,
        "full_name": ziel.full_name,
        "role": ziel.role.value,
        "was_active": ziel.is_active,
    }

    def entferne(modell, bedingung, name: str) -> None:
        anzahl = db.execute(delete(modell).where(bedingung)).rowcount or 0
        if anzahl:
            bericht.geloeschte_zeilen[name] = anzahl

    def entkopple(modell, bedingung, spalte: str, name: str) -> None:
        anzahl = db.execute(
            update(modell).where(bedingung).values(**{spalte: None})
        ).rowcount or 0
        if anzahl:
            bericht.entkoppelte_zeilen[name] = anzahl

    # 1. Mitarbeiterprofil. Traegt es Geschaeftsdaten, bleibt es als
    #    namenloser Rest; sonst verschwindet es mit dem Konto.
    profil = db.scalar(select(Employee).where(Employee.user_id == ziel.id))
    if profil is not None:
        bericht.employee_id = profil.id
        if _profil_hat_geschaeftsdaten(db, profil.id):
            db.execute(
                update(Employee)
                .where(Employee.id == profil.id)
                .values(
                    user_id=None,
                    display_name=GELOESCHT_ANZEIGENAME,
                    position="—",
                    employee_number=None,
                    location=None,
                    team_id=None,
                )
            )
            bericht.profil_anonymisiert = True
        else:
            db.execute(delete(Employee).where(Employee.id == profil.id))
            bericht.profil_geloescht = True

    # 2. Fuehrungszuordnungen in der Organisationsstruktur. Region, Bezirk
    #    und Team bleiben bestehen, nur ohne Leitung.
    for modell, name in ((Region, "regions"), (District, "districts"), (Team, "teams")):
        entkopple(modell, modell.lead_user_id == ziel.id, "lead_user_id", name)

    # 3. Stornovermerk an Verkaeufen. Der Verkauf bleibt storniert, nur
    #    "wer" ist nicht mehr zuzuordnen - besser als den Verkauf zu verlieren.
    entkopple(Sale, Sale.cancelled_by_user_id == ziel.id, "cancelled_by_user_id", "sales")

    # 4. Nachrichten. Empfangene Nachrichten sind fuer den Absender kein
    #    Beleg mehr, sobald es den Empfaenger nicht mehr gibt - der Verlauf
    #    des Absenders bleibt trotzdem lesbar, deshalb nur entkoppeln.
    #    Selbst geschriebene Nachrichten gehoeren zur geloeschten Person und
    #    gehen mit ihr; sender_user_id laesst sich nicht leeren.
    eigene = select(Message.id).where(Message.sender_user_id == ziel.id)
    entferne(MessageRead, MessageRead.message_id.in_(eigene), "message_reads")
    entferne(MessageHidden, MessageHidden.message_id.in_(eigene), "message_hidden")
    entferne(Message, Message.sender_user_id == ziel.id, "messages")
    entkopple(
        Message, Message.recipient_user_id == ziel.id, "recipient_user_id",
        "messages_received",
    )

    # 5. Alles, was ausschliesslich diesem Konto gehoert.
    entferne(MessageRead, MessageRead.user_id == ziel.id, "message_reads")
    entferne(MessageHidden, MessageHidden.user_id == ziel.id, "message_hidden")
    entferne(UserPermission, UserPermission.user_id == ziel.id, "user_permissions")
    entferne(NotificationSetting, NotificationSetting.user_id == ziel.id, "notification_settings")
    entferne(PushSubscription, PushSubscription.user_id == ziel.id, "push_subscriptions")
    entferne(Notification, Notification.user_id == ziel.id, "notifications")
    entferne(Conversation, Conversation.user_id == ziel.id, "conversations")

    # 6. Protokoll. Die Eintraege bleiben - sie sind der Nachweis, was
    #    frueher geschah. Nur der Verweis auf das Konto faellt weg; wer es
    #    war, steht im Loescheintrag von Schritt 8.
    entkopple(AuditLog, AuditLog.user_id == ziel.id, "user_id", "audit_logs")

    # 7. Das Konto selbst. Ohne ORM, damit die Kaskade auf User.employee
    #    nicht doch noch das Mitarbeiterprofil greift.
    db.expire_all()
    db.execute(delete(User).where(User.id == ziel.id))

    # 8. Nachvollziehbarkeit. Die Angaben stehen bewusst knapp im Protokoll:
    #    wer, wann, welches Konto - nicht der ganze Datensatz.
    audit(
        db, actor, "sysadmin.user_deleted", "user", merkmale["user_id"],
        before=merkmale,
        after={
            "employee_profile": (
                "anonymisiert" if bericht.profil_anonymisiert
                else "gelöscht" if bericht.profil_geloescht
                else "keines"
            ),
            "removed": bericht.geloeschte_zeilen,
            "detached": bericht.entkoppelte_zeilen,
        },
    )
    return bericht
