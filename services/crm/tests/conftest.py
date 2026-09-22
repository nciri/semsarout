import os

os.environ.setdefault("TRUST_GATEWAY_HEADERS", "true")  # lu à l'import de app.main

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import BigInteger, create_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from semsar_events import OutboxBase  # noqa: E402

from app import models, users_client  # noqa: E402,F401 — enregistre les tables
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


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
    # Les noms d'agents viennent d'identity : pas d'appel réseau en test.
    monkeypatch.setattr(users_client, "agents", lambda agency_id: [])
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app, headers={"x-semsar-user-id": "7", "x-semsar-agency-id": "1"}) as c:
        yield c
    app.dependency_overrides.clear()
