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
    # sqlite n'autoincrémente que sur un type déclaré exactement INTEGER.
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


def make_client(db_session, is_superadmin=True, tenant=None):
    """Client HTTP du service. `tenant` pose l'en-tête que le BFF ajoute en production ;
    l'omettre reproduit un appelant historique semsarout."""
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=[], agency_id=None, is_superadmin=is_superadmin, features=[], claims={})
    headers = {"x-semsar-tenant": tenant} if tenant else {}
    return TestClient(app, headers=headers)


@pytest.fixture(autouse=True)
def _clear_overrides():
    yield
    app.dependency_overrides.clear()
