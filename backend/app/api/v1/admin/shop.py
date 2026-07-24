from flask import jsonify, request, g
from app import db
from app.models import Product, CartItem, OrderItem
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
    # OrderItem/CartItem.product_id FKs have no ondelete cascade: clear references
    # before deleting so we don't hit an IntegrityError. OrderItem keeps its
    # product_name/unit_price/line_total snapshot, so order history is preserved.
    OrderItem.query.filter_by(product_id=p.id).update({'product_id': None})
    CartItem.query.filter_by(product_id=p.id).delete()
    db.session.delete(p)
    db.session.commit()
    return jsonify({'message': 'Produit supprimé'})
