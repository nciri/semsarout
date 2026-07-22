"""Verify moderation fields + is_superadmin serialization. Run: python3 scripts/verify_model_moderation.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User

FAILS = []
def check(cond, msg):
    print(("PASS" if cond else "FAIL") + f": {msg}")
    if not cond: FAILS.append(msg)

with app.app_context():
    u = User.query.first()
    check(hasattr(u, 'is_suspended'), "User.is_suspended exists")
    check(hasattr(u, 'deleted_at'), "User.deleted_at exists")
    check(hasattr(u, 'anonymized_at'), "User.anonymized_at exists")
    d = u.to_dict()
    check('is_superadmin' in d, "to_dict has is_superadmin")
    check(d['is_superadmin'] is False, "regular user is_superadmin False")
    check(u.moderation_state() == 'active', "fresh user moderation_state active")

sys.exit(1 if FAILS else 0)
