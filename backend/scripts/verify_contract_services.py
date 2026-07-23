import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import Agency, Property, Client
from app.services.html_sanitize import sanitize_html
from app.services.contract_merge import build_context, render

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    dirty = '<p onclick="x()">hi</p><script>alert(1)</script><b>ok</b><img src=x onerror=alert(1)>'
    clean = sanitize_html(dirty)
    check('<script>' not in clean.lower() and 'onerror' not in clean.lower() and 'onclick' not in clean.lower(), "script/handlers stripped")
    check('<b>ok</b>' in clean or '<b>ok' in clean, "allowed tag kept")

    a = Agency.query.first()
    p = Property.query.filter_by(agency_id=a.id).first() or Property.query.first()
    ctx = build_context(a, property=p)
    check('agency_name' in ctx and 'property_price' in ctx, "context has keys")
    out = render('Bien: {{property_address}} — Prix: {{property_price}} — {{unknown_key}}', ctx)
    check('{{property_address}}' not in out and '{{unknown_key}}' not in out, "placeholders replaced, unknown -> empty")

sys.exit(1 if FAILS else 0)
