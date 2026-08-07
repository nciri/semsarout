from contextlib import contextmanager

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
    """BigInteger PK autoincrémenté : sqlite n'en fait un alias du rowid (autoincrément) que si
    le type déclaré est *exactement* INTEGER (parité coloc-listing/tests/conftest.py)."""
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


def _set_principal(uid="10", roles=(), is_superadmin=False):
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub=uid, roles=list(roles), agency_id=None, is_superadmin=is_superadmin, features=[], claims={})


def make_client(db_session, uid="10", roles=(), is_superadmin=False):
    app.dependency_overrides[get_db] = lambda: db_session
    _set_principal(uid=uid, roles=roles, is_superadmin=is_superadmin)
    return TestClient(app)


@pytest.fixture
def client(db_session):
    c = make_client(db_session)
    with c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def as_superadmin(client):
    """Bascule temporairement le principal du `client` courant en super-admin (même `app`,
    donc pas de fixture séparée — les deux partageraient `app.dependency_overrides`)."""
    @contextmanager
    def _ctx(uid="99"):
        _set_principal(uid=uid, is_superadmin=True)
        try:
            yield client
        finally:
            _set_principal()  # repli sur l'utilisateur normal du fixture `client`
    return _ctx
