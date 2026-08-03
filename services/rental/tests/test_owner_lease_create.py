from app import models
from tests.conftest import make_owner_client  # helper à ajouter au conftest (principal uid=5)


def test_owner_creates_lease_from_accepted_application(db_session):
    db_session.add(models.TenantApplication(id=1, property_id=2, owner_id=5,
                                            applicant_user_id=10, status="accepted"))
    db_session.commit()
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases",
                    json={"application_id": 1, "rent_amount": 4500})
    assert r.status_code == 201
    lease = db_session.query(models.Lease).first()
    assert lease.owner_id == 5 and lease.tenant_user_id == 10 and lease.status == "draft"


def test_owner_cannot_use_others_application(db_session):
    db_session.add(models.TenantApplication(id=2, property_id=2, owner_id=99,
                                            applicant_user_id=10, status="accepted"))
    db_session.commit()
    client = make_owner_client(db_session, uid="5")
    r = client.post("/gestion-locative/owner/leases", json={"application_id": 2, "rent_amount": 4500})
    assert r.status_code in (403, 404)
