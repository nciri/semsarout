"""Accès données du service trust-safety — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from semsar_common import get_settings
from semsar_events import OutboxBase

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://trust_safety:trust_safety@localhost:5432/semsar",
    future=True, pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    Base.metadata.create_all(_engine)
    OutboxBase.metadata.create_all(_engine)
    # Séquence des ids d'audit émis par trust-safety : plage disjointe des autres émetteurs
    # (cf. app/audit.py) pour ne jamais collisionner dans `audit.activity_log`.
    if _engine.dialect.name == "postgresql":
        with _engine.begin() as conn:
            conn.execute(text(
                "CREATE SEQUENCE IF NOT EXISTS trust_safety.audit_log_seq START WITH 9200000000001"
            ))


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
