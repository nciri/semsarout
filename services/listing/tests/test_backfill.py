from semsar_events import OutboxEvent

from app.backfill import reindex_all
from app.models import Property


def _bien(db, **kw):
    titre = kw.get("title", "Villa Souissi")
    p = Property(reference=f"REF-{abs(hash(titre)) % 10000}", title=titre, property_type="villa",
                 transaction_type="sale", price=2500000, city="Rabat",
                 status=kw.get("status", "active"), agency_id=1, owner_id=1)
    db.add(p)
    db.commit()
    return p


def test_le_rattrapage_remet_un_evenement_par_bien_dans_l_outbox(db_session):
    # Les biens copiés en base sans passer par l'API n'ont jamais émis `listing.created` :
    # l'index public reste vide alors que le back-office, qui lit la base, les montre tous.
    a = _bien(db_session, title="Villa Souissi")
    b = _bien(db_session, title="Appartement Agdal", status="draft")

    assert reindex_all(db_session) == 2

    lignes = db_session.query(OutboxEvent).order_by(OutboxEvent.id).all()
    assert [l.event_type for l in lignes] == ["listing.created", "listing.created"]
    assert [l.aggregate_id for l in lignes] == [str(a.id), str(b.id)]
    assert all(l.published_at is None for l in lignes)
    # Charge utile identique à celle de l'API : le worker search indexe le doc tel quel, et
    # c'est son filtre `status=active` qui écarte le brouillon — pas le rattrapage.
    assert lignes[0].payload["title"] == "Villa Souissi"
    assert lignes[0].payload["city"] == "Rabat"
    assert lignes[0].payload["status"] == "active"
    assert lignes[1].payload["status"] == "draft"
    assert "images" in lignes[0].payload


def test_le_rattrapage_ne_fait_rien_sans_bien(db_session):
    assert reindex_all(db_session) == 0
    assert db_session.query(OutboxEvent).count() == 0
