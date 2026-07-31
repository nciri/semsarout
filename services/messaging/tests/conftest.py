import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, get_principal

from app import models  # noqa: F401
from app.db import Base, get_db
from app.main import app


@pytest.fixture
def db_session(tmp_path):
    db_file = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{db_file}", future=True, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    yield session
    session.close()


def make_client(db_session, uid="10", roles=("buyer",)):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_principal] = lambda: Principal(
        sub=uid, roles=list(roles), agency_id=None, is_superadmin=False, features=[], claims={})
    return TestClient(app)


@pytest.fixture
def client(db_session):
    c = make_client(db_session)
    with c:
        yield c
    app.dependency_overrides.clear()
