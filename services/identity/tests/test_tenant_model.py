import pytest
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash

from app.models import UserRO


def _user(email: str, tenant: str | None = None) -> UserRO:
    kwargs = dict(email=email, password_hash=generate_password_hash("x"),
                  first_name="A", last_name="B")
    if tenant is not None:
        kwargs["tenant"] = tenant
    return UserRO(**kwargs)


def test_tenant_default_semsar(db_session):
    db_session.add(_user("a@ex.ma"))
    db_session.commit()
    assert db_session.query(UserRO).filter_by(email="a@ex.ma").one().tenant == "semsar"


def test_same_email_two_tenants_ok(db_session):
    db_session.add(_user("dup@ex.ma", "semsar"))
    db_session.add(_user("dup@ex.ma", "m3a-l3achrane"))
    db_session.commit()  # ne doit PAS lever
    assert db_session.query(UserRO).filter_by(email="dup@ex.ma").count() == 2


def test_same_email_same_tenant_rejected(db_session):
    db_session.add(_user("uniq@ex.ma", "m3a-l3achrane"))
    db_session.commit()
    db_session.add(_user("uniq@ex.ma", "m3a-l3achrane"))
    with pytest.raises(IntegrityError):
        db_session.commit()
