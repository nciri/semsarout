import os, sys
from datetime import datetime, timedelta
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency
from app.commands import purge_deleted_accounts  # function form for testability

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    # Arrange: a user deleted 100 days ago, not anonymized.
    # The demo user may already be anonymized by an earlier task's verify
    # script (its email became deleted+<id>@semsar.invalid) -- fall back to it.
    u = User.query.filter_by(email='demo@semsarout.ma').first()
    if u is None:
        u = User.query.filter(User.email.like('deleted+%@semsar.invalid')).first()
    u.deleted_at = datetime.utcnow() - timedelta(days=100)
    u.anonymized_at = None
    db.session.commit()

    # Arrange: a real seeded agency, also deleted 100 days ago, not anonymized.
    ag = Agency.query.filter(Agency.email.notlike('deleted+%@semsar.invalid')).first()
    if ag is None:
        ag = Agency.query.first()
    ag.deleted_at = datetime.utcnow() - timedelta(days=100)
    ag.anonymized_at = None
    db.session.commit()

    n = purge_deleted_accounts(retention_days=90)
    check(n >= 2, "purge anonymized at least one user and one agency")
    db.session.expire_all()
    u2 = User.query.get(u.id)
    check(u2.anonymized_at is not None, "old deleted user is anonymized")
    check('@semsar.invalid' in u2.email, "email scrubbed by purge")

    ag2 = Agency.query.get(ag.id)
    check(ag2.anonymized_at is not None, "old deleted agency is anonymized")
    check(ag2.name == 'Agence supprimée' and '@semsar.invalid' in ag2.email,
          "agency name/email scrubbed by purge")

    # Idempotent: running again anonymizes nothing new
    n2 = purge_deleted_accounts(retention_days=90)
    check(n2 == 0, "purge is idempotent")

sys.exit(1 if FAILS else 0)
