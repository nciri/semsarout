import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Product
from app.services.product_categories import PRODUCT_CATEGORIES, is_valid_category, group_of

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    check(len(PRODUCT_CATEGORIES) >= 8, "categories >= 8")
    check(is_valid_category('lit') and not is_valid_category('nope'), "is_valid_category")
    check(group_of('refrigerateur') == 'appliance', "group_of appliance")
    check(Product.query.filter_by(is_active=True).count() >= 4, "demo products seeded")
    groups = {p.group for p in Product.query.all()}
    check('furniture' in groups and 'appliance' in groups, "both groups seeded")

sys.exit(1 if FAILS else 0)
