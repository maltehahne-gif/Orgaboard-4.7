from pydantic import BaseModel
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user, require_csrf
from app.models import Conversation, ConversationMessage, User
from app.services.assistant import chat

router = APIRouter(prefix="/assistant", tags=["assistant"])


class ChatIn(BaseModel):
    message: str
    conversation_id: str | None = None


@router.post("/chat", dependencies=[Depends(require_csrf)])
def assistant_chat(data: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return chat(db, user, data.message.strip(), data.conversation_id)


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
