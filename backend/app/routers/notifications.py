from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit
from app.core.database import get_db
from app.core.security import get_current_user, require_csrf
from app.models import (
    Notification,
    NotificationCategory,
    NotificationSetting,
    PushSubscription,
    User,
)
from app.services import webpush
from app.services.notify import benachrichtigungen_auffrischen, einstellungen_uebersicht

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _out(n: Notification) -> dict:
    return {
        "id": n.id, "kind": n.kind, "title": n.title, "body": n.body,
        "link": n.link, "created_at": n.created_at, "read_at": n.read_at,
    }


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Postfach - und zugleich der Zeitpunkt, an dem faellige Anlaesse
    entstehen.

    Dieses System hat keinen Hintergrunddienst; die Ableitung laeuft deshalb
    beim Abruf. Neu entstandene Meldungen gehen anschliessend als Push
    hinaus. Faellt der Push-Versand aus, bleibt das Postfach davon
    unberuehrt - deshalb steht er hinter dem Anlegen, nicht davor.
    """
    neu = benachrichtigungen_auffrischen(db, user)
    if neu:
        webpush.senden(db, neu)

    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    ).all()
    return [_out(n) for n in rows]


@router.patch("/{notification_id}/read", dependencies=[Depends(require_csrf)])
def read(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Benachrichtigung nicht gefunden")
    n.read_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/read-all", dependencies=[Depends(require_csrf)])
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    jetzt = datetime.now(timezone.utc)
    offen = db.scalars(
        select(Notification).where(
            Notification.user_id == user.id, Notification.read_at.is_(None)
        )
    ).all()
    for n in offen:
        n.read_at = jetzt
    db.commit()
    return {"ok": True, "count": len(offen)}


# ------------------------------------------------------------ Einstellungen

class EinstellungIn(BaseModel):
    in_app: bool = True
    push: bool = True


@router.get("/settings")
def settings_lesen(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "push_available": webpush.push_verfuegbar(),
        "categories": einstellungen_uebersicht(db, user.id),
    }


@router.put("/settings/{category}", dependencies=[Depends(require_csrf)])
def settings_setzen(
    category: str,
    data: EinstellungIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        kategorie = NotificationCategory(category)
    except ValueError:
        raise HTTPException(status_code=404, detail="Unbekannte Benachrichtigungsart")

    eintrag = db.scalar(
        select(NotificationSetting).where(
            NotificationSetting.user_id == user.id,
            NotificationSetting.category == kategorie,
        )
    )
    if eintrag is None:
        eintrag = NotificationSetting(user_id=user.id, category=kategorie)
        db.add(eintrag)
    eintrag.in_app = data.in_app
    eintrag.push = data.push
    db.commit()
    return {"ok": True, "categories": einstellungen_uebersicht(db, user.id)}


# -------------------------------------------------------------------- Push

class AnmeldungIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=600)
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)
    user_agent: str | None = Field(default=None, max_length=300)


@router.get("/push/public-key")
def public_key(user: User = Depends(get_current_user)):
    """Der Schluessel, mit dem sich der Browser beim Push-Dienst anmeldet."""
    return {"public_key": webpush.oeffentlicher_schluessel(), "available": webpush.push_verfuegbar()}


@router.post("/push/subscribe", dependencies=[Depends(require_csrf)])
def subscribe(data: AnmeldungIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not webpush.push_verfuegbar():
        raise HTTPException(status_code=503, detail="Für dieses System ist kein Push eingerichtet")

    # Der Endpunkt ist geraeteweit eindeutig. Meldet sich dasselbe Geraet
    # erneut an - etwa nach einem Neustart des Browsers - wird der vorhandene
    # Eintrag aufgefrischt, statt einen zweiten anzulegen.
    vorhanden = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    if vorhanden:
        vorhanden.user_id = user.id
        vorhanden.p256dh = data.p256dh
        vorhanden.auth = data.auth
        vorhanden.user_agent = data.user_agent
        vorhanden.last_used_at = datetime.now(timezone.utc)
    else:
        db.add(PushSubscription(
            user_id=user.id, endpoint=data.endpoint, p256dh=data.p256dh,
            auth=data.auth, user_agent=data.user_agent,
        ))
    audit(db, user, "push.subscribed", "push_subscription", None)
    db.commit()
    return {"ok": True}


class AbmeldungIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=600)


@router.post("/push/unsubscribe", dependencies=[Depends(require_csrf)])
def unsubscribe(data: AbmeldungIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    eintrag = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    # Nur eigene Geraete abmelden - sonst koennte ein fremder Endpunkt
    # abgemeldet werden, indem man ihn errraet.
    if eintrag and eintrag.user_id == user.id:
        db.delete(eintrag)
        audit(db, user, "push.unsubscribed", "push_subscription", None)
        db.commit()
    return {"ok": True}


@router.get("/push/devices")
def devices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(PushSubscription)
        .where(PushSubscription.user_id == user.id)
        .order_by(PushSubscription.created_at.desc())
    ).all()
    return [
        {"id": r.id, "user_agent": r.user_agent, "created_at": r.created_at, "last_used_at": r.last_used_at}
        for r in rows
    ]
