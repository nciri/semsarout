import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401 — enregistre les tables sur Base
from app.azure_client import AzureTranslatorClient
from app.db import Base, get_db
from app.main import app, get_azure_client


class FakeAzureClient(AzureTranslatorClient):
    """Client Azure Translator mocké : aucun réseau, traduction déterministe.

    Compte les appels (`self.calls`) pour vérifier qu'un seul appel batch est fait par lot
    de textes manquants, et refuse tout accès réseau réel (`translate` ne fait jamais de
    requête HTTP).
    """

    def __init__(self):
        super().__init__(key="fake-key", endpoint="https://example.invalid", region="westeurope")
        self.calls: list[list[str]] = []

    def translate(self, texts, target, source=None):
        self.calls.append(list(texts))
        detected = source or ("ar" if target == "fr" else "fr")
        return [{"translated": f"[{target}] {t}", "detected_source": detected} for t in texts]


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(
        f"sqlite:///{db_file}", future=True, connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


@pytest.fixture
def fake_azure():
    return FakeAzureClient()


@pytest.fixture
def client(db_session, fake_azure):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_azure_client] = lambda: fake_azure
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
