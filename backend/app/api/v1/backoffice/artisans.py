from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, Artisan
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.artisan_trades import ARTISAN_TRADES, is_valid_trade


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first() if agency else None
    return sub.plan if sub else None


def require_artisans(f):
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        agency = _agency()
        plan = _plan(agency)
        if not agency or not plan or not plan.has_artisans:
            return jsonify({'error': "Fonction réservée aux plans Pro et Entreprise."}), 403
        return f(*args, **kwargs)
    return decorated


_FIELDS = ['trade', 'name', 'company', 'city', 'phone', 'email', 'notes']


@backoffice_bp.route('/artisan-trades', methods=['GET'])
@require_artisans
def list_trades():
    return jsonify({'trades': ARTISAN_TRADES})


@backoffice_bp.route('/artisans', methods=['GET'])
@require_artisans
def list_artisans():
    q = Artisan.query.filter((Artisan.agency_id.is_(None)) | (Artisan.agency_id == g.agency_id))
    if request.args.get('trade'):
        q = q.filter(Artisan.trade == request.args.get('trade'))
    if request.args.get('city'):
        q = q.filter(Artisan.city.ilike(f"%{request.args.get('city')}%"))
    if request.args.get('q'):
        term = f"%{request.args.get('q')}%"
        q = q.filter((Artisan.name.ilike(term)) | (Artisan.company.ilike(term)))
    rows = q.order_by(Artisan.name).all()
    return jsonify({'artisans': [a.to_dict() for a in rows]})


@backoffice_bp.route('/artisans', methods=['POST'])
@require_artisans
def create_artisan():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom est requis'}), 400
    if not is_valid_trade(data.get('trade')):
        return jsonify({'error': 'Métier invalide'}), 400
    a = Artisan(agency_id=g.agency_id, created_by=g.current_user.id, **{k: data.get(k) for k in _FIELDS})
    db.session.add(a)
    db.session.commit()
    return jsonify({'artisan': a.to_dict()}), 201


@backoffice_bp.route('/artisans/<int:aid>', methods=['PUT'])
@require_artisans
def update_artisan(aid):
    a = Artisan.query.filter_by(id=aid, agency_id=g.agency_id).first()
    if not a:
        return jsonify({'error': 'Artisan introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'trade' in data and not is_valid_trade(data['trade']):
        return jsonify({'error': 'Métier invalide'}), 400
    for k in _FIELDS:
        if k in data:
            setattr(a, k, data[k])
    db.session.commit()
    return jsonify({'artisan': a.to_dict()})


@backoffice_bp.route('/artisans/<int:aid>', methods=['DELETE'])
@require_artisans
def delete_artisan(aid):
    a = Artisan.query.filter_by(id=aid, agency_id=g.agency_id).first()
    if not a:
        return jsonify({'error': 'Artisan introuvable'}), 404
    db.session.delete(a)
    db.session.commit()
    return jsonify({'message': 'Artisan supprimé'})
