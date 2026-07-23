from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, ContractTemplate
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.html_sanitize import sanitize_html


def _agency():
    return Agency.query.get(g.agency_id) if g.agency_id else None


def _plan(agency):
    sub = Subscription.query.filter_by(agency_id=agency.id).first() if agency else None
    return sub.plan if sub else None


def require_contracts(f):
    @wraps(f)
    @require_auth
    def decorated(*args, **kwargs):
        agency = _agency()
        plan = _plan(agency)
        if not agency or not plan or not plan.has_contracts:
            return jsonify({'error': "Fonction réservée aux plans Pro et Entreprise."}), 403
        return f(*args, **kwargs)
    return decorated


def can_manage_templates(agency):
    plan = _plan(agency)
    return bool(plan and plan.slug == 'enterprise')


@backoffice_bp.route('/contract-templates', methods=['GET'])
@require_contracts
def list_templates():
    agency = _agency()
    q = ContractTemplate.query.filter(
        (ContractTemplate.agency_id.is_(None)) | (ContractTemplate.agency_id == agency.id))
    return jsonify({'templates': [t.to_dict() for t in q.order_by(ContractTemplate.name).all()],
                    'can_manage_templates': can_manage_templates(agency)})


@backoffice_bp.route('/contract-templates', methods=['POST'])
@require_contracts
def create_template():
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Les modèles personnalisés sont réservés au plan Entreprise."}), 403
    data = request.get_json(silent=True) or {}
    if not data.get('name') or not data.get('document_type') or not data.get('body_html'):
        return jsonify({'error': 'name, document_type et body_html requis'}), 400
    t = ContractTemplate(agency_id=agency.id, document_type=data['document_type'],
                          name=data['name'], body_html=sanitize_html(data['body_html']),
                          is_builtin=False, created_by=g.current_user.id)
    db.session.add(t)
    db.session.commit()
    return jsonify({'template': t.to_dict()}), 201


@backoffice_bp.route('/contract-templates/<int:tid>', methods=['PUT'])
@require_contracts
def update_template(tid):
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Réservé au plan Entreprise."}), 403
    t = ContractTemplate.query.filter_by(id=tid, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Modèle introuvable'}), 404
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        t.name = data['name']
    if 'body_html' in data:
        t.body_html = sanitize_html(data['body_html'])
    if 'document_type' in data:
        t.document_type = data['document_type']
    db.session.commit()
    return jsonify({'template': t.to_dict()})


@backoffice_bp.route('/contract-templates/<int:tid>', methods=['DELETE'])
@require_contracts
def delete_template(tid):
    agency = _agency()
    if not can_manage_templates(agency):
        return jsonify({'error': "Réservé au plan Entreprise."}), 403
    t = ContractTemplate.query.filter_by(id=tid, agency_id=agency.id).first()
    if not t:
        return jsonify({'error': 'Modèle introuvable'}), 404
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': 'Modèle supprimé'})
