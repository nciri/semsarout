from app import models
from migrate_buyer_message import migrate_buyer_message


def test_legacy_message_migrated(db_session):
    db_session.add(models.BuyerMessage(buyer_id=10, property_id=1, subject="Info",
                                       message="Bonjour", buyer_email="a@b.c", buyer_phone="06"))
    db_session.commit()
    n = migrate_buyer_message(db_session)
    assert n == 1
    conv = db_session.query(models.Conversation).filter_by(context_type="legacy").first()
    assert conv.requester_party == 10
    msg = db_session.query(models.Message).filter_by(conversation_id=conv.id).first()
    assert msg.body == "Bonjour"
    # ré-exécution idempotente
    assert migrate_buyer_message(db_session) == 0
