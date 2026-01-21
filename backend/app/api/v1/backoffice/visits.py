from flask import jsonify, request, g
from datetime import datetime, timedelta
from sqlalchemy import and_, or_, func
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Visit, CalendarEvent, Client, Property, User, ActivityLog


@backoffice_bp.route('/visits', methods=['GET'])
@require_auth
def get_visits():
    """Get all visits with filtering and pagination."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    status = request.args.get('status')
    agent_id = request.args.get('agent_id', type=int)
    property_id = request.args.get('property_id', type=int)
    client_id = request.args.get('client_id', type=int)
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')

    query = Visit.query
    if agency_id:
        query = query.filter(Visit.agency_id == agency_id)

    if status:
        query = query.filter(Visit.status == status)
    if agent_id:
        query = query.filter(Visit.agent_id == agent_id)
    if property_id:
        query = query.filter(Visit.property_id == property_id)
    if client_id:
        query = query.filter(Visit.client_id == client_id)
    if date_from:
        query = query.filter(Visit.scheduled_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(Visit.scheduled_at <= datetime.fromisoformat(date_to))

    # Default sort by scheduled date
    query = query.order_by(Visit.scheduled_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'visits': [v.to_dict() for v in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/visits/calendar', methods=['GET'])
@require_auth
def get_calendar_visits():
    """Get visits for calendar view (date range)."""
    agency_id = g.agency_id

    # Get date range (default: current month)
    start = request.args.get('start')
    end = request.args.get('end')

    if not start:
        today = datetime.utcnow()
        start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = datetime.fromisoformat(start.replace('Z', '+00:00'))

    if not end:
        # End of month
        if start.month == 12:
            end = start.replace(year=start.year+1, month=1)
        else:
            end = start.replace(month=start.month+1)
    else:
        end = datetime.fromisoformat(end.replace('Z', '+00:00'))

    agent_id = request.args.get('agent_id', type=int)

    query = Visit.query.filter(
        Visit.scheduled_at >= start,
        Visit.scheduled_at < end
    )

    if agency_id:
        query = query.filter(Visit.agency_id == agency_id)
    if agent_id:
        query = query.filter(Visit.agent_id == agent_id)

    visits = query.all()

    # Also get calendar events
    events_query = CalendarEvent.query.filter(
        CalendarEvent.start_at >= start,
        CalendarEvent.start_at < end
    )
    if agency_id:
        events_query = events_query.filter(CalendarEvent.agency_id == agency_id)
    if agent_id:
        events_query = events_query.filter(CalendarEvent.user_id == agent_id)

    events = events_query.all()

    # Format for calendar
    calendar_items = []

    for v in visits:
        calendar_items.append({
            'id': f'visit-{v.id}',
            'type': 'visit',
            'title': f"Visite: {v.related_property.title[:30]}..." if v.related_property else 'Visite',
            'start': v.scheduled_at.isoformat(),
            'end': (v.scheduled_at + timedelta(minutes=v.duration_minutes)).isoformat(),
            'color': get_visit_color(v.status),
            'data': v.to_dict()
        })

    for e in events:
        calendar_items.append({
            'id': f'event-{e.id}',
            'type': 'event',
            'title': e.title,
            'start': e.start_at.isoformat(),
            'end': e.end_at.isoformat() if e.end_at else None,
            'allDay': e.all_day,
            'color': e.color,
            'data': e.to_dict()
        })

    return jsonify({'items': calendar_items})


def get_visit_color(status):
    colors = {
        'scheduled': '#6B7280',  # gray
        'confirmed': '#3B82F6',  # blue
        'completed': '#10B981',  # green
        'cancelled': '#EF4444',  # red
        'no_show': '#F59E0B'    # yellow
    }
    return colors.get(status, '#6B7280')


@backoffice_bp.route('/visits/<int:visit_id>', methods=['GET'])
@require_auth
def get_visit(visit_id):
    """Get a single visit with full details."""
    visit = Visit.query.get_or_404(visit_id)

    if g.agency_id and visit.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    return jsonify(visit.to_dict(include_property=True, include_client=True))


@backoffice_bp.route('/visits', methods=['POST'])
@require_auth
def create_visit():
    """Create a new visit."""
    data = request.get_json()

    visit = Visit(
        property_id=data.get('property_id'),
        client_id=data.get('client_id'),
        visitor_name=data.get('visitor_name'),
        visitor_email=data.get('visitor_email'),
        visitor_phone=data.get('visitor_phone'),
        agent_id=data.get('agent_id') or (g.current_user.id if g.current_user else None),
        scheduled_at=datetime.fromisoformat(data.get('scheduled_at').replace('Z', '+00:00')),
        duration_minutes=data.get('duration_minutes', 30),
        visit_type=data.get('visit_type', 'in_person'),
        notes=data.get('notes'),
        internal_notes=data.get('internal_notes'),
        agency_id=g.agency_id
    )

    db.session.add(visit)
    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='create',
        entity_type='visit',
        entity_id=visit.id,
        new_values={'property_id': visit.property_id, 'scheduled_at': visit.scheduled_at.isoformat()},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify(visit.to_dict()), 201


@backoffice_bp.route('/visits/<int:visit_id>', methods=['PUT'])
@require_auth
def update_visit(visit_id):
    """Update a visit."""
    visit = Visit.query.get_or_404(visit_id)

    if g.agency_id and visit.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    # Update fields
    for field in ['property_id', 'client_id', 'visitor_name', 'visitor_email',
                  'visitor_phone', 'agent_id', 'duration_minutes', 'visit_type',
                  'notes', 'internal_notes', 'report', 'client_feedback',
                  'client_comments']:
        if field in data:
            setattr(visit, field, data[field])

    if 'scheduled_at' in data:
        visit.scheduled_at = datetime.fromisoformat(data['scheduled_at'].replace('Z', '+00:00'))

    if 'status' in data:
        old_status = visit.status
        visit.status = data['status']

        # Track status changes
        if data['status'] == 'confirmed' and old_status != 'confirmed':
            visit.confirmed_at = datetime.utcnow()
            visit.confirmation_method = data.get('confirmation_method')
        elif data['status'] == 'completed' and old_status != 'completed':
            visit.completed_at = datetime.utcnow()
        elif data['status'] == 'cancelled' and old_status != 'cancelled':
            visit.cancelled_at = datetime.utcnow()
            visit.cancellation_reason = data.get('cancellation_reason')

    visit.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify(visit.to_dict())


@backoffice_bp.route('/visits/<int:visit_id>', methods=['DELETE'])
@require_auth
def delete_visit(visit_id):
    """Cancel a visit."""
    visit = Visit.query.get_or_404(visit_id)

    if g.agency_id and visit.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    visit.status = 'cancelled'
    visit.cancelled_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'message': 'Visit cancelled'})


@backoffice_bp.route('/visits/<int:visit_id>/confirm', methods=['POST'])
@require_auth
def confirm_visit(visit_id):
    """Confirm a visit."""
    visit = Visit.query.get_or_404(visit_id)

    if g.agency_id and visit.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}

    visit.status = 'confirmed'
    visit.confirmed_at = datetime.utcnow()
    visit.confirmation_method = data.get('method', 'manual')

    db.session.commit()

    return jsonify(visit.to_dict())


@backoffice_bp.route('/visits/<int:visit_id>/complete', methods=['POST'])
@require_auth
def complete_visit(visit_id):
    """Mark a visit as completed with report."""
    visit = Visit.query.get_or_404(visit_id)

    if g.agency_id and visit.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json() or {}

    visit.status = 'completed'
    visit.completed_at = datetime.utcnow()
    visit.report = data.get('report')
    visit.client_feedback = data.get('client_feedback')
    visit.client_comments = data.get('client_comments')

    db.session.commit()

    return jsonify(visit.to_dict())


# Calendar Events endpoints
@backoffice_bp.route('/calendar/events', methods=['GET'])
@require_auth
def get_calendar_events():
    """Get calendar events."""
    agency_id = g.agency_id
    user_id = request.args.get('user_id', type=int) or (g.current_user.id if g.current_user else None)

    start = request.args.get('start')
    end = request.args.get('end')

    query = CalendarEvent.query

    if agency_id:
        query = query.filter(CalendarEvent.agency_id == agency_id)
    if user_id:
        query = query.filter(
            or_(
                CalendarEvent.user_id == user_id,
                CalendarEvent.attendees.contains([user_id])
            )
        )
    if start:
        query = query.filter(CalendarEvent.start_at >= datetime.fromisoformat(start))
    if end:
        query = query.filter(CalendarEvent.start_at <= datetime.fromisoformat(end))

    events = query.order_by(CalendarEvent.start_at).all()

    return jsonify({'events': [e.to_dict() for e in events]})


@backoffice_bp.route('/calendar/events', methods=['POST'])
@require_auth
def create_calendar_event():
    """Create a calendar event."""
    data = request.get_json()

    event = CalendarEvent(
        title=data.get('title'),
        description=data.get('description'),
        event_type=data.get('event_type', 'meeting'),
        start_at=datetime.fromisoformat(data.get('start_at').replace('Z', '+00:00')),
        end_at=datetime.fromisoformat(data.get('end_at').replace('Z', '+00:00')) if data.get('end_at') else None,
        all_day=data.get('all_day', False),
        location=data.get('location'),
        attendees=data.get('attendees', []),
        client_id=data.get('client_id'),
        property_id=data.get('property_id'),
        user_id=g.current_user.id if g.current_user else data.get('user_id'),
        agency_id=g.agency_id,
        color=data.get('color', 'blue')
    )

    db.session.add(event)
    db.session.commit()

    return jsonify(event.to_dict()), 201


@backoffice_bp.route('/calendar/events/<int:event_id>', methods=['PUT'])
@require_auth
def update_calendar_event(event_id):
    """Update a calendar event."""
    event = CalendarEvent.query.get_or_404(event_id)

    if g.agency_id and event.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()

    for field in ['title', 'description', 'event_type', 'all_day', 'location',
                  'attendees', 'client_id', 'property_id', 'status', 'color']:
        if field in data:
            setattr(event, field, data[field])

    if 'start_at' in data:
        event.start_at = datetime.fromisoformat(data['start_at'].replace('Z', '+00:00'))
    if 'end_at' in data:
        event.end_at = datetime.fromisoformat(data['end_at'].replace('Z', '+00:00')) if data['end_at'] else None

    event.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify(event.to_dict())


@backoffice_bp.route('/calendar/events/<int:event_id>', methods=['DELETE'])
@require_auth
def delete_calendar_event(event_id):
    """Delete a calendar event."""
    event = CalendarEvent.query.get_or_404(event_id)

    if g.agency_id and event.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    db.session.delete(event)
    db.session.commit()

    return jsonify({'message': 'Event deleted'})
