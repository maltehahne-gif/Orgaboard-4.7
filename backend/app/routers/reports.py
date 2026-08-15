"""Wochen- und Monatsberichte."""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user
from app.models import User
from app.services.report import build_report, report_als_text

router = APIRouter(prefix="/reports", tags=["reports"])

ZEITRAEUME = {"week", "month"}

# Weiter zurueck als zwei Jahre ergibt keinen Bericht, sondern eine leere
# Seite - und eine offene Grenze laedt dazu ein, den Server mit Anfragen
# ueber Jahrhunderte zu beschaeftigen.
MAX_OFFSET = 104


def _pruefe(kind: str, offset: int) -> None:
    if kind not in ZEITRAEUME:
        raise HTTPException(status_code=404, detail="Unbekannter Zeitraum")
    if offset < 0 or offset > MAX_OFFSET:
        raise HTTPException(status_code=400, detail="Zeitraum liegt zu weit zurück")


@router.get("/{kind}")
def report(
    kind: str,
    offset: int = Query(default=0, description="0 = laufend, 1 = vorige Periode"),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Bericht als Daten.

    Ein Mitarbeiter bekommt immer nur die eigenen Zahlen; scoped_employee_id
    setzt das durch. Ein Teamleiter ohne Angabe bekommt den Teambericht.
    """
    _pruefe(kind, offset)
    scope = scoped_employee_id(db, user, employee_id)
    return build_report(db, user, kind, scope, offset)


@router.get("/{kind}/text", response_class=PlainTextResponse)
def report_text(
    kind: str,
    offset: int = Query(default=0),
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Derselbe Bericht als Text - zum Ablegen oder Weitergeben."""
    _pruefe(kind, offset)
    scope = scoped_employee_id(db, user, employee_id)
    daten = build_report(db, user, kind, scope, offset)
    return PlainTextResponse(
        report_als_text(daten),
        media_type="text/plain; charset=utf-8",
    )
