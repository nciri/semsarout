import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import SubscriptionPlan, Artisan
from app.services.artisan_trades import ARTISAN_TRADES, is_valid_trade

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    check(len(ARTISAN_TRADES) >= 10, "trades list has >=10 entries")
    check(is_valid_trade('plombier') and not is_valid_trade('nope'), "is_valid_trade")
    for slug in ('pro', 'enterprise'):
        p = SubscriptionPlan.query.filter_by(slug=slug).first()
        check(p and p.has_artisans is True, f"{slug} has_artisans")
    check(Artisan.query.filter_by(agency_id=None).count() >= 1, "shared demo artisan seeded")
    check(Artisan.query.filter(Artisan.agency_id.isnot(None)).count() >= 1, "private demo artisan seeded")

sys.exit(1 if FAILS else 0)
