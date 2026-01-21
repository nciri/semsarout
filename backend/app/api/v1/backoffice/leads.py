from flask import jsonify, request, g
from datetime import datetime
from sqlalchemy import or_
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Lead, Property, User, ActivityLog


@backoffice_bp.route('/leads', methods=['GET'])
@require_auth
def get_leads():
    """Get all leads with filtering and pagination."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    status = request.args.get('status')
    source = request.args.get('source')
    assigned_to = request.args.get('assigned_to', type=int)
    property_id = request.args.get('property_id', type=int)
    search = request.args.get('q')

    query = Lead.query
    if agency_id:
        query = query.filter(Lead.agency_id == agency_id)

    if status:
        query = query.filter(Lead.status == status)
    if source:
        query = query.filter(Lead.source == source)
    if assigned_to:
        query = query.filter(Lead.assigned_to_id == assigned_to)
    if property_id:
        query = query.filter(Lead.property_id == property_id)
    if search:
        search_filter = or_(
            Lead.name.ilike(f'%{search}%'),
            Lead.email.ilike(f'%{search}%'),
            Lead.phone.ilike(f'%{search}%')
        )
        query = query.filter(search_filter)

    # Sorting
    sort_by = request.args.get('sort_by', 'created_at')
    sort_order = request.args.get('sort_order', 'desc')
    if hasattr(Lead, sort_by):
        order_column = getattr(Lead, sort_by)
        if sort_order == 'desc':
            order_column = order_column.desc()
        query = query.order_by(order_column)

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'leads': [l.to_dict() for l in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/leads/<int:lead_id>', methods=['GET'])
@require_auth
def get_lead(lead_id):
    """Get a single lead with full details."""
    lead = Lead.query.get_or_404(lead_id)

    # Check agency access
    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(lead.to_dict())


@backoffice_bp.route('/leads', methods=['POST'])
@require_auth
def create_lead():
    """Create a new lead manually."""
    data = request.get_json()

    lead = Lead(
        name=data.get('name'),
        email=data.get('email'),
        phone=data.get('phone'),
        source=data.get('source', 'manual'),
        status='new',
        message=data.get('message'),
        property_id=data.get('property_id'),
        assigned_to_id=data.get('assigned_to_id') or (g.current_user.id if g.current_user else None),
        agency_id=g.agency_id
    )

    db.session.add(lead)
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='create',
        entity_type='lead',
        entity_id=lead.id,
        new_values={'name': lead.name, 'source': lead.source},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(lead.to_dict()), 201


@backoffice_bp.route('/leads/<int:lead_id>', methods=['PUT'])
@require_auth
def update_lead(lead_id):
    """Update a lead."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    old_values = {'status': lead.status}

    # Update fields
    for field in ['name', 'email', 'phone', 'status', 'source', 'message',
                  'property_id', 'assigned_to_id', 'notes']:
        if field in data:
            setattr(lead, field, data[field])

    # Handle status changes
    if 'status' in data:
        if data['status'] == 'contacted' and not lead.contacted_at:
            lead.contacted_at = datetime.utcnow()
        elif data['status'] == 'qualified' and not lead.qualified_at:
            lead.qualified_at = datetime.utcnow()
        elif data['status'] == 'converted' and not lead.converted_at:
            lead.converted_at = datetime.utcnow()
        elif data['status'] == 'lost' and not lead.lost_at:
            lead.lost_at = datetime.utcnow()
            lead.lost_reason = data.get('lost_reason')

    lead.updated_at = datetime.utcnow()
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='update',
        entity_type='lead',
        entity_id=lead.id,
        old_values=old_values,
        new_values={'status': lead.status},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(lead.to_dict())


@backoffice_bp.route('/leads/<int:lead_id>', methods=['DELETE'])
@require_auth
def delete_lead(lead_id):
    """Delete a lead."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    # Log before deleting
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='delete',
        entity_type='lead',
        entity_id=lead.id,
        old_values={'name': lead.name},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)

    db.session.delete(lead)
    db.session.commit()

    return jsonify({'message': 'Lead deleted'})


@backoffice_bp.route('/leads/<int:lead_id>/assign', methods=['POST'])
@require_auth
def assign_lead(lead_id):
    """Assign a lead to an agent."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    user_id = data.get('user_id')

    if user_id:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

    lead.assigned_to_id = user_id
    db.session.commit()

    return jsonify(lead.to_dict())


@backoffice_bp.route('/leads/<int:lead_id>/contact', methods=['POST'])
@require_auth
def mark_lead_contacted(lead_id):
    """Mark a lead as contacted."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}

    lead.status = 'contacted'
    lead.contacted_at = datetime.utcnow()
    if data.get('notes'):
        lead.notes = data['notes']

    db.session.commit()

    return jsonify(lead.to_dict())


@backoffice_bp.route('/leads/<int:lead_id>/qualify', methods=['POST'])
@require_auth
def qualify_lead(lead_id):
    """Qualify a lead."""
    lead = Lead.query.get_or_404(lead_id)

    if g.agency_id and lead.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}

    lead.status = 'qualified'
    lead.qualified_at = datetime.utcnow()
    if data.get('notes'):
        lead.notes = data['notes']

    db.session.commit()

    return jsonify(lead.to_dict())


@backoffice_bp.route('/leads/stats', methods=['GET'])
@require_auth
def get_lead_stats():
    """Get lead statistics."""
    agency_id = g.agency_id
    agency_filter = Lead.agency_id == agency_id if agency_id else True

    from sqlalchemy import func

    # By status
    by_status = db.session.query(
        Lead.status,
        func.count(Lead.id)
    ).filter(agency_filter).group_by(Lead.status).all()

    # By source
    by_source = db.session.query(
        Lead.source,
        func.count(Lead.id)
    ).filter(agency_filter).group_by(Lead.source).all()

    # Conversion funnel
    total = Lead.query.filter(agency_filter).count()
    contacted = Lead.query.filter(agency_filter, Lead.contacted_at.isnot(None)).count()
    qualified = Lead.query.filter(agency_filter, Lead.qualified_at.isnot(None)).count()
    converted = Lead.query.filter(agency_filter, Lead.status == 'converted').count()

    return jsonify({
        'by_status': [{'status': r[0], 'count': r[1]} for r in by_status],
        'by_source': [{'source': r[0], 'count': r[1]} for r in by_source],
        'funnel': {
            'total': total,
            'contacted': contacted,
            'qualified': qualified,
            'converted': converted,
            'conversion_rate': round(converted / total * 100, 1) if total > 0 else 0
        }
    })


@backoffice_bp.route('/leads/agents', methods=['GET'])
@require_auth
def get_agents_for_leads():
    """Get list of agents that can be assigned to leads."""
    agency_id = g.agency_id

    query = User.query.filter(User.is_active == True)
    if agency_id:
        query = query.filter(User.agency_id == agency_id)

    users = query.all()

    return jsonify({
        'agents': [{'id': u.id, 'name': u.full_name, 'email': u.email} for u in users]
    })
