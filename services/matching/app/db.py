"""Gestion de la base de données — SQLAlchemy ORM."""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from semsar_common import get_settings

settings = get_settings()
database_url = settings.database_url or "postgresql+psycopg://matching:matching@localhost:5432/semsar"

engine = create_engine(database_url, echo=False)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Dependency pour récupérer la session de base de données."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialise les tables."""
    Base.metadata.create_all(bind=engine)
