from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import Lead, Property, User


@api_v1_bp.route('/properties/<int:property_id>/contact', methods=['POST'])
def create_lead(property_id):
    """Create a lead/contact request for a property."""
    property = Property.query.get_or_404(property_id)

    data = request.get_json()

    # Validate required fields
    if not data.get('name') or not data.get('email'):
        return jsonify({'error': 'Name and email are required'}), 400

    # Create lead
    lead = Lead(
        name=data['name'],
        email=data['email'],
        phone=data.get('phone'),
        message=data.get('message'),
        source=data.get('source', 'contact_form'),
        property_id=property.id,
        agency_id=property.agency_id,
        owner_id=property.owner_id if not property.agency_id else None,
        ip_address=request.remote_addr,
        user_agent=request.user_agent.string[:255] if request.user_agent else None
    )

    # Increment property contact count
    property.contacts_count += 1

    db.session.add(lead)
    db.session.commit()

    return jsonify({
        'message': 'Contact request sent successfully'
    }), 201


@api_v1_bp.route('/my-leads', methods=['GET'])
@jwt_required()
def my_leads():
    """Get leads for current user's agency or own properties."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    if user.agency_id:
        # Agency leads
        query = Lead.query.filter(Lead.agency_id == user.agency_id)
    else:
        # Individual owner leads
        query = Lead.query.filter(Lead.owner_id == user.id)

    # Filter by status
    if request.args.get('status'):
        query = query.filter(Lead.status == request.args.get('status'))

    query = query.order_by(Lead.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'leads': [l.to_dict() for l in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/leads/<int:lead_id>', methods=['GET'])
@jwt_required()
def get_lead(lead_id):
    """Get lead details."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    lead = Lead.query.get_or_404(lead_id)

    # Check authorization
    if user.agency_id:
        if lead.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
    else:
        if lead.owner_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    return jsonify({'lead': lead.to_dict()})


@api_v1_bp.route('/leads/<int:lead_id>/status', methods=['PUT'])
@jwt_required()
def update_lead_status(lead_id):
    """Update lead status."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    lead = Lead.query.get_or_404(lead_id)

    # Check authorization
    if user.agency_id:
        if lead.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
    else:
        if lead.owner_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json()
    new_status = data.get('status')

    if new_status not in ['new', 'contacted', 'qualified', 'converted', 'lost']:
        return jsonify({'error': 'Invalid status'}), 400

    from datetime import datetime

    lead.status = new_status

    if new_status == 'contacted' and not lead.contacted_at:
        lead.contacted_at = datetime.utcnow()
    elif new_status == 'converted':
        lead.converted_at = datetime.utcnow()

    db.session.commit()

    return jsonify({
        'message': 'Lead status updated',
        'lead': lead.to_dict()
    })
