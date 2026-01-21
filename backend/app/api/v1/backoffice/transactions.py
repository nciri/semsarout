from flask import jsonify, request, g
from datetime import datetime
import uuid
from sqlalchemy import or_, func
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import (
    Transaction, Offer, TransactionDocument, Client, Property,
    User, ActivityLog, SALE_STAGES, RENT_STAGES
)


def generate_reference():
    """Generate unique transaction reference."""
    return f"TX-{datetime.utcnow().strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"


@backoffice_bp.route('/transactions', methods=['GET'])
@require_auth
def get_transactions():
    """Get all transactions with filtering."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    transaction_type = request.args.get('type')
    status = request.args.get('status')
    stage = request.args.get('stage')
    agent_id = request.args.get('agent_id', type=int)
    client_id = request.args.get('client_id', type=int)
    property_id = request.args.get('property_id', type=int)
    priority = request.args.get('priority')
    search = request.args.get('q')

    query = Transaction.query
    if agency_id:
        query = query.filter(Transaction.agency_id == agency_id)

    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)
    if status:
        query = query.filter(Transaction.status == status)
    if stage:
        query = query.filter(Transaction.stage == stage)
    if agent_id:
        query = query.filter(Transaction.agent_id == agent_id)
    if client_id:
        query = query.filter(Transaction.client_id == client_id)
    if property_id:
        query = query.filter(Transaction.property_id == property_id)
    if priority:
        query = query.filter(Transaction.priority == priority)
    if search:
        query = query.filter(
            or_(
                Transaction.reference.ilike(f'%{search}%'),
                Transaction.notes.ilike(f'%{search}%')
            )
        )

    # Sorting
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    if hasattr(Transaction, sort_by):
        order_column = getattr(Transaction, sort_by)
        if sort_order == 'desc':
            order_column = order_column.desc()
        query = query.order_by(order_column)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'transactions': [t.to_dict() for t in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/transactions/pipeline', methods=['GET'])
@require_auth
def get_pipeline():
    """Get transactions organized by stage for Kanban view."""
    agency_id = g.agency_id
    transaction_type = request.args.get('type', 'sale')
    agent_id = request.args.get('agent_id', type=int)

    query = Transaction.query.filter(
        Transaction.status == 'active',
        Transaction.transaction_type == transaction_type
    )

    if agency_id:
        query = query.filter(Transaction.agency_id == agency_id)
    if agent_id:
        query = query.filter(Transaction.agent_id == agent_id)

    transactions = query.order_by(Transaction.stage_order).all()

    # Get stages config
    stages = SALE_STAGES if transaction_type == 'sale' else RENT_STAGES

    # Organize by stage
    pipeline = {}
    for stage in stages:
        pipeline[stage['id']] = {
            'id': stage['id'],
            'name': stage['name'],
            'color': stage['color'],
            'order': stage['order'],
            'transactions': []
        }

    for tx in transactions:
        if tx.stage in pipeline:
            pipeline[tx.stage]['transactions'].append(tx.to_dict())

    return jsonify({
        'pipeline': list(pipeline.values()),
        'stages': stages
    })


@backoffice_bp.route('/transactions/<int:tx_id>', methods=['GET'])
@require_auth
def get_transaction(tx_id):
    """Get a single transaction with full details."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(transaction.to_dict(
        include_property=True,
        include_client=True,
        include_offers=True
    ))


@backoffice_bp.route('/transactions', methods=['POST'])
@require_auth
def create_transaction():
    """Create a new transaction."""
    data = request.get_json()

    transaction = Transaction(
        reference=generate_reference(),
        property_id=data.get('property_id'),
        client_id=data.get('client_id'),
        seller_id=data.get('seller_id'),
        agent_id=data.get('agent_id') or (g.current_user.id if g.current_user else None),
        transaction_type=data.get('transaction_type', 'sale'),
        stage=data.get('stage', 'contact'),
        stage_order=data.get('stage_order', 0),
        asking_price=data.get('asking_price'),
        commission_rate=data.get('commission_rate'),
        priority=data.get('priority', 'medium'),
        probability=data.get('probability', 50),
        expected_closing_date=datetime.fromisoformat(data['expected_closing_date'].replace('Z', '+00:00')) if data.get('expected_closing_date') else None,
        notes=data.get('notes'),
        agency_id=g.agency_id
    )

    db.session.add(transaction)
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='create',
        entity_type='transaction',
        entity_id=transaction.id,
        new_values={'reference': transaction.reference, 'type': transaction.transaction_type},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(transaction.to_dict()), 201


@backoffice_bp.route('/transactions/<int:tx_id>', methods=['PUT'])
@require_auth
def update_transaction(tx_id):
    """Update a transaction."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    old_stage = transaction.stage

    # Update fields
    for field in ['property_id', 'client_id', 'seller_id', 'agent_id',
                  'transaction_type', 'stage', 'stage_order', 'asking_price',
                  'offer_price', 'final_price', 'commission_rate', 'commission_amount',
                  'commission_split', 'status', 'lost_reason', 'probability',
                  'priority', 'notes']:
        if field in data:
            setattr(transaction, field, data[field])

    # Handle date fields
    for date_field in ['expected_closing_date', 'visit_date', 'offer_date',
                       'acceptance_date', 'compromise_date', 'closing_date']:
        if date_field in data:
            if data[date_field]:
                setattr(transaction, date_field,
                       datetime.fromisoformat(data[date_field].replace('Z', '+00:00')))
            else:
                setattr(transaction, date_field, None)

    # Track stage changes
    if 'stage' in data and data['stage'] != old_stage:
        stages = SALE_STAGES if transaction.transaction_type == 'sale' else RENT_STAGES
        stage_info = next((s for s in stages if s['id'] == data['stage']), None)
        if stage_info:
            transaction.stage_order = stage_info['order']

    # Handle status changes
    if 'status' in data:
        if data['status'] == 'won' and transaction.status != 'won':
            transaction.closed_at = datetime.utcnow()
            # Update property status
            if transaction.related_property:
                transaction.related_property.status = 'sold' if transaction.transaction_type == 'sale' else 'rented'
        elif data['status'] == 'lost' and transaction.status != 'lost':
            transaction.closed_at = datetime.utcnow()

    transaction.updated_at = datetime.utcnow()
    db.session.commit()

    # Log activity
    if 'stage' in data and data['stage'] != old_stage:
        log = ActivityLog(
            user_id=g.current_user.id if g.current_user else None,
            action='stage_change',
            entity_type='transaction',
            entity_id=transaction.id,
            old_values={'stage': old_stage},
            new_values={'stage': transaction.stage},
            agency_id=g.agency_id,
            ip_address=request.remote_addr
        )
        db.session.add(log)
        db.session.commit()

    return jsonify(transaction.to_dict())


@backoffice_bp.route('/transactions/<int:tx_id>/move', methods=['POST'])
@require_auth
def move_transaction_stage(tx_id):
    """Move a transaction to a different stage (for drag & drop)."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    new_stage = data.get('stage')
    new_order = data.get('order', 0)

    old_stage = transaction.stage
    transaction.stage = new_stage
    transaction.stage_order = new_order
    transaction.updated_at = datetime.utcnow()

    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='stage_change',
        entity_type='transaction',
        entity_id=transaction.id,
        old_values={'stage': old_stage},
        new_values={'stage': new_stage},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(transaction.to_dict())


@backoffice_bp.route('/transactions/<int:tx_id>', methods=['DELETE'])
@require_auth
def delete_transaction(tx_id):
    """Delete (archive) a transaction."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    transaction.status = 'lost'
    transaction.lost_reason = 'Archived'
    transaction.closed_at = datetime.utcnow()

    db.session.commit()

    return jsonify({'message': 'Transaction archived'})


# Offers endpoints
@backoffice_bp.route('/transactions/<int:tx_id>/offers', methods=['GET'])
@require_auth
def get_offers(tx_id):
    """Get all offers for a transaction."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    offers = transaction.offers.order_by(Offer.created_at.desc()).all()

    return jsonify({'offers': [o.to_dict() for o in offers]})


@backoffice_bp.route('/transactions/<int:tx_id>/offers', methods=['POST'])
@require_auth
def create_offer(tx_id):
    """Create a new offer."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    offer = Offer(
        transaction_id=tx_id,
        amount=data.get('amount'),
        conditions=data.get('conditions'),
        offer_type=data.get('offer_type', 'initial'),
        from_party=data.get('from_party'),
        expires_at=datetime.fromisoformat(data['expires_at'].replace('Z', '+00:00')) if data.get('expires_at') else None,
        created_by_id=g.current_user.id if g.current_user else None
    )

    db.session.add(offer)

    # Update transaction offer_price with latest offer
    transaction.offer_price = offer.amount
    if transaction.stage == 'visit':
        transaction.stage = 'offer'
        transaction.offer_date = datetime.utcnow()

    db.session.commit()

    return jsonify(offer.to_dict()), 201


@backoffice_bp.route('/transactions/<int:tx_id>/offers/<int:offer_id>', methods=['PUT'])
@require_auth
def update_offer(tx_id, offer_id):
    """Update an offer (respond to it)."""
    offer = Offer.query.get_or_404(offer_id)

    if offer.transaction_id != tx_id:
        return jsonify({'error': 'Offer not found'}), 404

    transaction = Transaction.query.get_or_404(tx_id)
    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    if 'status' in data:
        offer.status = data['status']
        offer.responded_at = datetime.utcnow()
        offer.response_notes = data.get('response_notes')

        # If accepted, update transaction
        if data['status'] == 'accepted':
            transaction.final_price = offer.amount
            transaction.acceptance_date = datetime.utcnow()
            if transaction.stage in ['contact', 'visit', 'offer']:
                transaction.stage = 'negotiation'

    db.session.commit()

    return jsonify(offer.to_dict())


# Documents endpoints
@backoffice_bp.route('/transactions/<int:tx_id>/documents', methods=['GET'])
@require_auth
def get_transaction_documents(tx_id):
    """Get all documents for a transaction."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    documents = transaction.documents.order_by(TransactionDocument.created_at.desc()).all()

    return jsonify({'documents': [d.to_dict() for d in documents]})


@backoffice_bp.route('/transactions/<int:tx_id>/documents', methods=['POST'])
@require_auth
def add_transaction_document(tx_id):
    """Add a document to a transaction."""
    transaction = Transaction.query.get_or_404(tx_id)

    if g.agency_id and transaction.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    document = TransactionDocument(
        transaction_id=tx_id,
        document_type=data.get('document_type'),
        name=data.get('name'),
        file_url=data.get('file_url'),
        file_size=data.get('file_size'),
        mime_type=data.get('mime_type'),
        requires_signature=data.get('requires_signature', False),
        uploaded_by_id=g.current_user.id if g.current_user else None
    )

    db.session.add(document)
    db.session.commit()

    return jsonify(document.to_dict()), 201


# Pipeline stats
@backoffice_bp.route('/transactions/stats', methods=['GET'])
@require_auth
def get_transaction_stats():
    """Get transaction statistics."""
    agency_id = g.agency_id
    tx_filter = Transaction.agency_id == agency_id if agency_id else True

    # By status
    by_status = db.session.query(
        Transaction.status,
        func.count(Transaction.id),
        func.sum(Transaction.asking_price)
    ).filter(tx_filter).group_by(Transaction.status).all()

    # By stage (active only)
    by_stage = db.session.query(
        Transaction.stage,
        func.count(Transaction.id),
        func.sum(Transaction.asking_price)
    ).filter(tx_filter, Transaction.status == 'active').group_by(Transaction.stage).all()

    # By agent
    by_agent = db.session.query(
        User.first_name,
        User.last_name,
        func.count(Transaction.id),
        func.sum(Transaction.commission_amount)
    ).join(User, Transaction.agent_id == User.id).filter(
        tx_filter,
        Transaction.status == 'won'
    ).group_by(User.id, User.first_name, User.last_name).all()

    return jsonify({
        'by_status': [{'status': r[0], 'count': r[1], 'value': float(r[2] or 0)} for r in by_status],
        'by_stage': [{'stage': r[0], 'count': r[1], 'value': float(r[2] or 0)} for r in by_stage],
        'by_agent': [{'name': f"{r[0]} {r[1]}", 'count': r[2], 'commission': float(r[3] or 0)} for r in by_agent]
    })


@backoffice_bp.route('/transactions/stages', methods=['GET'])
@require_auth
def get_stages():
    """Get pipeline stages configuration."""
    transaction_type = request.args.get('type', 'sale')
    stages = SALE_STAGES if transaction_type == 'sale' else RENT_STAGES
    return jsonify({'stages': stages})
