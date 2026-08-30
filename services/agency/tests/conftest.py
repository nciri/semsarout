import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal
from semsar_events import OutboxBase

from app import models  # noqa: F401
from app.db import Base, get_db
from app.main import app


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    """BigInteger PK autoincrémenté : parité trust-safety/tests/conftest.py."""
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


def _set_principal(uid="10", roles=(), agency_id=None, is_superadmin=False):
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub=uid, roles=list(roles), agency_id=agency_id, is_superadmin=is_superadmin,
        features=[], claims={})


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    _set_principal()
    c = TestClient(app)
    with c:
        yield c
    app.dependency_overrides.clear()
