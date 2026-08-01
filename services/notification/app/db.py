"""Accès données du service notification — schéma + rôle dédiés (ADR-0002)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from semsar_common import get_settings

_settings = get_settings()
_engine = create_engine(
    _settings.database_url or "postgresql+psycopg://notification:notification@localhost:5432/semsar",
    future=True,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


def init_db() -> None:
    Base.metadata.create_all(_engine)
