from flask import jsonify, request, g
from app import db
from app.models import Artisan
from app.api.v1.admin import admin_bp, require_superadmin
from app.services.artisan_trades import is_valid_trade

_FIELDS = ['trade', 'name', 'company', 'city', 'phone', 'email', 'notes']


@admin_bp.route('/shared-artisans', methods=['GET'])
@require_superadmin
def list_shared_artisans():
    q = Artisan.query.filter(Artisan.agency_id.is_(None))
    if request.args.get('trade'):
        q = q.filter(Artisan.trade == request.args.get('trade'))
    if request.args.get('q'):
        term = f"%{request.args.get('q')}%"
        q = q.filter((Artisan.name.ilike(term)) | (Artisan.company.ilike(term)))
    return jsonify({'artisans': [a.to_dict() for a in q.order_by(Artisan.name).all()]})


@admin_bp.route('/shared-artisans', methods=['POST'])
@require_superadmin
def create_shared_artisan():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom est requis'}), 400
    if not is_valid_trade(data.get('trade')):
        return jsonify({'error': 'Métier invalide'}), 400
    a = Artisan(agency_id=None, created_by=g.current_user.id, **{k: data.get(k) for k in _FIELDS})
    db.session.add(a)
    db.session.commit()
    return jsonify({'artisan': a.to_dict()}), 201


@admin_bp.route('/shared-artisans/<int:aid>', methods=['PUT'])
@require_superadmin
def update_shared_artisan(aid):
    a = Artisan.query.filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if not a:
        return jsonify({'error': 'Artisan partagé introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'trade' in data and not is_valid_trade(data['trade']):
        return jsonify({'error': 'Métier invalide'}), 400
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.session.commit()
    return jsonify({'artisan': a.to_dict()})


@admin_bp.route('/shared-artisans/<int:aid>', methods=['DELETE'])
@require_superadmin
def delete_shared_artisan(aid):
    a = Artisan.query.filter(Artisan.id == aid, Artisan.agency_id.is_(None)).first()
    if not a:
        return jsonify({'error': 'Artisan partagé introuvable'}), 404
    db.session.delete(a)
    db.session.commit()
    return jsonify({'message': 'Artisan supprimé'})
