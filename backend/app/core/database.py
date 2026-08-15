from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import get_settings

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)


if settings.database_url.startswith("sqlite"):
    # SQLite prueft Fremdschluessel nur, wenn man es ausdruecklich einschaltet -
    # sonst laufen Regeln wie ON DELETE SET NULL stillschweigend ins Leere.
    # Produktiv laeuft PostgreSQL, das immer prueft. Ohne diese Zeile
    # verhaelt sich die Entwicklungs- und Testdatenbank anders als der
    # Ernstfall, und genau solche Unterschiede fallen erst spaet auf.
    @event.listens_for(engine, "connect")
    def _sqlite_fremdschluessel_einschalten(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
