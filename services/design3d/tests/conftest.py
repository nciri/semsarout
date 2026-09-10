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


@pytest.fixture(autouse=True)
def allow_any_target(monkeypatch):
    """Neutralise la vérification de propriété de la cible hors des tests qui la visent.

    Cette vérification interroge listing/programs en HTTP et refuse la création
    quand ils ne répondent pas (fail-closed) : sans neutralisation, tous les tests
    de création prendraient 503. Elle est exercée pour de vrai — service simulé
    compris — dans `tests/test_target_ownership.py`.
    """
    from app import main

    monkeypatch.setattr(main, "_target_denied", lambda *a, **k: None)


@pytest.fixture
def client(db_session):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def other_agency_client(db_session):
    """Client d'une agence AUTRE que celle des appels `client`/`headers()` par défaut.

    Partage la même base que `client` (même `db_session`) mais porte des en-têtes
    d'une agence différente, pour exercer pour de vrai le cloisonnement inter-
    agences (voir `test_target_ownership.py`) plutôt que de le neutraliser.
    """
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app, headers=_headers(user_id=999, agency_id=999)) as c:
        yield c
    app.dependency_overrides.clear()


def _headers(user_id: int = 7, *, agency_id: int | None = None, features=("design3d",),
             superadmin: bool = False, tenant: str = "semsar") -> dict:
    """En-têtes x-semsar-* comme injectés par le BFF (TRUST_GATEWAY_HEADERS)."""
    h = {"x-semsar-user-id": str(user_id), "x-semsar-tenant": tenant,
         "x-semsar-features": ",".join(features)}
    if agency_id is not None:
        h["x-semsar-agency-id"] = str(agency_id)
    if superadmin:
        h["x-semsar-superadmin"] = "1"
    return h


@pytest.fixture
def headers():
    return _headers
