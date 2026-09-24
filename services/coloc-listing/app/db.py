"""Accès données du service coloc-listing — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from semsar_common import get_settings

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar",
    future=True, pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    from semsar_events import OutboxBase  # table outbox locale au schéma du service

    Base.metadata.create_all(_engine)
    OutboxBase.metadata.create_all(_engine)
    # Séquence des ids d'audit émis par coloc-listing : plage disjointe des autres
    # émetteurs (cf. app/audit.py) pour ne jamais collisionner dans `audit.activity_log`.
    with _engine.begin() as conn:
        conn.execute(text(
            "CREATE SEQUENCE IF NOT EXISTS coloc_listing.audit_log_seq START WITH 9100000000001"
        ))


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
