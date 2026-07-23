from functools import wraps
from flask import jsonify, request, g
from app import db
from app.models import Agency, Subscription, ContractTemplate
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.services.html_sanitize import sanitize_html
from app.models import Contract, Transaction, Property, Client
from app.services.contract_merge import build_context, render


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


def _get_contract(cid):
    return Contract.query.filter_by(id=cid, agency_id=g.agency_id).first()


@backoffice_bp.route('/contracts', methods=['GET'])
@require_contracts
def list_contracts():
    q = Contract.query.filter_by(agency_id=g.agency_id)
    if request.args.get('status'):
        q = q.filter(Contract.status == request.args.get('status'))
    if request.args.get('transaction_id', type=int):
        q = q.filter(Contract.transaction_id == request.args.get('transaction_id', type=int))
    rows = q.order_by(Contract.created_at.desc()).all()
    return jsonify({'contracts': [c.to_dict(include_body=False) for c in rows]})


@backoffice_bp.route('/contracts', methods=['POST'])
@require_contracts
def create_contract():
    agency = _agency()
    data = request.get_json(silent=True) or {}
    tpl = ContractTemplate.query.filter(
        ContractTemplate.id == data.get('template_id'),
        (ContractTemplate.agency_id.is_(None)) | (ContractTemplate.agency_id == agency.id)).first()
    if not tpl:
        return jsonify({'error': 'Modèle invalide'}), 400

    txn = prop = cli = None
    if data.get('transaction_id'):
        txn = Transaction.query.filter_by(id=data['transaction_id'], agency_id=agency.id).first()
    if data.get('property_id'):
        prop = Property.query.filter_by(id=data['property_id'], agency_id=agency.id).first()
    if data.get('client_id'):
        cli = Client.query.filter_by(id=data['client_id'], agency_id=agency.id).first()

    context = build_context(agency, transaction=txn, property=prop, client=cli)
    body = sanitize_html(render(tpl.body_html, context))
    contract = Contract(
        agency_id=agency.id, title=data.get('title') or tpl.name, document_type=tpl.document_type,
        template_id=tpl.id, transaction_id=(txn.id if txn else None),
        property_id=(prop.id if prop else None), client_id=(cli.id if cli else None),
        body_html=body, merge_context=context, status='draft', created_by=g.current_user.id)
    db.session.add(contract)
    db.session.commit()
    return jsonify({'contract': contract.to_dict()}), 201


@backoffice_bp.route('/contracts/<int:cid>', methods=['GET'])
@require_contracts
def get_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>', methods=['PUT'])
@require_contracts
def update_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status != 'draft':
        return jsonify({'error': 'Un contrat finalisé ne peut plus être édité.'}), 409
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        c.title = data['title']
    if 'body_html' in data:
        c.body_html = sanitize_html(data['body_html'])
    db.session.commit()
    return jsonify({'contract': c.to_dict()})


@backoffice_bp.route('/contracts/<int:cid>', methods=['DELETE'])
@require_contracts
def delete_contract(cid):
    c = _get_contract(cid)
    if not c:
        return jsonify({'error': 'Contrat introuvable'}), 404
    if c.status != 'draft':
        return jsonify({'error': 'Seul un brouillon peut être supprimé.'}), 409
    db.session.delete(c)
    db.session.commit()
    return jsonify({'message': 'Contrat supprimé'})
