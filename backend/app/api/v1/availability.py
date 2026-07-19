"""Self-service visit booking: agent weekly availability + public slot booking."""
from datetime import datetime, timedelta, time as dt_time
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, Property, Visit, AgentAvailability
from app.services.mailer import send_email, render_email

WEEKDAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']


# ============================================
# AGENT: manage own weekly availability
# ============================================

@api_v1_bp.route('/availability/me', methods=['GET'])
@jwt_required()
def get_my_availability():
    """List the current user's weekly availability windows."""
    current_user_id = int(get_jwt_identity())
    slots = AgentAvailability.query.filter_by(agent_id=current_user_id).order_by(
        AgentAvailability.weekday, AgentAvailability.start_time
    ).all()
    return jsonify({'availability': [s.to_dict() for s in slots]})


@api_v1_bp.route('/availability/me', methods=['PUT'])
@jwt_required()
def update_my_availability():
    """Replace the current user's weekly availability with the given list.

    Body: { "slots": [{"weekday": 0, "start_time": "09:00", "end_time": "12:00", "slot_minutes": 30}, ...] }
    """
    current_user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    slots = data.get('slots', [])

    for slot in slots:
        if not (0 <= int(slot.get('weekday', -1)) <= 6):
            return jsonify({'error': 'weekday doit être entre 0 (lundi) et 6 (dimanche)'}), 400

    AgentAvailability.query.filter_by(agent_id=current_user_id).delete()

    for slot in slots:
        db.session.add(AgentAvailability(
            agent_id=current_user_id,
            weekday=int(slot['weekday']),
            start_time=datetime.strptime(slot['start_time'], '%H:%M').time(),
            end_time=datetime.strptime(slot['end_time'], '%H:%M').time(),
            slot_minutes=int(slot.get('slot_minutes', 30))
        ))

    db.session.commit()

    updated = AgentAvailability.query.filter_by(agent_id=current_user_id).order_by(
        AgentAvailability.weekday, AgentAvailability.start_time
    ).all()
    return jsonify({'availability': [s.to_dict() for s in updated]})


# ============================================
# PUBLIC: available slots + booking for a property
# ============================================

@api_v1_bp.route('/properties/<int:property_id>/available-slots', methods=['GET'])
def get_available_slots(property_id):
    """List bookable visit slots for a property on a given date (public)."""
    property = Property.query.get_or_404(property_id)

    date_str = request.args.get('date')
    if not date_str:
        return jsonify({'error': 'Paramètre date requis (YYYY-MM-DD)'}), 400

    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'Format de date invalide (YYYY-MM-DD attendu)'}), 400

    if target_date < datetime.utcnow().date():
        return jsonify({'slots': []})

    weekday = target_date.weekday()
    windows = AgentAvailability.query.filter_by(
        agent_id=property.owner_id, weekday=weekday, is_active=True
    ).all()

    if not windows:
        return jsonify({'slots': []})

    # Existing bookings for this agent on that day, to exclude taken slots
    day_start = datetime.combine(target_date, dt_time.min)
    day_end = datetime.combine(target_date, dt_time.max)
    existing = Visit.query.filter(
        Visit.agent_id == property.owner_id,
        Visit.scheduled_at >= day_start,
        Visit.scheduled_at <= day_end,
        Visit.status != 'cancelled'
    ).all()
    taken_times = {v.scheduled_at.strftime('%H:%M') for v in existing}

    now = datetime.utcnow()
    slots = []
    for window in windows:
        cursor = datetime.combine(target_date, window.start_time)
        window_end = datetime.combine(target_date, window.end_time)
        step = timedelta(minutes=window.slot_minutes or 30)

        while cursor + step <= window_end:
            slot_label = cursor.strftime('%H:%M')
            if slot_label not in taken_times and cursor > now:
                slots.append(slot_label)
            cursor += step

    return jsonify({'date': date_str, 'slots': sorted(set(slots))})


@api_v1_bp.route('/properties/<int:property_id>/book-visit', methods=['POST'])
@jwt_required()
def book_visit(property_id):
    """Book a self-service visit slot on a property (authenticated buyers)."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    property = Property.query.get_or_404(property_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    date_str = data.get('date')
    time_str = data.get('time')

    if not date_str or not time_str:
        return jsonify({'error': 'date et time requis'}), 400

    try:
        scheduled_at = datetime.strptime(f'{date_str} {time_str}', '%Y-%m-%d %H:%M')
    except ValueError:
        return jsonify({'error': 'Format de date/heure invalide'}), 400

    if scheduled_at < datetime.utcnow():
        return jsonify({'error': 'Ce créneau est déjà passé'}), 400

    # Re-check the slot is still free (race condition guard)
    conflict = Visit.query.filter(
        Visit.agent_id == property.owner_id,
        Visit.scheduled_at == scheduled_at,
        Visit.status != 'cancelled'
    ).first()
    if conflict:
        return jsonify({'error': 'Ce créneau vient d\'être réservé, choisissez-en un autre'}), 409

    visit = Visit(
        property_id=property.id,
        visitor_name=user.full_name,
        visitor_email=user.email,
        visitor_phone=user.phone,
        agent_id=property.owner_id,
        scheduled_at=scheduled_at,
        duration_minutes=30,
        status='scheduled',
        visit_type='in_person',
        agency_id=property.agency_id,
        notes=data.get('notes')
    )
    db.session.add(visit)
    db.session.commit()

    agent = User.query.get(property.owner_id)
    if agent and agent.email:
        content = (
            f'<p>Bonjour {agent.first_name},</p>'
            f'<p><strong>{user.full_name}</strong> a réservé une visite pour '
            f'<strong>{property.title}</strong> le {scheduled_at.strftime("%d/%m/%Y à %H:%M")}.</p>'
            f'<p><a href="https://semsarout.ma/dashboard/visites">Voir dans mon calendrier</a></p>'
        )
        send_email(to=agent.email, subject='Nouvelle visite réservée', html_body=render_email(content))

    return jsonify({'visit': visit.to_dict()}), 201
