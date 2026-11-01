from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    with TestClient(app) as client:
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


def test_indexed_description_is_plain_text():
    """La description est saisie en WYSIWYG, et les listes de biens sont servies depuis cet
    index : indexées telles quelles, ses balises deviendraient des termes de recherche
    (« strong », « li ») et l'extrait d'une carte montrerait du balisage. La fiche d'un bien
    vient du service `listing` et garde, elle, sa mise en forme."""
    from semsar_search.index import _index_doc

    doc = _index_doc({"id": 1, "title": "Riad",
                      "description": "<p>Salon <strong>refait</strong></p>"
                                     "<ul><li>terrasse</li><li>garage</li></ul>"})
    assert doc["description"] == "Salon refait terrasse garage"
    assert _index_doc({"id": 2, "description": None})["description"] is None
