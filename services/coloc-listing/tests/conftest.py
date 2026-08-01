import os

os.environ.setdefault("TRUST_GATEWAY_HEADERS", "true")

import pytest  # noqa: E402
from sqlalchemy import BigInteger, create_engine  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from semsar_events import OutboxBase  # noqa: E402

from app import models  # noqa: E402,F401 — enregistre les tables
from app.db import Base  # noqa: E402


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
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
def client(db_session):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def headers(user_id: int = 7, *, superadmin: bool = False,
            tenant: str = "m3a-l3achrane") -> dict:
    """En-têtes x-semsar-* comme injectés par le BFF (TRUST_GATEWAY_HEADERS)."""
    h = {"x-semsar-user-id": str(user_id), "x-semsar-tenant": tenant}
    if superadmin:
        h["x-semsar-superadmin"] = "1"
    return h
