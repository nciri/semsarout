import os

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("INTERNAL_TOKEN", "change-me-internal")

from app.db import Base
from app.main import app
from fastapi.testclient import TestClient

INTERNAL = {"x-internal-token": "change-me-internal"}


@pytest.fixture(scope="function")
def db_engine():
    """Crée une base de données en mémoire pour les tests."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)

    yield engine

    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db_engine):
    """Crée une session pour chaque test."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = sessionmaker(autocommit=False, autoflush=False, bind=connection)()

    yield session

    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db_session, db_engine):
    """Crée un client FastAPI pour les tests."""
    def override_get_db():
        yield db_session

    from app.db import get_db
    app.dependency_overrides[get_db] = override_get_db

    yield TestClient(app)

    app.dependency_overrides.clear()
