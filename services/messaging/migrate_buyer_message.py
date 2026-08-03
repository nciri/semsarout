"""Migration idempotente BuyerMessage → Conversation/Message (legacy).

    python migrate_buyer_message.py   # utilise DATABASE_URL
"""
from app.db import SessionLocal
from app.models import BuyerMessage, Conversation, Message


def migrate_buyer_message(db) -> int:
    migrated = 0
    for bm in db.query(BuyerMessage).order_by(BuyerMessage.id).all():
        conv = (db.query(Conversation)
                .filter(Conversation.property_id == bm.property_id,
                        Conversation.requester_party == bm.buyer_id,
                        Conversation.context_type == "legacy").first())
        if conv is None:
            conv = Conversation(property_id=bm.property_id, owner_party=None,
                                requester_party=bm.buyer_id, context_type="legacy",
                                context_ref_id=bm.id, status="open", created_at=bm.created_at)
            db.add(conv)
            db.flush()
            db.add(Message(conversation_id=conv.id, sender_party=bm.buyer_id,
                           body=bm.message, created_at=bm.created_at))
            migrated += 1
    db.commit()
    return migrated


if __name__ == "__main__":
    s = SessionLocal()
    try:
        print(f"migrés: {migrate_buyer_message(s)}")
    finally:
        s.close()
