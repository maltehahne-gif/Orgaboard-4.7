from pydantic import BaseModel, EmailStr
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import create_session_token, get_current_user, hash_password, make_csrf_token, verify_password, require_csrf
from app.models import Employee, User

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


def user_payload(db: Session, user: User) -> dict:
    employee = db.scalar(select(Employee).where(Employee.user_id == user.id))
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role.value,
        "must_change_password": user.must_change_password,
        "employee": None if not employee else {
            "id": employee.id,
            "display_name": employee.display_name,
            "position": employee.position,
            "weekly_units_target": employee.weekly_units_target,
            "weekly_revenue_target_cents": employee.weekly_revenue_target_cents,
        },
    }


@router.post("/login")
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower().strip(), User.is_active.is_(True)))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort ist falsch")
    token = create_session_token(user)
    csrf = make_csrf_token()
    response.set_cookie("orgaboard_session", token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=settings.jwt_exp_minutes * 60, path="/")
    response.set_cookie("orgaboard_csrf", csrf, httponly=False, secure=settings.cookie_secure, samesite="lax", max_age=settings.jwt_exp_minutes * 60, path="/")
    return user_payload(db, user)


@router.post("/logout", dependencies=[Depends(require_csrf)])
def logout(response: Response):
    response.delete_cookie("orgaboard_session", path="/")
    response.delete_cookie("orgaboard_csrf", path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_payload(db, user)


@router.post("/change-password", dependencies=[Depends(require_csrf)])
def change_password(data: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Aktuelles Passwort ist falsch")
    if len(data.new_password) < 12:
        raise HTTPException(status_code=400, detail="Das neue Passwort muss mindestens 12 Zeichen lang sein")
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
    return {"ok": True}
