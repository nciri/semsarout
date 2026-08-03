# Marketplace meubles & électroménager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host-facing marketplace: a super-admin-managed platform catalog of furniture/appliances, a backoffice storefront (browse → cart → checkout → simulated payment) with per-agency orders and stock decremented on payment, plus super-admin product & order management.

**Architecture:** Five models (`Product`, `Cart`, `CartItem`, `Order`, `OrderItem`) + a `product_categories` constant; backoffice `/shop/*` routes (`require_auth`, agency-scoped orders / user-scoped cart); super-admin `/admin/products` + `/admin/orders` (`require_superadmin`). Payment reuses the app's existing mock pattern (no real Stripe). Frontend: a backoffice Boutique + My orders, and super-admin product/order pages.

**Tech Stack:** Flask + SQLAlchemy (backend); React 18 + react-router + react-query (frontend). No new deps. Spec: `docs/superpowers/specs/2026-07-24-marketplace-design.md`.

## Global Constraints

- **JWT identity always `str(user.id)`**; agency scope from `require_auth` (`g.agency_id`, `g.current_user`) in `backend/app/api/v1/backoffice/dashboard.py`; super-admin from `require_superadmin` in `backend/app/api/v1/admin/__init__.py`.
- **No pytest infra.** Verification = standalone scripts in `backend/scripts/`, `from seed import app`, `app.test_client()`. Print PASS/FAIL, non-zero exit on failure. Agency-member seed password `password123`; super-admin `admin@semsarout.ma`/`admin123`.
- **Frontend API via the shared `api` axios instance.**
- **Access:** shop routes require `require_auth`; cart/order routes require an agency (`g.agency_id`) else 403. Catalog CRUD is super-admin only. Storefront lists only `is_active=True` products.
- **Isolation:** cart scoped by `user_id` (buyer); orders scoped by `agency_id`. An agency sees only its orders; super-admin sees all. No cross-agency read/write.
- **Stock:** checked at checkout (each line `stock >= quantity` else 400 naming the product); decremented at payment (re-checked → 409 if insufficient). Never negative.
- **Snapshots:** `OrderItem.product_name`/`unit_price`/`line_total` frozen at order time; `product_id` nullable so a later product delete doesn't break the order; changing a product price later must NOT change an existing order's total.
- **Category validation:** `category` validated against `PRODUCT_CATEGORIES` ids; `group` derived server-side; unknown → 400.
- **Money is MAD**, `Numeric(12,2)`, `to_dict` uses `float()` with None-safety. French UI copy.
- Backend venv: `cd backend && source venv/bin/activate`. Migration head via `flask db heads`.
- TDD each task; Conventional Commits French; NEVER AI attribution; commit ONLY the task's listed files (never stage unrelated changes, e.g. PropertyDetail.jsx).

---

### Task 1: Models + migration

**Files:**
- Create: `backend/app/models/shop.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/a7b8c9d0e1f2_add_marketplace.py`
- Test: `backend/scripts/verify_shop_models.py`

**Interfaces (Produces):** `Product`, `Cart`, `CartItem`, `Order`, `OrderItem` with `to_dict()` as per spec §4.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_shop_models.py`:
```python
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
    for x in (oi, o, ci, cart, p): db.session.delete(x)
    db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_shop_models.py`
Expected: FAIL (ImportError).

- [ ] **Step 3: Create the models**

Create `backend/app/models/shop.py`:
```python
from datetime import datetime
from app import db


class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(40), nullable=False, index=True)
    group = db.Column(db.String(20), nullable=False)  # furniture|appliance
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    stock = db.Column(db.Integer, default=0)
    image_url = db.Column(db.String(500))
    is_active = db.Column(db.Boolean, default=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {'id': self.id, 'category': self.category, 'group': self.group, 'name': self.name,
                'description': self.description, 'price': float(self.price or 0), 'stock': self.stock,
                'image_url': self.image_url, 'is_active': self.is_active,
                'created_at': self.created_at.isoformat() if self.created_at else None}


class Cart(db.Model):
    __tablename__ = 'carts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class CartItem(db.Model):
    __tablename__ = 'cart_items'
    id = db.Column(db.Integer, primary_key=True)
    cart_id = db.Column(db.Integer, db.ForeignKey('carts.id'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1)

    def to_dict(self):
        p = Product.query.get(self.product_id)
        unit = float(p.price) if p else 0.0
        return {'id': self.id, 'product_id': self.product_id, 'quantity': self.quantity,
                'product': ({'id': p.id, 'name': p.name, 'price': unit, 'image_url': p.image_url,
                             'stock': p.stock, 'is_active': p.is_active} if p else None),
                'line_total': round(unit * self.quantity, 2)}


class Order(db.Model):
    __tablename__ = 'orders'
    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(20), unique=True, nullable=False, index=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False, index=True)
    buyer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=True)
    delivery_address = db.Column(db.Text)
    status = db.Column(db.String(20), default='pending')
    subtotal = db.Column(db.Numeric(12, 2), default=0)
    total = db.Column(db.Numeric(12, 2), default=0)
    payment_reference = db.Column(db.String(50), nullable=True)
    paid_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self, include_items=False):
        items = OrderItem.query.filter_by(order_id=self.id).all()
        d = {'id': self.id, 'reference': self.reference, 'agency_id': self.agency_id,
             'buyer_id': self.buyer_id, 'property_id': self.property_id,
             'delivery_address': self.delivery_address, 'status': self.status,
             'subtotal': float(self.subtotal or 0), 'total': float(self.total or 0),
             'payment_reference': self.payment_reference,
             'paid_at': self.paid_at.isoformat() if self.paid_at else None,
             'items_count': len(items),
             'created_at': self.created_at.isoformat() if self.created_at else None}
        if include_items:
            d['items'] = [i.to_dict() for i in items]
        return d


class OrderItem(db.Model):
    __tablename__ = 'order_items'
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey('orders.id'), nullable=False, index=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    product_name = db.Column(db.String(200), nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)

    def to_dict(self):
        return {'id': self.id, 'product_id': self.product_id, 'product_name': self.product_name,
                'unit_price': float(self.unit_price or 0), 'quantity': self.quantity,
                'line_total': float(self.line_total or 0)}
```

- [ ] **Step 4: Register the models**

In `backend/app/models/__init__.py` add:
```python
from app.models.shop import Product, Cart, CartItem, Order, OrderItem
```

- [ ] **Step 5: Migration**

Find head (`flask db heads`). Create `backend/migrations/versions/a7b8c9d0e1f2_add_marketplace.py` (revision `a7b8c9d0e1f2`, `down_revision` = that head). Create the 5 tables (`products`, `carts` (unique user_id), `cart_items`, `orders` (unique reference), `order_items`) with the columns above and indexes on `cart_items.cart_id`, `orders.agency_id`, `orders.reference`, `order_items.order_id`, `products.category`. `downgrade()` drops them in reverse FK order: `order_items` → `orders` → `cart_items` → `carts` → `products`. Apply: `flask db upgrade`.

- [ ] **Step 6: Run — verify it passes**

Run: `python3 scripts/verify_shop_models.py`
Expected: all PASS.

- [ ] **Step 7: Commit**
```bash
git add backend/app/models/shop.py backend/app/models/__init__.py backend/migrations/versions/a7b8c9d0e1f2_add_marketplace.py backend/scripts/verify_shop_models.py
git commit -m "feat(marketplace): modèles Product/Cart/CartItem/Order/OrderItem + migration"
```

---

### Task 2: Categories constant + seed demo products

**Files:**
- Create: `backend/app/services/product_categories.py`
- Modify: `backend/seed_backoffice.py`
- Test: `backend/scripts/verify_shop_seed.py`

**Interfaces (Produces):** `PRODUCT_CATEGORIES`, `is_valid_category(id)`, `group_of(id)`; after seeding ≥4 active demo products across both groups.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_shop_seed.py`:
```python
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
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_shop_seed.py`
Expected: FAIL.

- [ ] **Step 3: Create the categories constant**

Create `backend/app/services/product_categories.py`:
```python
"""Fixed marketplace categories (validated)."""

PRODUCT_CATEGORIES = [
    {'id': 'lit', 'label': 'Lit', 'group': 'furniture'},
    {'id': 'canape', 'label': 'Canapé', 'group': 'furniture'},
    {'id': 'table', 'label': 'Table', 'group': 'furniture'},
    {'id': 'armoire', 'label': 'Armoire', 'group': 'furniture'},
    {'id': 'chaise', 'label': 'Chaise', 'group': 'furniture'},
    {'id': 'bureau', 'label': 'Bureau', 'group': 'furniture'},
    {'id': 'refrigerateur', 'label': 'Réfrigérateur', 'group': 'appliance'},
    {'id': 'lave_linge', 'label': 'Lave-linge', 'group': 'appliance'},
    {'id': 'four', 'label': 'Four', 'group': 'appliance'},
    {'id': 'micro_ondes', 'label': 'Micro-ondes', 'group': 'appliance'},
    {'id': 'climatiseur', 'label': 'Climatiseur', 'group': 'appliance'},
    {'id': 'television', 'label': 'Télévision', 'group': 'appliance'},
]
_BY_ID = {c['id']: c for c in PRODUCT_CATEGORIES}


def is_valid_category(cid):
    return cid in _BY_ID


def group_of(cid):
    c = _BY_ID.get(cid)
    return c['group'] if c else None
```

- [ ] **Step 4: Seed in seed_backoffice.py**

In `backend/seed_backoffice.py`, add a function and call it from the seed entrypoint:
```python
def seed_products():
    from app.models import Product
    if Product.query.count() > 0:
        return
    DEMO = [
        ('lit', 'Lit double 160x200', 2500, 12),
        ('canape', "Canapé d'angle 4 places", 4800, 6),
        ('table', 'Table à manger 6 personnes', 1900, 9),
        ('armoire', 'Armoire 3 portes', 3200, 5),
        ('refrigerateur', 'Réfrigérateur combiné 300L', 4500, 8),
        ('lave_linge', 'Lave-linge 8kg', 3900, 7),
        ('four', 'Four encastrable', 2800, 4),
        ('television', 'Télévision LED 50"', 3500, 10),
    ]
    from app.services.product_categories import group_of
    for cat, name, price, stock in DEMO:
        db.session.add(Product(category=cat, group=group_of(cat), name=name, price=price, stock=stock, is_active=True))
    db.session.commit()
    print("  Seeded demo marketplace products")
```
Call `seed_products()` in the seed entrypoint.

- [ ] **Step 5: Re-seed + verify**

Run: `python3 seed_backoffice.py && python3 scripts/verify_shop_seed.py`
Expected: all PASS. (If reseed needs a schema reset per the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed; do NOT modify seed.py.)

- [ ] **Step 6: Commit**
```bash
git add backend/app/services/product_categories.py backend/seed_backoffice.py backend/scripts/verify_shop_seed.py
git commit -m "feat(marketplace): constante catégories + seed produits de démo"
```

---

### Task 3: Storefront products API (categories, list active, detail)

**Files:**
- Create: `backend/app/api/v1/backoffice/shop.py`
- Modify: `backend/app/api/v1/backoffice/__init__.py`
- Test: `backend/scripts/verify_shop_products_api.py`

**Interfaces (Produces):**
- `_agency()` helper.
- `GET /shop/categories` · `GET /shop/products?group=&category=&q=` (active only) · `GET /shop/products/:id` (active).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_shop_products_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Product

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    # an inactive product must not appear
    inactive = Product(category='chaise', group='furniture', name='__inactive__', price=100, stock=1, is_active=False)
    db.session.add(inactive); db.session.commit()
    c = app.test_client()
    tok = login(c, u.email, 'password123')
    h = {'Authorization': f'Bearer {tok}'}
    check(c.get('/api/v1/backoffice/shop/products').status_code == 401, "products require auth")
    r = c.get('/api/v1/backoffice/shop/categories', headers=h)
    check(r.status_code == 200 and len(r.get_json()['categories']) >= 8, "categories 200")
    r = c.get('/api/v1/backoffice/shop/products', headers=h)
    names = [p['name'] for p in r.get_json()['products']]
    check(r.status_code == 200 and '__inactive__' not in names, "only active products listed")
    r = c.get('/api/v1/backoffice/shop/products?group=appliance', headers=h)
    check(all(p['group'] == 'appliance' for p in r.get_json()['products']), "group filter works")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_shop_products_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement product routes**

Create `backend/app/api/v1/backoffice/shop.py`:
```python
from flask import jsonify, request, g
from app import db
from app.models import Product, Agency
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.product_categories import PRODUCT_CATEGORIES


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


@backoffice_bp.route('/shop/categories', methods=['GET'])
@require_auth
def shop_categories():
    return jsonify({'categories': PRODUCT_CATEGORIES})


@backoffice_bp.route('/shop/products', methods=['GET'])
@require_auth
def shop_products():
    q = Product.query.filter_by(is_active=True)
    if request.args.get('group'):
        q = q.filter(Product.group == request.args.get('group'))
    if request.args.get('category'):
        q = q.filter(Product.category == request.args.get('category'))
    if request.args.get('q'):
        q = q.filter(Product.name.ilike(f"%{request.args.get('q')}%"))
    return jsonify({'products': [p.to_dict() for p in q.order_by(Product.name).all()]})


@backoffice_bp.route('/shop/products/<int:pid>', methods=['GET'])
@require_auth
def shop_product(pid):
    p = Product.query.filter_by(id=pid, is_active=True).first()
    if not p:
        return jsonify({'error': 'Produit introuvable'}), 404
    return jsonify({'product': p.to_dict()})
```
In `backend/app/api/v1/backoffice/__init__.py`, add `from app.api.v1.backoffice import shop`.

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_shop_products_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/shop.py backend/app/api/v1/backoffice/__init__.py backend/scripts/verify_shop_products_api.py
git commit -m "feat(marketplace): API vitrine produits (catégories, liste active, détail)"
```

---

### Task 4: Cart API

**Files:**
- Modify: `backend/app/api/v1/backoffice/shop.py`
- Test: `backend/scripts/verify_shop_cart_api.py`

**Interfaces (Produces):**
- `_get_or_create_cart()`.
- `GET /shop/cart` · `POST /shop/cart/items {product_id, quantity}` (merge if present) · `PUT /shop/cart/items/:id {quantity}` · `DELETE /shop/cart/items/:id`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_shop_cart_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User, Product

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    prod = Product.query.filter_by(is_active=True).first()
    c = app.test_client()
    h = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    # clear any existing cart items to start clean
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    for it in cart['items']:
        c.delete(f"/api/v1/backoffice/shop/cart/items/{it['id']}", headers=h)
    r = c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 2}, headers=h)
    check(r.status_code in (200, 201), "add to cart")
    # add same product again -> merged quantity
    c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 1}, headers=h)
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    line = next(x for x in cart['items'] if x['product_id'] == prod.id)
    check(line['quantity'] == 3, "quantities merged (2+1=3)")
    r = c.put(f"/api/v1/backoffice/shop/cart/items/{line['id']}", json={'quantity': 5}, headers=h)
    check(r.status_code == 200, "update quantity")
    r = c.delete(f"/api/v1/backoffice/shop/cart/items/{line['id']}", headers=h)
    check(r.status_code == 200, "remove item")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_shop_cart_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement cart routes**

Append to `backend/app/api/v1/backoffice/shop.py`:
```python
from app.models import Cart, CartItem


def _get_or_create_cart():
    cart = Cart.query.filter_by(user_id=g.current_user.id).first()
    if not cart:
        cart = Cart(user_id=g.current_user.id)
        db.session.add(cart)
        db.session.commit()
    return cart


def _cart_payload(cart):
    items = CartItem.query.filter_by(cart_id=cart.id).all()
    dicts = [i.to_dict() for i in items]
    return {'id': cart.id, 'items': dicts, 'total': round(sum(d['line_total'] for d in dicts), 2)}


@backoffice_bp.route('/shop/cart', methods=['GET'])
@require_auth
def get_cart():
    return jsonify({'cart': _cart_payload(_get_or_create_cart())})


@backoffice_bp.route('/shop/cart/items', methods=['POST'])
@require_auth
def add_cart_item():
    data = request.get_json(silent=True) or {}
    prod = Product.query.filter_by(id=data.get('product_id'), is_active=True).first()
    if not prod:
        return jsonify({'error': 'Produit invalide'}), 400
    qty = max(1, int(data.get('quantity') or 1))
    cart = _get_or_create_cart()
    item = CartItem.query.filter_by(cart_id=cart.id, product_id=prod.id).first()
    if item:
        item.quantity += qty
    else:
        item = CartItem(cart_id=cart.id, product_id=prod.id, quantity=qty)
        db.session.add(item)
    db.session.commit()
    return jsonify({'cart': _cart_payload(cart)}), 201


@backoffice_bp.route('/shop/cart/items/<int:item_id>', methods=['PUT'])
@require_auth
def update_cart_item(item_id):
    cart = _get_or_create_cart()
    item = CartItem.query.filter_by(id=item_id, cart_id=cart.id).first()
    if not item:
        return jsonify({'error': 'Article introuvable'}), 404
    qty = int((request.get_json(silent=True) or {}).get('quantity') or 1)
    if qty < 1:
        return jsonify({'error': 'Quantité invalide'}), 400
    item.quantity = qty
    db.session.commit()
    return jsonify({'cart': _cart_payload(cart)})


@backoffice_bp.route('/shop/cart/items/<int:item_id>', methods=['DELETE'])
@require_auth
def delete_cart_item(item_id):
    cart = _get_or_create_cart()
    item = CartItem.query.filter_by(id=item_id, cart_id=cart.id).first()
    if not item:
        return jsonify({'error': 'Article introuvable'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'cart': _cart_payload(cart)})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_shop_cart_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/shop.py backend/scripts/verify_shop_cart_api.py
git commit -m "feat(marketplace): API panier (ajout/fusion, modif, retrait) par acheteur"
```

---

### Task 5: Checkout / orders API + simulated payment (stock at payment)

**Files:**
- Modify: `backend/app/api/v1/backoffice/shop.py`
- Test: `backend/scripts/verify_shop_orders_api.py`

**Interfaces (Produces):**
- `POST /shop/orders {property_id?, delivery_address?}` (from cart; agency required)
- `POST /shop/orders/:id/pay` (mock, decrements stock)
- `GET /shop/orders?status=` · `GET /shop/orders/:id`

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_shop_orders_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Product, CartItem, Cart

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    u = User.query.filter(User.agency_id.isnot(None)).first()
    prod = Product.query.filter_by(is_active=True).filter(Product.stock >= 3).first()
    start_stock = prod.stock
    c = app.test_client()
    h = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    # empty cart checkout -> 400
    cart = c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']
    for it in cart['items']:
        c.delete(f"/api/v1/backoffice/shop/cart/items/{it['id']}", headers=h)
    check(c.post('/api/v1/backoffice/shop/orders', json={}, headers=h).status_code == 400, "empty cart checkout -> 400")
    # add + checkout
    c.post('/api/v1/backoffice/shop/cart/items', json={'product_id': prod.id, 'quantity': 3}, headers=h)
    r = c.post('/api/v1/backoffice/shop/orders', json={'delivery_address': 'Rue X, Casablanca'}, headers=h)
    check(r.status_code in (200, 201), "checkout creates order")
    oid = r.get_json()['order']['id']
    order = r.get_json()['order']
    check(order['status'] == 'pending' and order['items'][0]['product_name'] == prod.name, "order pending + snapshot")
    # cart cleared
    check(len(c.get('/api/v1/backoffice/shop/cart', headers=h).get_json()['cart']['items']) == 0, "cart cleared after checkout")
    # pay -> stock decremented
    r = c.post(f'/api/v1/backoffice/shop/orders/{oid}/pay', headers=h)
    check(r.status_code == 200 and r.get_json()['order']['status'] == 'paid', "pay -> paid")
    db.session.expire_all()
    check(Product.query.get(prod.id).stock == start_stock - 3, "stock decremented by 3 at payment")
    # re-pay -> 409
    check(c.post(f'/api/v1/backoffice/shop/orders/{oid}/pay', headers=h).status_code == 409, "re-pay -> 409")
    # snapshot: change product price, order total unchanged
    prod.price = float(prod.price) + 999; db.session.commit()
    o = c.get(f'/api/v1/backoffice/shop/orders/{oid}', headers=h).get_json()['order']
    check(o['total'] == order['total'], "order total unchanged after product price change")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_shop_orders_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement order routes**

Append to `backend/app/api/v1/backoffice/shop.py`:
```python
import secrets
from datetime import datetime
from app.models import Order, OrderItem, Property


def _require_agency():
    if not g.agency_id:
        return jsonify({'error': 'Un compte agence est requis pour commander.'}), 403
    return None


@backoffice_bp.route('/shop/orders', methods=['POST'])
@require_auth
def checkout():
    err = _require_agency()
    if err:
        return err
    cart = _get_or_create_cart()
    items = CartItem.query.filter_by(cart_id=cart.id).all()
    if not items:
        return jsonify({'error': 'Votre panier est vide.'}), 400
    # validate stock + active
    lines = []
    subtotal = 0.0
    for it in items:
        p = Product.query.get(it.product_id)
        if not p or not p.is_active:
            return jsonify({'error': 'Un produit du panier n\'est plus disponible.'}), 400
        if p.stock < it.quantity:
            return jsonify({'error': f'Stock insuffisant pour « {p.name} ».'}), 400
        line_total = float(p.price) * it.quantity
        subtotal += line_total
        lines.append((p, it.quantity, line_total))

    data = request.get_json(silent=True) or {}
    delivery = data.get('delivery_address')
    prop_id = None
    if data.get('property_id'):
        prop = Property.query.filter_by(id=data['property_id'], agency_id=g.agency_id).first()
        if not prop:
            return jsonify({'error': 'Bien de livraison invalide'}), 400
        prop_id = prop.id
        delivery = delivery or ', '.join(filter(None, [prop.address, prop.city]))

    order = Order(reference=f'CMD-{secrets.token_hex(3).upper()}', agency_id=g.agency_id,
                  buyer_id=g.current_user.id, property_id=prop_id, delivery_address=delivery,
                  status='pending', subtotal=round(subtotal, 2), total=round(subtotal, 2))
    db.session.add(order)
    db.session.flush()
    for p, qty, line_total in lines:
        db.session.add(OrderItem(order_id=order.id, product_id=p.id, product_name=p.name,
                                 unit_price=p.price, quantity=qty, line_total=round(line_total, 2)))
    # clear cart
    CartItem.query.filter_by(cart_id=cart.id).delete()
    db.session.commit()
    return jsonify({'order': order.to_dict(include_items=True)}), 201


@backoffice_bp.route('/shop/orders/<int:oid>/pay', methods=['POST'])
@require_auth
def pay_order(oid):
    err = _require_agency()
    if err:
        return err
    order = Order.query.filter_by(id=oid, agency_id=g.agency_id).first()
    if not order:
        return jsonify({'error': 'Commande introuvable'}), 404
    if order.status != 'pending':
        return jsonify({'error': 'Commande déjà réglée ou traitée.'}), 409
    # re-check stock, then decrement
    for it in OrderItem.query.filter_by(order_id=order.id).all():
        p = Product.query.get(it.product_id) if it.product_id else None
        if p and p.stock < it.quantity:
            return jsonify({'error': f'Stock insuffisant pour « {it.product_name} ».'}), 409
    for it in OrderItem.query.filter_by(order_id=order.id).all():
        p = Product.query.get(it.product_id) if it.product_id else None
        if p:
            p.stock = p.stock - it.quantity
    order.status = 'paid'
    order.paid_at = datetime.utcnow()
    order.payment_reference = f'PAY-{secrets.token_hex(4).upper()}'  # simulated gateway
    db.session.commit()
    return jsonify({'order': order.to_dict(include_items=True)})


@backoffice_bp.route('/shop/orders', methods=['GET'])
@require_auth
def list_orders():
    err = _require_agency()
    if err:
        return err
    q = Order.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(Order.status == request.args.get('status'))
    return jsonify({'orders': [o.to_dict() for o in q.order_by(Order.created_at.desc()).all()]})


@backoffice_bp.route('/shop/orders/<int:oid>', methods=['GET'])
@require_auth
def get_order(oid):
    err = _require_agency()
    if err:
        return err
    order = Order.query.filter_by(id=oid, agency_id=g.agency_id).first()
    if not order:
        return jsonify({'error': 'Commande introuvable'}), 404
    return jsonify({'order': order.to_dict(include_items=True)})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_shop_orders_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/backoffice/shop.py backend/scripts/verify_shop_orders_api.py
git commit -m "feat(marketplace): checkout + commandes + paiement simulé (stock décrémenté au paiement)"
```

---

### Task 6: Super-admin products CRUD API

**Files:**
- Create: `backend/app/api/v1/admin/shop.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Test: `backend/scripts/verify_admin_products_api.py`

**Interfaces (Produces):** `GET/POST /admin/products` · `PUT/DELETE /admin/products/:id` (super-admin; category validated, group derived).

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_products_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app.models import User

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    c = app.test_client()
    sa = {'Authorization': f'Bearer {login(c, "admin@semsarout.ma", "admin123")}'}
    # a normal agency user must be blocked
    u = User.query.filter(User.agency_id.isnot(None)).first()
    au = {'Authorization': f'Bearer {login(c, u.email, "password123")}'}
    check(c.post('/api/v1/admin/products', json={'category': 'lit', 'name': 'X', 'price': 1}, headers=au).status_code == 403, "agency user blocked -> 403")
    # invalid category
    check(c.post('/api/v1/admin/products', json={'category': 'nope', 'name': 'X', 'price': 1}, headers=sa).status_code == 400, "invalid category -> 400")
    # create (group derived)
    r = c.post('/api/v1/admin/products', json={'category': 'four', 'name': 'Four test', 'price': 2000, 'stock': 3}, headers=sa)
    check(r.status_code in (200, 201), "superadmin creates product")
    pid = r.get_json()['product']['id']
    check(r.get_json()['product']['group'] == 'appliance', "group derived from category")
    check(c.put(f'/api/v1/admin/products/{pid}', json={'stock': 10}, headers=sa).get_json()['product']['stock'] == 10, "update product")
    check(c.delete(f'/api/v1/admin/products/{pid}', headers=sa).status_code == 200, "delete product")

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_products_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement admin product routes**

Create `backend/app/api/v1/admin/shop.py`:
```python
from flask import jsonify, request, g
from app import db
from app.models import Product
from app.api.v1.admin import admin_bp, require_superadmin
from app.services.product_categories import is_valid_category, group_of

_FIELDS = ['name', 'description', 'price', 'stock', 'image_url', 'is_active']


@admin_bp.route('/products', methods=['GET'])
@require_superadmin
def admin_list_products():
    q = Product.query
    if request.args.get('group'):
        q = q.filter(Product.group == request.args.get('group'))
    if request.args.get('q'):
        q = q.filter(Product.name.ilike(f"%{request.args.get('q')}%"))
    return jsonify({'products': [p.to_dict() for p in q.order_by(Product.name).all()]})


@admin_bp.route('/products', methods=['POST'])
@require_superadmin
def admin_create_product():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom est requis'}), 400
    if not is_valid_category(data.get('category')):
        return jsonify({'error': 'Catégorie invalide'}), 400
    p = Product(category=data['category'], group=group_of(data['category']), created_by=g.current_user.id,
                **{k: data.get(k) for k in _FIELDS if k in data})
    db.session.add(p)
    db.session.commit()
    return jsonify({'product': p.to_dict()}), 201


@admin_bp.route('/products/<int:pid>', methods=['PUT'])
@require_superadmin
def admin_update_product(pid):
    p = Product.query.get(pid)
    if not p:
        return jsonify({'error': 'Produit introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'category' in data:
        if not is_valid_category(data['category']):
            return jsonify({'error': 'Catégorie invalide'}), 400
        p.category = data['category']
        p.group = group_of(data['category'])
    for k in _FIELDS:
        if k in data:
            setattr(p, k, data[k])
    db.session.commit()
    return jsonify({'product': p.to_dict()})


@admin_bp.route('/products/<int:pid>', methods=['DELETE'])
@require_superadmin
def admin_delete_product(pid):
    p = Product.query.get(pid)
    if not p:
        return jsonify({'error': 'Produit introuvable'}), 404
    db.session.delete(p)
    db.session.commit()
    return jsonify({'message': 'Produit supprimé'})
```
In `backend/app/api/v1/admin/__init__.py`, extend the import line to include `shop` (e.g. `..., artisans, shop`).

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_admin_products_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/admin/shop.py backend/app/api/v1/admin/__init__.py backend/scripts/verify_admin_products_api.py
git commit -m "feat(marketplace): API super-admin CRUD produits (catégorie validée, groupe dérivé)"
```

---

### Task 7: Super-admin orders API (list all + status)

**Files:**
- Modify: `backend/app/api/v1/admin/shop.py`
- Test: `backend/scripts/verify_admin_orders_api.py`

**Interfaces (Produces):** `GET /admin/orders?status=` (all) · `GET /admin/orders/:id` · `PUT /admin/orders/:id {status}`.

- [ ] **Step 1: Write the failing verification script**

Create `backend/scripts/verify_admin_orders_api.py`:
```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from seed import app
from app import db
from app.models import User, Agency, Order

FAILS = []
def check(c, m):
    print(("PASS" if c else "FAIL") + f": {m}")
    if not c: FAILS.append(m)
def login(c, e, p):
    r = c.post('/api/v1/auth/login', json={'email': e, 'password': p})
    return r.get_json().get('access_token') if r.status_code == 200 else None

with app.app_context():
    a = Agency.query.first()
    o = Order(reference='CMD-ADMIN1', agency_id=a.id, status='paid', subtotal=100, total=100)
    db.session.add(o); db.session.commit()
    c = app.test_client()
    sa = {'Authorization': f'Bearer {login(c, "admin@semsarout.ma", "admin123")}'}
    r = c.get('/api/v1/admin/orders', headers=sa)
    check(r.status_code == 200 and any(x['id'] == o.id for x in r.get_json()['orders']), "admin lists all orders")
    r = c.put(f'/api/v1/admin/orders/{o.id}', json={'status': 'shipped'}, headers=sa)
    check(r.status_code == 200 and r.get_json()['order']['status'] == 'shipped', "admin updates status")
    check(c.put(f'/api/v1/admin/orders/{o.id}', json={'status': 'nope'}, headers=sa).status_code == 400, "invalid status -> 400")
    db.session.delete(Order.query.get(o.id)); db.session.commit()

sys.exit(1 if FAILS else 0)
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd backend && source venv/bin/activate && python3 scripts/verify_admin_orders_api.py`
Expected: FAIL (404).

- [ ] **Step 3: Implement admin order routes**

Append to `backend/app/api/v1/admin/shop.py`:
```python
from app.models import Order

_ORDER_STATUSES = {'pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled'}


@admin_bp.route('/orders', methods=['GET'])
@require_superadmin
def admin_list_orders():
    q = Order.query
    if request.args.get('status'):
        q = q.filter(Order.status == request.args.get('status'))
    return jsonify({'orders': [o.to_dict() for o in q.order_by(Order.created_at.desc()).all()]})


@admin_bp.route('/orders/<int:oid>', methods=['GET'])
@require_superadmin
def admin_get_order(oid):
    o = Order.query.get(oid)
    if not o:
        return jsonify({'error': 'Commande introuvable'}), 404
    return jsonify({'order': o.to_dict(include_items=True)})


@admin_bp.route('/orders/<int:oid>', methods=['PUT'])
@require_superadmin
def admin_update_order(oid):
    o = Order.query.get(oid)
    if not o:
        return jsonify({'error': 'Commande introuvable'}), 404
    status = (request.get_json(silent=True) or {}).get('status')
    if status not in _ORDER_STATUSES:
        return jsonify({'error': 'Statut invalide'}), 400
    o.status = status
    db.session.commit()
    return jsonify({'order': o.to_dict(include_items=True)})
```

- [ ] **Step 4: Run — verify it passes**

Run: `python3 scripts/verify_admin_orders_api.py`
Expected: all PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/app/api/v1/admin/shop.py backend/scripts/verify_admin_orders_api.py
git commit -m "feat(marketplace): API super-admin commandes (liste globale + changement de statut)"
```

---

### Task 8: Frontend — shopService + Catalog + product detail

**Files:**
- Create: `frontend/src/services/shopService.js`, `frontend/src/pages/backoffice/shop/ShopCatalog.jsx`, `frontend/src/pages/backoffice/shop/ProductDetail.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/pages/backoffice/components/BackofficeLayout.jsx`
- Test: `cd frontend && npm run build`

**Interfaces (Produces):** `shopService` (categories, products, product, getCart, addToCart, updateCartItem, removeCartItem, checkout, payOrder, listOrders, getOrder, adminListProducts, adminCreateProduct, adminUpdateProduct, adminDeleteProduct, adminListOrders, adminGetOrder, adminUpdateOrder); a catalog + product detail page + `/backoffice/boutique` routes + menu.

- [ ] **Step 1: Service**

Create `frontend/src/services/shopService.js`:
```javascript
import api from './api'

export const shopService = {
  categories: async () => (await api.get('/backoffice/shop/categories')).data,
  products: async (params = {}) => (await api.get('/backoffice/shop/products', { params })).data,
  product: async (id) => (await api.get(`/backoffice/shop/products/${id}`)).data,
  getCart: async () => (await api.get('/backoffice/shop/cart')).data,
  addToCart: async (product_id, quantity = 1) => (await api.post('/backoffice/shop/cart/items', { product_id, quantity })).data,
  updateCartItem: async (id, quantity) => (await api.put(`/backoffice/shop/cart/items/${id}`, { quantity })).data,
  removeCartItem: async (id) => (await api.delete(`/backoffice/shop/cart/items/${id}`)).data,
  checkout: async (data) => (await api.post('/backoffice/shop/orders', data)).data,
  payOrder: async (id) => (await api.post(`/backoffice/shop/orders/${id}/pay`)).data,
  listOrders: async (params = {}) => (await api.get('/backoffice/shop/orders', { params })).data,
  getOrder: async (id) => (await api.get(`/backoffice/shop/orders/${id}`)).data,
  adminListProducts: async (params = {}) => (await api.get('/admin/products', { params })).data,
  adminCreateProduct: async (data) => (await api.post('/admin/products', data)).data,
  adminUpdateProduct: async (id, data) => (await api.put(`/admin/products/${id}`, data)).data,
  adminDeleteProduct: async (id) => (await api.delete(`/admin/products/${id}`)).data,
  adminListOrders: async (params = {}) => (await api.get('/admin/orders', { params })).data,
  adminGetOrder: async (id) => (await api.get(`/admin/orders/${id}`)).data,
  adminUpdateOrder: async (id, status) => (await api.put(`/admin/orders/${id}`, { status })).data,
}
```

- [ ] **Step 2: Catalog page**

Create `frontend/src/pages/backoffice/shop/ShopCatalog.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiShoppingCart } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'

function ShopCatalog() {
  const qc = useQueryClient()
  const [filter, setFilter] = useState({ group: '', category: '', q: '' })
  const { data: catData } = useQuery('shop-categories', () => shopService.categories(), { staleTime: 3600000 })
  const { data, isLoading } = useQuery(['shop-products', filter], () => shopService.products(filter), { keepPreviousData: true })
  const { data: cartData } = useQuery('shop-cart', () => shopService.getCart())
  const cats = catData?.categories || []
  const cartCount = (cartData?.cart?.items || []).reduce((s, i) => s + i.quantity, 0)

  const add = useMutation((id) => shopService.addToCart(id, 1), {
    onSuccess: () => { toast.success('Ajouté au panier'); qc.invalidateQueries('shop-cart') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })

  const products = data?.products || []
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Boutique</h1>
        <Link to="/backoffice/panier" className="relative btn-secondary inline-flex items-center gap-2">
          <FiShoppingCart /> Panier
          {cartCount > 0 && <span className="absolute -top-2 -right-2 bg-primary-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{cartCount}</span>}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={filter.group} onChange={(e) => setFilter({ ...filter, group: e.target.value, category: '' })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="">Tous groupes</option><option value="furniture">Meubles</option><option value="appliance">Électroménager</option>
        </select>
        <select value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="">Toutes catégories</option>
          {cats.filter((c) => !filter.group || c.group === filter.group).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Rechercher…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 flex-1 min-w-[160px]" />
      </div>
      {isLoading ? <p>Chargement…</p> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
              <Link to={`/backoffice/boutique/${p.id}`} className="block h-36 bg-gray-100">
                {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-4xl">🛋️</div>}
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <Link to={`/backoffice/boutique/${p.id}`} className="font-medium text-gray-900 text-sm line-clamp-2">{p.name}</Link>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="font-bold text-gray-900">{p.price} MAD</span>
                  <button onClick={() => add.mutate(p.id)} disabled={p.stock < 1} className="btn-primary text-xs disabled:opacity-40">{p.stock < 1 ? 'Rupture' : 'Ajouter'}</button>
                </div>
              </div>
            </div>
          ))}
          {products.length === 0 && <p className="col-span-full text-center text-gray-400 py-8">Aucun produit.</p>}
        </div>
      )}
    </div>
  )
}
export default ShopCatalog
```

- [ ] **Step 3: Product detail**

Create `frontend/src/pages/backoffice/shop/ProductDetail.jsx`:
```javascript
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { shopService } from '../../../services/shopService'

function ProductDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['shop-product', id], () => shopService.product(id))
  const [qty, setQty] = useState(1)
  const add = useMutation(() => shopService.addToCart(Number(id), qty), {
    onSuccess: () => { toast.success('Ajouté au panier'); qc.invalidateQueries('shop-cart') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading) return <div className="p-8">Chargement…</div>
  if (isError || !data?.product) return <div className="p-8 text-center text-gray-500">Produit introuvable. <Link to="/backoffice/boutique" className="text-primary-600 underline">Retour</Link></div>
  const p = data.product
  return (
    <div className="p-6 max-w-3xl grid md:grid-cols-2 gap-6">
      <div className="h-64 bg-gray-100 rounded-xl overflow-hidden">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-6xl">🛋️</div>}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{p.name}</h1>
        <p className="text-xl font-bold text-primary-600 mt-2">{p.price} MAD</p>
        <p className="text-sm text-gray-500 mt-1">Stock : {p.stock}</p>
        <p className="text-gray-700 mt-4 whitespace-pre-line">{p.description}</p>
        <div className="flex items-center gap-3 mt-6">
          <input type="number" min="1" max={p.stock} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />
          <button onClick={() => add.mutate()} disabled={p.stock < 1} className="btn-primary disabled:opacity-40">Ajouter au panier</button>
        </div>
      </div>
    </div>
  )
}
export default ProductDetail
```

- [ ] **Step 4: Routes + menu**

In `frontend/src/App.jsx`, import both and add inside the `/backoffice` group:
```javascript
          <Route path="boutique" element={<ShopCatalog />} />
          <Route path="boutique/:id" element={<ProductDetail />} />
```
In `BackofficeLayout.jsx`, add a "Boutique" nav item (icon `FiShoppingBag`, path `/backoffice/boutique`).

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/services/shopService.js frontend/src/pages/backoffice/shop/ShopCatalog.jsx frontend/src/pages/backoffice/shop/ProductDetail.jsx frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(marketplace): service + catalogue boutique + fiche produit + route/menu"
```

---

### Task 9: Frontend — Cart + checkout

**Files:**
- Create: `frontend/src/pages/backoffice/shop/Cart.jsx`
- Modify: `frontend/src/App.jsx` (route)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Cart + checkout page**

Create `frontend/src/pages/backoffice/shop/Cart.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { FiTrash2 } from 'react-icons/fi'
import { shopService } from '../../../services/shopService'
import api from '../../../services/api'

function Cart() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery('shop-cart', () => shopService.getCart())
  const { data: propsData } = useQuery('bo-properties-shop', async () => (await api.get('/backoffice/properties?per_page=100')).data)
  const [propertyId, setPropertyId] = useState('')
  const [address, setAddress] = useState('')

  const refresh = () => qc.invalidateQueries('shop-cart')
  const onErr = (e) => toast.error(e.response?.data?.error || 'Erreur')
  const upd = useMutation(({ id, quantity }) => shopService.updateCartItem(id, quantity), { onSuccess: refresh, onError: onErr })
  const rm = useMutation((id) => shopService.removeCartItem(id), { onSuccess: refresh, onError: onErr })
  const order = useMutation(() => shopService.checkout({ property_id: propertyId ? Number(propertyId) : undefined, delivery_address: address || undefined }), {
    onSuccess: (res) => { toast.success('Commande créée'); qc.invalidateQueries('shop-cart'); navigate(`/backoffice/mes-commandes/${res.order.id}`) },
    onError: onErr,
  })

  if (isLoading) return <div className="p-8">Chargement…</div>
  const cart = data?.cart || { items: [], total: 0 }
  const properties = propsData?.properties || []
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Mon panier</h1>
      {cart.items.length === 0 ? <p className="text-gray-400">Votre panier est vide.</p> : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-5">
            {cart.items.map((it) => (
              <div key={it.id} className="flex items-center gap-4 p-3">
                <div className="flex-1"><div className="font-medium text-gray-900">{it.product?.name || '—'}</div><div className="text-sm text-gray-500">{it.product?.price} MAD</div></div>
                <input type="number" min="1" value={it.quantity} onChange={(e) => upd.mutate({ id: it.id, quantity: Math.max(1, Number(e.target.value)) })} className="w-16 border border-gray-300 rounded px-2 py-1 text-gray-900" />
                <div className="w-24 text-right font-medium">{it.line_total} MAD</div>
                <button onClick={() => rm.mutate(it.id)} className="text-red-600"><FiTrash2 /></button>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{cart.total} MAD</span></div>
            <label className="block text-sm">Livrer vers un bien (optionnel)
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900">
                <option value="">— Adresse libre —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title || p.reference}</option>)}
              </select>
            </label>
            {!propertyId && <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse de livraison" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900" />}
            <button onClick={() => order.mutate()} className="btn-primary w-full">Commander</button>
          </div>
        </>
      )}
    </div>
  )
}
export default Cart
```
Note: confirm the backoffice properties list endpoint/shape (`/backoffice/properties` → `{properties}`) as used in Brick 4; adjust if different.

- [ ] **Step 2: Route**

In `frontend/src/App.jsx`, import `Cart` and add inside `/backoffice`:
```javascript
          <Route path="panier" element={<Cart />} />
```

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/backoffice/shop/Cart.jsx frontend/src/App.jsx
git commit -m "feat(marketplace): panier + checkout (livraison bien/adresse)"
```

---

### Task 10: Frontend — My orders (list + detail + pay)

**Files:**
- Create: `frontend/src/pages/backoffice/shop/OrdersList.jsx`, `frontend/src/pages/backoffice/shop/OrderDetail.jsx`
- Modify: `frontend/src/App.jsx` (routes), `frontend/src/pages/backoffice/components/BackofficeLayout.jsx` (menu)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Orders list**

Create `frontend/src/pages/backoffice/shop/OrdersList.jsx`:
```javascript
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { shopService } from '../../../services/shopService'

const STATUS = { pending: ['En attente', 'bg-gray-100 text-gray-700'], paid: ['Payée', 'bg-blue-100 text-blue-700'],
  preparing: ['Préparation', 'bg-amber-100 text-amber-700'], shipped: ['Expédiée', 'bg-indigo-100 text-indigo-700'],
  delivered: ['Livrée', 'bg-green-100 text-green-700'], cancelled: ['Annulée', 'bg-red-100 text-red-700'] }

function OrdersList() {
  const { data, isLoading } = useQuery('shop-orders', () => shopService.listOrders())
  if (isLoading) return <div className="p-8">Chargement…</div>
  const orders = data?.orders || []
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-5">Mes commandes</h1>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500"><tr>
            <th className="px-4 py-3">Référence</th><th>Articles</th><th>Total</th><th>Statut</th><th>Date</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="px-4 py-3"><Link className="text-primary-600 font-medium" to={`/backoffice/mes-commandes/${o.id}`}>{o.reference}</Link></td>
                <td>{o.items_count}</td><td>{o.total} MAD</td>
                <td><span className={`text-xs px-2 py-1 rounded-full ${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0] || o.status}</span></td>
                <td>{o.created_at ? new Date(o.created_at).toLocaleDateString('fr-FR') : ''}</td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">Aucune commande.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default OrdersList
```

- [ ] **Step 2: Order detail (with pay)**

Create `frontend/src/pages/backoffice/shop/OrderDetail.jsx`:
```javascript
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { shopService } from '../../../services/shopService'

const STATUS = { pending: 'En attente', paid: 'Payée', preparing: 'Préparation', shipped: 'Expédiée', delivered: 'Livrée', cancelled: 'Annulée' }

function OrderDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useQuery(['shop-order', id], () => shopService.getOrder(id))
  const pay = useMutation(() => shopService.payOrder(id), {
    onSuccess: () => { toast.success('Paiement effectué'); qc.invalidateQueries(['shop-order', id]) },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading) return <div className="p-8">Chargement…</div>
  if (isError || !data?.order) return <div className="p-8 text-center text-gray-500">Commande introuvable. <Link to="/backoffice/mes-commandes" className="text-primary-600 underline">Retour</Link></div>
  const o = data.order
  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{o.reference}</h1>
        <span className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-700">{STATUS[o.status] || o.status}</span>
      </div>
      {o.delivery_address && <p className="text-sm text-gray-500 mb-4">Livraison : {o.delivery_address}</p>}
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-4">
        {(o.items || []).map((it) => (
          <div key={it.id} className="flex justify-between p-3 text-sm">
            <span>{it.product_name} × {it.quantity}</span><span className="font-medium">{it.line_total} MAD</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between font-bold text-lg mb-4"><span>Total</span><span>{o.total} MAD</span></div>
      {o.status === 'pending' && <button onClick={() => pay.mutate()} className="btn-primary w-full">Payer maintenant</button>}
      {o.payment_reference && <p className="text-xs text-gray-400 mt-3">Réf. paiement : {o.payment_reference}</p>}
    </div>
  )
}
export default OrderDetail
```

- [ ] **Step 3: Routes + menu**

In `frontend/src/App.jsx`, import both and add inside `/backoffice`:
```javascript
          <Route path="mes-commandes" element={<OrdersList />} />
          <Route path="mes-commandes/:id" element={<OrderDetail />} />
```
In `BackofficeLayout.jsx`, add a "Mes commandes" nav item (icon `FiPackage`, path `/backoffice/mes-commandes`).

- [ ] **Step 4: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/pages/backoffice/shop/OrdersList.jsx frontend/src/pages/backoffice/shop/OrderDetail.jsx frontend/src/App.jsx frontend/src/pages/backoffice/components/BackofficeLayout.jsx
git commit -m "feat(marketplace): mes commandes (liste + détail + paiement simulé)"
```

---

### Task 11: Frontend — super-admin products management

**Files:**
- Create: `frontend/src/pages/admin/AdminProducts.jsx`
- Modify: `frontend/src/App.jsx` (route), `frontend/src/pages/admin/AdminLayout.jsx` (nav)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Admin products page**

Create `frontend/src/pages/admin/AdminProducts.jsx`:
```javascript
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { FiTrash2 } from 'react-icons/fi'
import { shopService } from '../../services/shopService'

const CATS = [['lit', 'Lit'], ['canape', 'Canapé'], ['table', 'Table'], ['armoire', 'Armoire'], ['chaise', 'Chaise'], ['bureau', 'Bureau'],
  ['refrigerateur', 'Réfrigérateur'], ['lave_linge', 'Lave-linge'], ['four', 'Four'], ['micro_ondes', 'Micro-ondes'], ['climatiseur', 'Climatiseur'], ['television', 'Télévision']]
const EMPTY = { category: 'lit', name: '', price: '', stock: '', image_url: '', description: '' }

function AdminProducts() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('admin-products', () => shopService.adminListProducts())
  const [form, setForm] = useState(EMPTY)
  const create = useMutation(() => shopService.adminCreateProduct({ ...form, price: Number(form.price) || 0, stock: Number(form.stock) || 0 }), {
    onSuccess: () => { toast.success('Produit ajouté'); setForm(EMPTY); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const del = useMutation((id) => shopService.adminDeleteProduct(id), {
    onSuccess: () => { toast.success('Supprimé'); qc.invalidateQueries('admin-products') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  const toggle = useMutation(({ id, is_active }) => shopService.adminUpdateProduct(id, { is_active }), { onSuccess: () => qc.invalidateQueries('admin-products') })

  if (isLoading) return <div>Chargement…</div>
  const products = data?.products || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Catalogue produits</h1>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Nom</th><th>Prix</th><th>Stock</th><th>Actif</th><th></th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium">{p.name}</td><td>{p.price} MAD</td><td>{p.stock}</td>
                  <td><input type="checkbox" checked={p.is_active} onChange={(e) => toggle.mutate({ id: p.id, is_active: e.target.checked })} /></td>
                  <td className="text-right"><button onClick={() => del.mutate(p.id)} className="text-red-600"><FiTrash2 /></button></td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">Aucun produit.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 h-fit">
          <h2 className="font-semibold text-midnight mb-3">Ajouter un produit</h2>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900">
            {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {[['name', 'Nom *'], ['price', 'Prix (MAD)'], ['stock', 'Stock'], ['image_url', "URL image"]].map(([f, ph]) => (
            <input key={f} value={form[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} placeholder={ph} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          ))}
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows="2" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-2 text-slate-900" />
          <button disabled={!form.name} onClick={() => create.mutate()} className="w-full px-4 py-2 rounded-lg bg-midnight text-ivory text-sm disabled:opacity-50">Ajouter</button>
        </div>
      </div>
    </div>
  )
}
export default AdminProducts
```

- [ ] **Step 2: Route + nav**

In `frontend/src/App.jsx`, import `AdminProducts` and add inside the `/admin` `AdminLayout` group:
```javascript
          <Route path="produits" element={<AdminProducts />} />
```
In `AdminLayout.jsx`, add a sidebar NavLink to `/admin/produits` labelled "Produits" (icon `FiShoppingBag`).

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/admin/AdminProducts.jsx frontend/src/App.jsx frontend/src/pages/admin/AdminLayout.jsx
git commit -m "feat(marketplace): page super-admin de gestion du catalogue produits"
```

---

### Task 12: Frontend — super-admin orders management

**Files:**
- Create: `frontend/src/pages/admin/AdminOrders.jsx`
- Modify: `frontend/src/App.jsx` (route), `frontend/src/pages/admin/AdminLayout.jsx` (nav)
- Test: `cd frontend && npm run build`

- [ ] **Step 1: Admin orders page**

Create `frontend/src/pages/admin/AdminOrders.jsx`:
```javascript
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { toast } from 'react-toastify'
import { shopService } from '../../services/shopService'

const STATUSES = ['pending', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled']

function AdminOrders() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery('admin-orders', () => shopService.adminListOrders())
  const upd = useMutation(({ id, status }) => shopService.adminUpdateOrder(id, status), {
    onSuccess: () => { toast.success('Statut mis à jour'); qc.invalidateQueries('admin-orders') },
    onError: (e) => toast.error(e.response?.data?.error || 'Erreur'),
  })
  if (isLoading) return <div>Chargement…</div>
  const orders = data?.orders || []
  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight mb-6">Commandes</h1>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500"><tr><th className="px-4 py-3">Référence</th><th>Agence</th><th>Total</th><th>Statut</th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{o.reference}</td><td>{o.agency_id}</td><td>{o.total} MAD</td>
                <td>
                  <select value={o.status} onChange={(e) => upd.mutate({ id: o.id, status: e.target.value })} className="border border-slate-300 rounded px-2 py-1 text-slate-900">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400">Aucune commande.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
export default AdminOrders
```

- [ ] **Step 2: Route + nav**

In `frontend/src/App.jsx`, import `AdminOrders` and add inside the `/admin` group:
```javascript
          <Route path="commandes" element={<AdminOrders />} />
```
In `AdminLayout.jsx`, add a sidebar NavLink to `/admin/commandes` labelled "Commandes" (icon `FiPackage`).

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `✓ built`.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/admin/AdminOrders.jsx frontend/src/App.jsx frontend/src/pages/admin/AdminLayout.jsx
git commit -m "feat(marketplace): page super-admin de gestion des commandes"
```

---

### Task 13: Integration verification + build

**Files:**
- Create: `backend/scripts/verify_shop_all.py`
- Test: this task is the gate.

- [ ] **Step 1: Aggregate runner**

Create `backend/scripts/verify_shop_all.py`:
```python
"""python3 scripts/verify_shop_all.py"""
import subprocess, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ['verify_shop_models.py', 'verify_shop_seed.py', 'verify_shop_products_api.py',
           'verify_shop_cart_api.py', 'verify_shop_orders_api.py', 'verify_admin_products_api.py',
           'verify_admin_orders_api.py']
failed = []
for s in SCRIPTS:
    print(f"\n=== {s} ===")
    if subprocess.run([sys.executable, os.path.join(HERE, s)]).returncode != 0:
        failed.append(s)
print("\n==== SUMMARY ====")
print("FAILED: " + ", ".join(failed) if failed else "ALL PASS")
sys.exit(1 if failed else 0)
```

- [ ] **Step 2: Clean re-seed + run suite**

Run: `cd backend && source venv/bin/activate && python3 seed.py && python3 seed_backoffice.py && python3 scripts/verify_shop_all.py`
Expected: `ALL PASS`. (If `seed.py` errors on a non-empty DB from the known pre-existing `clear_data` bug, reset schema drop/create + `flask db upgrade` + reseed — do NOT modify seed.py. If a script reveals a real bug, fix it; don't paper over.)

- [ ] **Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: `✓ built`, no errors.

- [ ] **Step 4: Manual UI smoke test (deferred to user)**

As an agency admin: `/backoffice/boutique` → browse, add to cart (badge updates) → `/backoffice/panier` → set delivery + Commander → order detail → Payer → status "Payée". `/backoffice/mes-commandes` lists it. As super-admin: `/admin/produits` add a product (appears in the catalog), `/admin/commandes` advance the order to "Expédiée". Confirm stock decremented after payment.

- [ ] **Step 5: Commit**
```bash
git add backend/scripts/verify_shop_all.py
git commit -m "test(marketplace): runner de vérification agrégé marketplace"
```

---

## Self-Review notes (coverage vs spec)

- §4 models + migration → Task 1. §3 categories + §8 seed → Task 2. §6.1 storefront: products → Task 3, cart → Task 4, checkout/orders/pay → Task 5. §6.2 super-admin: products → Task 6, orders → Task 7. §7.1 front boutique → Tasks 8 (catalog+detail) + 9 (cart+checkout) + 10 (orders+pay). §7.2 front super-admin → Tasks 11 (products) + 12 (orders). §9 tests → each task + Task 13.
- Type consistency: `shopService` methods ↔ backend routes; envelopes `{categories}`/`{products}`/`{product}`/`{cart}`/`{order}`/`{orders}` consumed by the pages; `is_active` drives catalog visibility; `status` values consistent front↔back; order `items`/`items_count` from `include_items`.
- Security: storefront `require_auth`; cart user-scoped; orders agency-scoped (`_require_agency` 403 without agency); catalog CRUD + all-orders behind `require_superadmin`; product `category` validated (400) both create/update; order `status` validated against the enum (400). Stock never goes negative (checked at checkout AND re-checked at payment → 409). Snapshots protect historical totals.
- Known MVP simplifications: payment is the app's existing simulated pattern (no real Stripe); `total == subtotal` (no tax/shipping line); the Cart delivery property picker relies on the `/backoffice/properties` list endpoint (Task 9 note: verify shape); admin pages hardcode the category/status lists (small, mirror backend constants).
- Verify scripts assume agency-member seed password `password123`, super-admin `admin@semsarout.ma`/`admin123`, and seeded active products (Task 2).
```
