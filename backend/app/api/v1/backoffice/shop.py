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
