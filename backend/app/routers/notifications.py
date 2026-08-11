from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, require_csrf
from app.models import Notification, User

router=APIRouter(prefix="/notifications",tags=["notifications"])

@router.get("")
def list_notifications(user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    rows=db.scalars(select(Notification).where(Notification.user_id==user.id).order_by(Notification.created_at.desc()).limit(100)).all()
    return [{"id":n.id,"kind":n.kind,"title":n.title,"body":n.body,"created_at":n.created_at,"read_at":n.read_at} for n in rows]

@router.patch("/{notification_id}/read",dependencies=[Depends(require_csrf)])
def read(notification_id: str,user: User=Depends(get_current_user),db: Session=Depends(get_db)):
    n=db.get(Notification,notification_id)
    if not n or n.user_id!=user.id:raise HTTPException(status_code=404,detail="Benachrichtigung nicht gefunden")
    n.read_at=datetime.now(timezone.utc);db.commit();return {"ok":True}
