import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal
from semsar_events import OutboxBase

from app import models  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def principal():
    return Principal(sub="1", roles=["buyer"], agency_id=None,
                     is_superadmin=True, features=[], claims={})


@pytest.fixture
def client(db_session, principal):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: principal
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def make_client(db_session, uid: int, roles: list[str]):
    p = Principal(sub=str(uid), roles=roles, agency_id=None,
                  is_superadmin=False, features=[], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: p
    return TestClient(app)
