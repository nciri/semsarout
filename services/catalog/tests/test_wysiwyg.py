"""Description d'un produit : saisie WYSIWYG, donc du HTML stocké et assaini à l'écriture.

Le catalogue est écrit par le super-admin et lu par les agences (fiche d'un produit de la
boutique). `marketplace` consomme `product.created/updated` mais ne projette pas la
description : la fiche de la boutique est la seule surface d'affichage.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from semsar_auth import Principal, require_superadmin
from semsar_events import OutboxBase

from app import models  # noqa: F401 — enregistre les tables
from app.db import Base, get_db
from app.main import app


@compiles(BigInteger, "sqlite")
def _bigint_as_integer_on_sqlite(element, compiler, **kw):
    # SQLite ne reconnaît l'auto-incrément rowid que sur un type "INTEGER" exact.
    return "INTEGER"


SALE = '<p class="MsoNormal">Lit <strong>160x200</strong></p><script>alert(1)</script>'
PROPRE = "<p>Lit <strong>160x200</strong></p>"


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'test.db'}", future=True,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    OutboxBase.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()
    app.dependency_overrides[get_db] = lambda: session
    app.dependency_overrides[require_superadmin] = lambda: Principal(
        sub="1", roles=["superadmin"], agency_id=None, is_superadmin=True,
        features=[], claims={})
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    session.close()


def test_creation_and_update_sanitise_the_description(client):
    created = client.post("/admin/products", json={"category": "lit", "name": "Lit < King >",
                                                   "price": 3200, "description": SALE})
    assert created.status_code == 201
    product = created.json()["product"]
    assert product["description"] == PROPRE
    # Le nom reste du texte brut : l'assainir ferait apparaître des entités à l'écran.
    assert product["name"] == "Lit < King >"

    updated = client.put(f"/admin/products/{product['id']}",
                         json={"description": '<ul><li>Sommier</li></ul><iframe src="x"></iframe>'})
    assert updated.json()["product"]["description"] == "<ul><li>Sommier</li></ul>"

    # L'éditeur vidé (`<p><br></p>`) rend la colonne NULL, pas une chaîne « non vide ».
    vide = client.put(f"/admin/products/{product['id']}", json={"description": "<p><br></p>"})
    assert vide.json()["product"]["description"] is None
