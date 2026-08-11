from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from app.models import AuditLog, User


def audit(db: Session, user: User | None, action: str, entity_type: str, entity_id: str | None, before: dict | None = None, after: dict | None = None):
    db.add(AuditLog(
        user_id=user.id if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_json=jsonable_encoder(before) if before is not None else None,
        after_json=jsonable_encoder(after) if after is not None else None,
    ))
