import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal
from semsar_events import OutboxBase

from app import models  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    # SQLite ne reconnaît l'auto-incrément rowid que sur un type "INTEGER" exact — un
    # BigInteger (BIGINT) primary key resterait NULL à l'insert sans ce mapping.
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


def make_owner_client(db_session, uid, roles=("buyer",)):
    """Client de test authentifié comme un particulier (pas d'agence/mandat)."""
    owner_principal = Principal(sub=str(uid), roles=list(roles), agency_id=None,
                                is_superadmin=False, features=[], claims={})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: owner_principal
    return TestClient(app)
