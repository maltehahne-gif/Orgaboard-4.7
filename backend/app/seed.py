from sqlalchemy import select
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, engine
from app.core.security import hash_password
from app.models import Employee, Role, User

USERS=[
    ("Björn Hahne","hahne.erfurt@gmail.com",Role.EMPLOYEE),
    ("Jessica Wunder","jessica.wunder@example.com",Role.EMPLOYEE),
    ("Susanne Menzel","susanne.menzel@example.com",Role.EMPLOYEE),
    ("Britta C.B","britta.cb@example.com",Role.EMPLOYEE),
    ("Joachim Hansen","joachim.hansen@example.com",Role.EMPLOYEE),
    ("Matthias Knappe","matthias.knappe@example.com",Role.EMPLOYEE),
    ("Britta Baumhof","britta.baumhof@example.com",Role.EMPLOYEE),
    ("Carsten Böhrensen","carsten.boehrensen@example.com",Role.TEAM_LEADER),
]


def main():
    settings=get_settings()
    if not settings.seed_default_password:
        raise SystemExit("SEED_DEFAULT_PASSWORD muss gesetzt sein. Es werden keine Passwörter hart codiert.")
    Base.metadata.create_all(bind=engine)
    db=SessionLocal()
    try:
        for full_name,email,role in USERS:
            existing=db.scalar(select(User).where(User.email==email))
            if existing:continue
            u=User(email=email,full_name=full_name,password_hash=hash_password(settings.seed_default_password),role=role,must_change_password=True)
            db.add(u);db.flush()
            db.add(Employee(user_id=u.id,display_name=full_name,position="Teamleiter" if role==Role.TEAM_LEADER else "Vertriebspartner",monthly_units_target=30))
        db.commit()
        print("Benutzer angelegt. Alle müssen beim ersten Login das Passwort ändern.")
    finally:
        db.close()

if __name__=="__main__":main()
