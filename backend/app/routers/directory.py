"""Wer im Haus erreichbar ist - Grundlage jeder Empfaengerauswahl.

Diese Liste speist die Autovervollstaendigung beim Schreiben einer
Nachricht. Sie ist damit die naheliegendste Stelle, an der ein Konto
auftaucht, das nirgends auftauchen soll - deshalb laeuft auch sie durch die
Sichtbarkeitspruefung.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.benutzerscope import benutzer_sichtbar_filter
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User

router=APIRouter(prefix="/directory",tags=["directory"])

@router.get("/users")
def users(current: User=Depends(get_current_user), db: Session=Depends(get_db)):
    rows=db.scalars(
        select(User)
        .where(User.is_active.is_(True), benutzer_sichtbar_filter(current))
        .order_by(User.full_name)
    ).all()
    return [{"id":u.id,"full_name":u.full_name,"role":u.role.value} for u in rows]
