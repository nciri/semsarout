from flask import jsonify, request, g
from app import db
from app.models import Product, Agency, Cart, CartItem
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
