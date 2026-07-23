from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, Notary
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first() if agency else None
    return sub.plan if sub else None


def require_legal(f):
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        agency = _agency()
        plan = _plan(agency)
        if not agency or not plan or not plan.has_legal:
            return jsonify({'error': "Fonction réservée aux plans Pro et Entreprise."}), 403
        return f(*args, **kwargs)
    return decorated


_NOTARY_FIELDS = ['name', 'office', 'city', 'phone', 'email', 'license_number', 'notes']


@backoffice_bp.route('/notaries', methods=['GET'])
@require_legal
def list_notaries():
    rows = Notary.query.filter_by(agency_id=g.agency_id).order_by(Notary.name).all()
    return jsonify({'notaries': [n.to_dict() for n in rows]})


@backoffice_bp.route('/notaries', methods=['POST'])
@require_legal
def create_notary():
    data = request.get_json(silent=True) or {}
    if not data.get('name'):
        return jsonify({'error': 'Le nom est requis'}), 400
    n = Notary(agency_id=g.agency_id, **{k: data.get(k) for k in _NOTARY_FIELDS})
    db.session.add(n)
    db.session.commit()
    return jsonify({'notary': n.to_dict()}), 201


@backoffice_bp.route('/notaries/<int:nid>', methods=['PUT'])
@require_legal
def update_notary(nid):
    n = Notary.query.filter_by(id=nid, agency_id=g.agency_id).first()
    if not n:
        return jsonify({'error': 'Notaire introuvable'}), 404
    data = request.get_json(silent=True) or {}
    for k in _NOTARY_FIELDS:
        if k in data:
            setattr(n, k, data[k])
    db.session.commit()
    return jsonify({'notary': n.to_dict()})


@backoffice_bp.route('/notaries/<int:nid>', methods=['DELETE'])
@require_legal
def delete_notary(nid):
    n = Notary.query.filter_by(id=nid, agency_id=g.agency_id).first()
    if not n:
        return jsonify({'error': 'Notaire introuvable'}), 404
    db.session.delete(n)
    db.session.commit()
    return jsonify({'message': 'Notaire supprimé'})
