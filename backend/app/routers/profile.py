from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.audit import audit
from app.core.database import get_db
from app.core.rbac import current_employee, require_team_leader
from app.core.security import get_current_user, require_csrf
from app.models import Employee, User

router = APIRouter(prefix="/profile", tags=["profile"])


class ProfileUpdate(BaseModel):
    monthly_units_target: int = Field(ge=1, le=1000)
    weekly_revenue_target_cents: int | None = Field(default=None, ge=0)
    daily_area_target_cents: int | None = Field(default=None, ge=0)
    daily_total_target_cents: int | None = Field(default=None, ge=0)


class KontaktdatenUpdate(BaseModel):
    """Anschrift und Telefonnummer des Kundenberaters.

    Sie stehen oben links auf jeder Rechnung, die er ausstellt. Deshalb
    pflegt jeder sie selbst - fest im Code hinterlegt waere sie fuer genau
    einen Berater richtig und fuer alle anderen falsch.
    """

    phone: str | None = Field(default=None, max_length=80)
    street: str | None = Field(default=None, max_length=180)
    house_number: str | None = Field(default=None, max_length=30)
    postal_code: str | None = Field(default=None, max_length=20)
    city: str | None = Field(default=None, max_length=120)


@router.get("")
def profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e=current_employee(db,user)
    return {"id":e.id,"display_name":e.display_name,"position":e.position,"monthly_units_target":e.monthly_units_target,"weekly_revenue_target_cents":e.weekly_revenue_target_cents,"daily_area_target_cents":e.daily_area_target_cents,"daily_total_target_cents":e.daily_total_target_cents}


@router.get("/kontaktdaten")
def kontaktdaten(user: User = Depends(get_current_user)):
    return {
        "full_name": user.full_name,
        "phone": user.phone,
        "street": user.street,
        "house_number": user.house_number,
        "postal_code": user.postal_code,
        "city": user.city,
    }


@router.put("/kontaktdaten", dependencies=[Depends(require_csrf)])
def kontaktdaten_speichern(
    data: KontaktdatenUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vorher = {feld: getattr(user, feld) for feld in ("phone", "street", "house_number", "postal_code", "city")}
    for feld, wert in data.model_dump().items():
        setattr(user, feld, (wert or "").strip() or None)
    audit(db, user, "profile.contact_updated", "user", user.id, before=vorher, after=data.model_dump())
    db.commit()
    return kontaktdaten(user)


@router.put("", dependencies=[Depends(require_csrf)])
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e=current_employee(db,user);before={"monthly_units_target":e.monthly_units_target,"weekly_revenue_target_cents":e.weekly_revenue_target_cents,"daily_area_target_cents":e.daily_area_target_cents,"daily_total_target_cents":e.daily_total_target_cents}
    e.monthly_units_target=data.monthly_units_target;e.weekly_revenue_target_cents=data.weekly_revenue_target_cents;e.daily_area_target_cents=data.daily_area_target_cents;e.daily_total_target_cents=data.daily_total_target_cents
    audit(db,user,"profile.targets_updated","employee",e.id,before=before,after=data.model_dump());db.commit();return data.model_dump()
