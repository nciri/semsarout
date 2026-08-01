from app import models


def test_conversation_and_message_tables(db_session):
    conv = models.Conversation(property_id=1, owner_party=5, requester_party=10,
                               context_type="rental_application", context_ref_id=99, status="open")
    db_session.add(conv)
    db_session.flush()
    db_session.add(models.Message(conversation_id=conv.id, sender_party=10, body="Bonjour"))
    db_session.commit()
    assert db_session.query(models.Message).count() == 1
    assert conv.id is not None
