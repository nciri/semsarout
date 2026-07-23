from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, Notary, LegalCase, LegalTask, Transaction, Property
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.legal_checklists import default_tasks


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


def _get_case(cid):
    return LegalCase.query.filter_by(id=cid, agency_id=g.agency_id).first()


@backoffice_bp.route('/legal-cases', methods=['GET'])
@require_legal
def list_legal_cases():
    q = LegalCase.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(LegalCase.status == request.args.get('status'))
    if request.args.get('transaction_id', type=int):
        q = q.filter(LegalCase.transaction_id == request.args.get('transaction_id', type=int))
    rows = q.order_by(LegalCase.created_at.desc()).all()
    return jsonify({'cases': [c.to_dict() for c in rows]})


@backoffice_bp.route('/legal-cases', methods=['POST'])
@require_legal
def create_legal_case():
    data = request.get_json(silent=True) or {}
    txn = prop = None
    if data.get('transaction_id'):
        txn = Transaction.query.filter_by(id=data['transaction_id'], agency_id=g.agency_id).first()
    if data.get('property_id'):
        prop = Property.query.filter_by(id=data['property_id'], agency_id=g.agency_id).first()
    case_type = data.get('case_type')
    if txn is not None:
        case_type = 'sale' if txn.transaction_type == 'sale' else 'rental'
    if case_type not in ('sale', 'rental'):
        case_type = 'sale'
    notary_id = None
    if data.get('notary_id'):
        if not Notary.query.filter_by(id=data['notary_id'], agency_id=g.agency_id).first():
            return jsonify({'error': 'Notaire invalide'}), 400
        notary_id = data['notary_id']
    title = data.get('title') or (f"Dossier {txn.reference}" if txn else 'Dossier juridique')
    case = LegalCase(agency_id=g.agency_id, transaction_id=(txn.id if txn else None),
                     property_id=(prop.id if prop else None), notary_id=notary_id,
                     title=title, case_type=case_type, status='open', created_by=g.current_user.id)
    db.session.add(case)
    db.session.flush()
    for i, label in enumerate(default_tasks(case_type)):
        db.session.add(LegalTask(legal_case_id=case.id, label=label, status='todo', position=i))
    db.session.commit()
    return jsonify({'case': case.to_dict(include_tasks=True)}), 201


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['GET'])
@require_legal
def get_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    return jsonify({'case': case.to_dict(include_tasks=True)})


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['PUT'])
@require_legal
def update_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        case.title = data['title']
    if 'status' in data:
        case.status = data['status']
    if 'notes' in data:
        case.notes = data['notes']
    if 'notary_id' in data:
        nid = data['notary_id']
        if nid and not Notary.query.filter_by(id=nid, agency_id=g.agency_id).first():
            return jsonify({'error': 'Notaire invalide'}), 400
        case.notary_id = nid
    db.session.commit()
    return jsonify({'case': case.to_dict(include_tasks=True)})


@backoffice_bp.route('/legal-cases/<int:cid>', methods=['DELETE'])
@require_legal
def delete_legal_case(cid):
    case = _get_case(cid)
    if not case:
        return jsonify({'error': 'Dossier introuvable'}), 404
    LegalTask.query.filter_by(legal_case_id=case.id).delete()
    db.session.delete(case)
    db.session.commit()
    return jsonify({'message': 'Dossier supprimé'})
