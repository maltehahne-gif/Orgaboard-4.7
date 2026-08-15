from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.rbac import scoped_employee_id
from app.core.security import get_current_user, require_csrf
from app.models import Conversation, ConversationMessage, User
from app.core.audit import audit
from app.services.assistant import chat
from app.services.assistant_guard import einloesen, offene_anzahl
from app.services.assistant_tools import execute_tool
from app.services.briefing import day_briefing

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None


@router.get("/status")
def assistant_status(user: User = Depends(get_current_user)):
    from app.core.config import get_settings

    settings = get_settings()
    enabled = bool(settings.ai_enabled and settings.openai_api_key)
    return {
        "enabled": enabled,
        "provider": "openai" if enabled else "local-safe",
        "model": settings.openai_model if enabled else None,
    }


@router.get("/briefing")
def briefing(
    employee_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tagesbriefing aus echten Daten - funktioniert auch ohne KI-Anbieter."""
    scope = scoped_employee_id(db, user, employee_id)
    return day_briefing(db, user, scope)


@router.post("/chat", dependencies=[Depends(require_csrf)])
def assistant_chat(data: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return chat(db, user, data.message.strip(), data.conversation_id)


class BestaetigungIn(BaseModel):
    action_id: str = Field(min_length=1, max_length=200)


@router.post("/actions/confirm", dependencies=[Depends(require_csrf)])
def aktion_bestaetigen(
    data: BestaetigungIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fuehrt ein vorgemerktes Vorhaben aus.

    Der einzige Weg, auf dem der Assistent etwas schreibt. Ausgefuehrt wird
    genau das, was beim Vormerken hinterlegt wurde - nicht, was das Modell
    inzwischen sagen wuerde. Die Rechtepruefung im Werkzeug laeuft trotzdem
    noch einmal: zwischen Vormerken und Bestaetigen koennen Minuten liegen,
    und in der Zeit kann sich eine Zustaendigkeit geaendert haben.
    """
    vorhaben = einloesen(user.id, data.action_id)

    audit(db, user, "assistant.action_confirmed", "assistant", vorhaben.id,
          after={"tool": vorhaben.werkzeug, "summary": vorhaben.beschreibung})
    db.commit()

    ergebnis = execute_tool(db, user, vorhaben.werkzeug, vorhaben.argumente, bestaetigt=True)

    if isinstance(ergebnis, dict) and ergebnis.get("error"):
        audit(db, user, "assistant.action_failed", "assistant", vorhaben.id,
              after={"tool": vorhaben.werkzeug, "error": ergebnis["error"]})
        db.commit()

    return {"action": vorhaben.werkzeug, "summary": vorhaben.beschreibung, "result": ergebnis}


@router.get("/actions/pending")
def offene_aktionen(user: User = Depends(get_current_user)):
    """Nur die Anzahl - der Inhalt steht bereits in der Chatantwort."""
    return {"open": offene_anzahl(user.id)}


@router.get("/conversations")
def conversations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows=db.scalars(select(Conversation).where(Conversation.user_id==user.id).order_by(Conversation.updated_at.desc()).limit(50)).all()
    return [{"id":c.id,"title":c.title,"updated_at":c.updated_at} for c in rows]


@router.get("/conversations/{conversation_id}")
def conversation_messages(conversation_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c=db.get(Conversation,conversation_id)
    if not c or c.user_id!=user.id:return []
    rows=db.scalars(select(ConversationMessage).where(ConversationMessage.conversation_id==c.id).order_by(ConversationMessage.created_at)).all()
    return [{"id":m.id,"role":m.role,"content":m.content,"created_at":m.created_at} for m in rows]
