from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import User

router=APIRouter(prefix="/directory",tags=["directory"])

@router.get("/users")
def users(current: User=Depends(get_current_user), db: Session=Depends(get_db)):
    rows=db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)).all()
    return [{"id":u.id,"full_name":u.full_name,"role":u.role.value} for u in rows]
