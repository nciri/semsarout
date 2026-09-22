import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal
from semsar_events import OutboxBase

from app import models, users_client  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    # SQLite ne reconnaît l'auto-incrément rowid que sur un type "INTEGER" exact.
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'test.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db_session, monkeypatch):
    monkeypatch.setattr(users_client, "agents", lambda agency_id: [
        {"id": 7, "name": "Samira Alaoui"}, {"id": 8, "name": "Karim Idrissi"}])
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="7", roles=["agent"], agency_id=1, is_superadmin=False, features=[], claims={})
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
