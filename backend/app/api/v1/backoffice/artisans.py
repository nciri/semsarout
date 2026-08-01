from functools import wraps
from datetime import datetime
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, Artisan, WorkOrder, Property
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


def _accessible_artisan(aid):
    """Artisan usable by this agency: shared (agency_id None) or own. Else None."""
    if not aid:
        return None
    return Artisan.query.filter(Artisan.id == aid,
                                (Artisan.agency_id.is_(None)) | (Artisan.agency_id == g.agency_id)).first()


def _parse_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def _get_wo(wid):
    return WorkOrder.query.filter_by(id=wid, agency_id=g.agency_id).first()


def _validate_links(data):
    """Return (error_response|None). Validates artisan_id + property_id if present."""
    if data.get('artisan_id') and not _accessible_artisan(data['artisan_id']):
        return jsonify({'error': 'Artisan inaccessible'}), 400
    if data.get('property_id') and not Property.query.filter_by(id=data['property_id'], agency_id=g.agency_id).first():
        return jsonify({'error': 'Bien invalide'}), 400
    return None


@backoffice_bp.route('/work-orders', methods=['GET'])
@require_artisans
def list_work_orders():
    q = WorkOrder.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(WorkOrder.status == request.args.get('status'))
    if request.args.get('property_id', type=int):
        q = q.filter(WorkOrder.property_id == request.args.get('property_id', type=int))
    rows = q.order_by(WorkOrder.created_at.desc()).all()
    return jsonify({'work_orders': [w.to_dict() for w in rows]})


@backoffice_bp.route('/work-orders', methods=['POST'])
@require_artisans
def create_work_order():
    data = request.get_json(silent=True) or {}
    if not data.get('title'):
        return jsonify({'error': 'Le titre est requis'}), 400
    if not is_valid_trade(data.get('trade')):
        return jsonify({'error': 'Métier invalide'}), 400
    err = _validate_links(data)
    if err:
        return err
    wo = WorkOrder(agency_id=g.agency_id, title=data['title'], trade=data['trade'], status='requested',
                   artisan_id=data.get('artisan_id'), property_id=data.get('property_id'),
                   cost_estimate=data.get('cost_estimate'), notes=data.get('notes'),
                   scheduled_date=_parse_dt(data.get('scheduled_date')), created_by=g.current_user.id)
    db.session.add(wo)
    db.session.commit()
    return jsonify({'work_order': wo.to_dict()}), 201


@backoffice_bp.route('/work-orders/<int:wid>', methods=['GET'])
@require_artisans
def get_work_order(wid):
    wo = _get_wo(wid)
    if not wo:
        return jsonify({'error': 'Bon de travaux introuvable'}), 404
    return jsonify({'work_order': wo.to_dict()})


@backoffice_bp.route('/work-orders/<int:wid>', methods=['PUT'])
@require_artisans
def update_work_order(wid):
    wo = _get_wo(wid)
    if not wo:
        return jsonify({'error': 'Bon de travaux introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'trade' in data and not is_valid_trade(data['trade']):
        return jsonify({'error': 'Métier invalide'}), 400
    err = _validate_links(data)
    if err:
        return err
    for k in ('title', 'notes', 'cost_estimate', 'cost_final'):
        if k in data:
            setattr(wo, k, data[k])
    if 'trade' in data:
        wo.trade = data['trade']
    if 'artisan_id' in data:
        wo.artisan_id = data['artisan_id']
    if 'property_id' in data:
        wo.property_id = data['property_id']
    if 'scheduled_date' in data:
        wo.scheduled_date = _parse_dt(data['scheduled_date'])
    if 'status' in data:
        wo.status = data['status']
        wo.completed_at = datetime.utcnow() if data['status'] == 'done' else None
    db.session.commit()
    return jsonify({'work_order': wo.to_dict()})


@backoffice_bp.route('/work-orders/<int:wid>', methods=['DELETE'])
@require_artisans
def delete_work_order(wid):
    wo = _get_wo(wid)
    if not wo:
        return jsonify({'error': 'Bon de travaux introuvable'}), 404
    db.session.delete(wo)
    db.session.commit()
    return jsonify({'message': 'Bon de travaux supprimé'})
