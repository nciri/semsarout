import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import Product, Cart, CartItem, Order, OrderItem, Agency, User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)

with app.app_context():
    a = Agency.query.first(); u = User.query.filter_by(agency_id=a.id).first() or User.query.first()
    p = Product(category='lit', group='furniture', name='Lit double', price=1500, stock=5, is_active=True)
    db.session.add(p); db.session.commit()
    check(p.to_dict()['price'] == 1500.0, "Product.to_dict price float")
    cart = Cart(user_id=u.id); db.session.add(cart); db.session.commit()
    ci = CartItem(cart_id=cart.id, product_id=p.id, quantity=2); db.session.add(ci); db.session.commit()
    check(ci.to_dict()['line_total'] == 3000.0, "CartItem line_total")
    o = Order(reference='CMD-TEST01', agency_id=a.id, buyer_id=u.id, status='pending', subtotal=3000, total=3000)
    db.session.add(o); db.session.commit()
    oi = OrderItem(order_id=o.id, product_id=p.id, product_name='Lit double', unit_price=1500, quantity=2, line_total=3000)
    db.session.add(oi); db.session.commit()
    d = o.to_dict(include_items=True)
    check(d['items_count'] == 1 and d['items'][0]['product_name'] == 'Lit double', "Order.to_dict items snapshot")
    for x in (oi, o, ci, cart, p):
        db.session.delete(x)
        db.session.flush()
    db.session.commit()

sys.exit(1 if FAILS else 0)
