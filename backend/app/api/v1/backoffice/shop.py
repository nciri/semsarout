import secrets
from datetime import datetime
from flask import jsonify, request, g
from app import db
from app.models import Product, Agency, Cart, CartItem, Order, OrderItem, Property
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
    data = request.get_json(silent=True) or {}
    raw = data.get('quantity')
    try:
        qty = int(raw)
    except (TypeError, ValueError):
        return jsonify({'error': 'Quantité invalide'}), 400
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
