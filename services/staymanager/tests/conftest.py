import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal

from app import billing_client, models  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app

AGENCY = 4


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    """SQLite n'auto-incrémente que sur un type « INTEGER » exact."""
    return "INTEGER"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'test.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def client(db_session, monkeypatch):
    # Le plan de l'agence ouvre la fonction : l'abonnement est vérifié ailleurs.
    monkeypatch.setattr(billing_client, "subscription",
                        lambda agency_id: {"status": "active", "has_staymanager_sync": True})
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub="10", roles=["agency_admin"], agency_id=AGENCY, is_superadmin=False,
        features=[], claims={})
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
