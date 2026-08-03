"""
StayManager Integration API Endpoints

Provides endpoints for connecting and managing the StayManager.ma integration
(Partner API v1 — docs/api/partner-api-v1.md in the staymanager.ma repo).
All endpoints require authentication and an agency with the StayManager sync feature.
"""

import secrets
from datetime import datetime
from functools import wraps
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import (
    User,
    Subscription,
    Property,
    StayManagerIntegration,
    StayManagerPropertyLink,
    StayManagerReservation,
    StayManagerSyncLog
)
from app.services.staymanager import StayManagerClient, StayManagerError

# The 5 events StayManager's Partner API can deliver (docs section 6)
WEBHOOK_EVENTS = [
    'reservation.created',
    'reservation.updated',
    'reservation.cancelled',
    'guest.verified',
    'property.updated'
]


staymanager_bp = Blueprint('staymanager', __name__, url_prefix='/integrations/staymanager')


def require_staymanager_feature(f):
    """Decorator to require StayManager sync feature in subscription."""
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
        user = User.query.get(current_user_id)

        if not user or not user.agency_id:
            return jsonify({'error': 'Agence requise'}), 403

        subscription = Subscription.query.filter_by(
            agency_id=user.agency_id,
            status='active'
        ).first()

        if not subscription or not subscription.plan.has_staymanager_sync:
            return jsonify({
                'error': 'Cette fonctionnalite necessite le plan Pro ou superieur',
                'upgrade_required': True
            }), 403

        return f(*args, **kwargs)
    return decorated


# ==================== Connection Management ====================

@staymanager_bp.route('/status', methods=['GET'])
@require_staymanager_feature
def get_status():
    """Get StayManager connection status for current agency."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({
            'connected': False,
            'integration': None
        })

    return jsonify({
        'connected': integration.status == 'connected',
        'integration': integration.to_dict(include_sensitive=True)
    })


@staymanager_bp.route('/connect', methods=['POST'])
@require_staymanager_feature
def connect():
    """Connect a StayManager account via Partner API key, then register our webhook."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    data = request.get_json() or {}

    api_key = data.get('api_key')
    email = data.get('email')

    if not api_key:
        return jsonify({'error': 'api_key requis'}), 400

    # Check if already connected
    existing = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()
    if existing and existing.status == 'connected':
        return jsonify({'error': 'StayManager est deja connecte'}), 400

    # Step 1: validate the key against GET /user/profile (docs section 3)
    try:
        client = StayManagerClient(api_key=api_key)
        profile = client.get_profile()
    except StayManagerError as e:
        return jsonify({'error': f'Connexion echouee: {str(e)}'}), 400

    # Create or update integration
    if existing:
        integration = existing
    else:
        integration = StayManagerIntegration(agency_id=user.agency_id)

    integration.api_key_encrypted = api_key  # TODO: Encrypt in production
    # `id` is StayManager's internal agency id — it's the value that shows up as
    # `agency_id` in every webhook payload, so it's what we match incoming
    # deliveries against (see handle_webhook below). Not the same as firebase_uid.
    integration.staymanager_user_id = profile.get('id')
    integration.staymanager_email = email or profile.get('email')
    integration.status = 'connected'
    integration.last_sync_at = datetime.utcnow()
    integration.sync_error = None
    integration.webhook_secret = secrets.token_urlsafe(32)

    # Step 2: register our webhook (docs section 6 — "immediately after the
    # profile test"). This needs its own api key scope (`webhooks:manage`) and a
    # publicly-resolvable https URL, so it's best-effort: a failure here must not
    # block the connection itself, just leave webhooks unregistered.
    webhook_warning = None
    app_base_url = current_app.config.get('APP_BASE_URL')

    if not app_base_url or not app_base_url.startswith('https://'):
        webhook_warning = (
            "APP_BASE_URL n'est pas configure en https: les webhooks StayManager "
            "ne peuvent pas etre enregistres. Les reservations ne se synchroniseront "
            "qu'a la demande (bouton Synchroniser)."
        )
    else:
        webhook_url = f"{app_base_url}/api/v1/integrations/staymanager/webhook"
        try:
            webhook = client.register_webhook(
                url=webhook_url,
                secret=integration.webhook_secret,
                events=WEBHOOK_EVENTS
            )
            integration.staymanager_webhook_id = webhook.get('id')
            integration.webhook_url = webhook_url
        except StayManagerError as e:
            webhook_warning = f"Webhook non enregistre: {str(e)}"

    if not existing:
        db.session.add(integration)

    db.session.commit()

    response = {
        'message': 'Connexion StayManager reussie',
        'integration': integration.to_dict(include_sensitive=True)
    }
    if webhook_warning:
        response['warning'] = webhook_warning

    return jsonify(response), 201


@staymanager_bp.route('/disconnect', methods=['POST'])
@require_staymanager_feature
def disconnect():
    """Disconnect StayManager account."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'Aucune connexion StayManager trouvee'}), 404

    # Best-effort webhook cleanup: don't block disconnection if this fails
    # (revoked/expired key, network issue, etc.)
    if integration.staymanager_webhook_id and integration.api_key_encrypted:
        try:
            client = StayManagerClient(api_key=integration.api_key_encrypted)
            client.delete_webhook(integration.staymanager_webhook_id)
        except StayManagerError:
            pass

    integration.status = 'disconnected'
    integration.api_key_encrypted = None
    integration.sync_error = None
    integration.staymanager_webhook_id = None
    integration.webhook_url = None
    db.session.commit()

    return jsonify({'message': 'StayManager deconnecte avec succes'})


@staymanager_bp.route('/settings', methods=['PUT'])
@require_staymanager_feature
def update_settings():
    """Update StayManager integration settings."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    data = request.get_json() or {}

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'Aucune connexion StayManager trouvee'}), 404

    if 'auto_sync_enabled' in data:
        integration.auto_sync_enabled = bool(data['auto_sync_enabled'])
    if 'sync_frequency_hours' in data:
        integration.sync_frequency_hours = max(1, min(24, int(data['sync_frequency_hours'])))

    db.session.commit()

    return jsonify({
        'message': 'Parametres mis a jour',
        'integration': integration.to_dict(include_sensitive=True)
    })


# ==================== Properties ====================

@staymanager_bp.route('/properties', methods=['GET'])
@require_staymanager_feature
def list_properties():
    """List linked properties with their StayManager counterparts."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration or integration.status != 'connected':
        return jsonify({'error': 'StayManager non connecte'}), 400

    links = StayManagerPropertyLink.query.filter_by(integration_id=integration.id).all()

    return jsonify({
        'property_links': [link.to_dict() for link in links]
    })


@staymanager_bp.route('/properties/available', methods=['GET'])
@require_staymanager_feature
def list_available_properties():
    """List StayManager properties available for linking."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration or integration.status != 'connected':
        return jsonify({'error': 'StayManager non connecte'}), 400

    try:
        client = StayManagerClient(api_key=integration.api_key_encrypted)
        sm_properties = client.get_properties()
    except StayManagerError as e:
        return jsonify({'error': str(e)}), 500

    # Get already linked property IDs
    linked_ids = set(
        link.staymanager_property_id
        for link in integration.property_links
    )

    # Filter out already linked properties
    available = [p for p in sm_properties if p.get('id') not in linked_ids]

    return jsonify({
        'staymanager_properties': available,
        'linked_count': len(linked_ids)
    })


@staymanager_bp.route('/properties/<int:property_id>/link', methods=['POST'])
@require_staymanager_feature
def link_property(property_id):
    """Link a SemsarOut property to a StayManager property."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    data = request.get_json() or {}

    staymanager_property_id = data.get('staymanager_property_id')
    if not staymanager_property_id:
        return jsonify({'error': 'staymanager_property_id requis'}), 400

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration or integration.status != 'connected':
        return jsonify({'error': 'StayManager non connecte'}), 400

    # Verify property belongs to agency
    property = Property.query.filter_by(id=property_id, agency_id=user.agency_id).first()
    if not property:
        return jsonify({'error': 'Bien non trouve'}), 404

    # Check if already linked
    existing = StayManagerPropertyLink.query.filter_by(
        property_id=property_id
    ).first()
    if existing:
        return jsonify({'error': 'Ce bien est deja lie a StayManager'}), 400

    # Verify StayManager property exists
    try:
        client = StayManagerClient(api_key=integration.api_key_encrypted)
        sm_property = client.get_property(staymanager_property_id)
    except StayManagerError as e:
        return jsonify({'error': f'Propriete StayManager non trouvee: {str(e)}'}), 400

    # Get iCal URL if available
    ical_url = None
    try:
        ical_url = client.get_ical_url(staymanager_property_id)
    except:
        pass

    # Create link
    link = StayManagerPropertyLink(
        integration_id=integration.id,
        property_id=property_id,
        staymanager_property_id=staymanager_property_id,
        staymanager_property_name=sm_property.get('name'),
        ical_url=ical_url,
        sync_status='pending'
    )

    db.session.add(link)
    db.session.commit()

    return jsonify({
        'message': 'Bien lie avec succes',
        'property_link': link.to_dict()
    }), 201


@staymanager_bp.route('/properties/<int:property_id>/unlink', methods=['POST'])
@require_staymanager_feature
def unlink_property(property_id):
    """Unlink a SemsarOut property from StayManager."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'StayManager non connecte'}), 400

    link = StayManagerPropertyLink.query.filter_by(
        integration_id=integration.id,
        property_id=property_id
    ).first()

    if not link:
        return jsonify({'error': 'Lien non trouve'}), 404

    db.session.delete(link)
    db.session.commit()

    return jsonify({'message': 'Lien supprime avec succes'})


@staymanager_bp.route('/properties/<int:property_id>/sync', methods=['POST'])
@require_staymanager_feature
def sync_property(property_id):
    """Trigger sync for a specific property."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration or integration.status != 'connected':
        return jsonify({'error': 'StayManager non connecte'}), 400

    link = StayManagerPropertyLink.query.filter_by(
        integration_id=integration.id,
        property_id=property_id
    ).first()

    if not link:
        return jsonify({'error': 'Lien non trouve'}), 404

    # Create sync log
    sync_log = StayManagerSyncLog(
        integration_id=integration.id,
        property_link_id=link.id,
        sync_type='reservations',
        status='started',
        trigger='manual'
    )
    db.session.add(sync_log)
    link.sync_status = 'syncing'
    db.session.commit()

    try:
        client = StayManagerClient(api_key=integration.api_key_encrypted)
        reservations = client.get_reservations(property_id=link.staymanager_property_id)

        # Process reservations
        items_created = 0
        items_updated = 0

        reservation_list = reservations.get('reservations', reservations) if isinstance(reservations, dict) else reservations

        for res_data in reservation_list:
            existing = StayManagerReservation.query.filter_by(
                staymanager_reservation_id=res_data.get('id')
            ).first()

            if existing:
                # Update existing
                _update_reservation_from_data(existing, res_data)
                items_updated += 1
            else:
                # Create new
                reservation = _create_reservation_from_data(link.id, res_data)
                db.session.add(reservation)
                items_created += 1

        link.last_reservation_sync = datetime.utcnow()
        link.sync_status = 'synced'
        link.sync_error = None

        sync_log.status = 'completed'
        sync_log.items_synced = items_created + items_updated
        sync_log.items_created = items_created
        sync_log.items_updated = items_updated
        sync_log.completed_at = datetime.utcnow()
        sync_log.duration_seconds = int((sync_log.completed_at - sync_log.started_at).total_seconds())

        db.session.commit()

        return jsonify({
            'message': 'Synchronisation terminee',
            'items_created': items_created,
            'items_updated': items_updated
        })

    except StayManagerError as e:
        link.sync_status = 'error'
        link.sync_error = str(e)

        sync_log.status = 'failed'
        sync_log.error_message = str(e)
        sync_log.completed_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'error': str(e)}), 500


# ==================== Reservations ====================

@staymanager_bp.route('/reservations', methods=['GET'])
@require_staymanager_feature
def list_reservations():
    """List synced reservations."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'StayManager non connecte'}), 400

    # Get filter params
    property_id = request.args.get('property_id', type=int)
    status = request.args.get('status')
    upcoming_only = request.args.get('upcoming', 'false').lower() == 'true'

    # Build query
    query = StayManagerReservation.query.join(
        StayManagerPropertyLink
    ).filter(
        StayManagerPropertyLink.integration_id == integration.id
    )

    if property_id:
        query = query.filter(StayManagerPropertyLink.property_id == property_id)

    if status:
        query = query.filter(StayManagerReservation.status == status)

    if upcoming_only:
        query = query.filter(StayManagerReservation.check_in >= datetime.utcnow())

    reservations = query.order_by(StayManagerReservation.check_in.asc()).all()

    return jsonify({
        'reservations': [r.to_dict() for r in reservations]
    })


@staymanager_bp.route('/reservations/<int:reservation_id>', methods=['GET'])
@require_staymanager_feature
def get_reservation(reservation_id):
    """Get reservation details."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'StayManager non connecte'}), 400

    reservation = StayManagerReservation.query.join(
        StayManagerPropertyLink
    ).filter(
        StayManagerReservation.id == reservation_id,
        StayManagerPropertyLink.integration_id == integration.id
    ).first()

    if not reservation:
        return jsonify({'error': 'Reservation non trouvee'}), 404

    return jsonify({'reservation': reservation.to_dict(include_raw=True)})


# ==================== Calendar ====================

@staymanager_bp.route('/calendar/<int:property_id>', methods=['GET'])
@require_staymanager_feature
def get_calendar(property_id):
    """Get availability calendar for a property."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration or integration.status != 'connected':
        return jsonify({'error': 'StayManager non connecte'}), 400

    link = StayManagerPropertyLink.query.filter_by(
        integration_id=integration.id,
        property_id=property_id
    ).first()

    if not link:
        return jsonify({'error': 'Bien non lie a StayManager'}), 404

    start_date = request.args.get('start_date', datetime.utcnow().strftime('%Y-%m-%d'))
    end_date = request.args.get('end_date')

    if not end_date:
        # Default to 3 months ahead
        from dateutil.relativedelta import relativedelta
        end_date = (datetime.utcnow() + relativedelta(months=3)).strftime('%Y-%m-%d')

    try:
        client = StayManagerClient(api_key=integration.api_key_encrypted)
        availability = client.get_availability(
            link.staymanager_property_id,
            start_date,
            end_date
        )
    except StayManagerError as e:
        return jsonify({'error': str(e)}), 500

    # Also include local reservations for the calendar
    reservations = StayManagerReservation.query.filter(
        StayManagerReservation.property_link_id == link.id,
        StayManagerReservation.check_in >= start_date,
        StayManagerReservation.status != 'cancelled'
    ).all()

    return jsonify({
        'availability': availability,
        'reservations': [r.to_dict() for r in reservations],
        'ical_url': link.ical_url
    })


# ==================== Sync Logs ====================

@staymanager_bp.route('/sync-logs', methods=['GET'])
@require_staymanager_feature
def list_sync_logs():
    """List sync operation logs."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    integration = StayManagerIntegration.query.filter_by(agency_id=user.agency_id).first()

    if not integration:
        return jsonify({'error': 'StayManager non connecte'}), 400

    logs = StayManagerSyncLog.query.filter_by(
        integration_id=integration.id
    ).order_by(
        StayManagerSyncLog.started_at.desc()
    ).limit(50).all()

    return jsonify({
        'sync_logs': [log.to_dict() for log in logs]
    })


# ==================== Webhooks ====================

@staymanager_bp.route('/webhook', methods=['POST'])
def handle_webhook():
    """
    Handle incoming webhooks from StayManager (Partner API v1, docs section 6).

    StayManager sends a single `X-Signature` header (HMAC-SHA256 of the raw body,
    keyed with the `webhook_secret` we supplied at registration) — there is no
    separate secret header. The integration is identified by the `agency_id`
    field in the body, which is StayManager's `staymanager_user_id` on our side.
    Handlers must be idempotent: the same event can be re-delivered, and
    reservation.created in particular can also fire from StayManager's own iCal
    sync, not just from calls made through this API.
    """
    raw_body = request.get_data()
    signature = request.headers.get('X-Signature')

    if not signature:
        return jsonify({'error': 'Missing X-Signature header'}), 401

    data = request.get_json(silent=True) or {}
    event_type = data.get('event')
    agency_id = data.get('agency_id')

    if not event_type or event_type not in WEBHOOK_EVENTS:
        return jsonify({'error': 'Unknown or missing event type'}), 400

    if not agency_id:
        return jsonify({'error': 'Missing agency_id'}), 400

    integration = StayManagerIntegration.query.filter_by(
        staymanager_user_id=agency_id
    ).first()

    if not integration or not integration.webhook_secret:
        return jsonify({'error': 'Integration not found'}), 404

    if not StayManagerClient.verify_webhook_signature(
        raw_body, signature, integration.webhook_secret
    ):
        return jsonify({'error': 'Invalid signature'}), 401

    # Process event
    try:
        if event_type == 'reservation.created':
            _handle_reservation_created(integration, data.get('reservation'))
        elif event_type == 'reservation.updated':
            _handle_reservation_updated(integration, data.get('reservation'))
        elif event_type == 'reservation.cancelled':
            _handle_reservation_cancelled(integration, data.get('reservation'))
        elif event_type == 'guest.verified':
            _handle_guest_verified(integration, data.get('guest'), data.get('reservation'))
        elif event_type == 'property.updated':
            _handle_property_updated(integration, data.get('property'))

        db.session.commit()
        return jsonify({'status': 'ok'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ==================== Helper Functions ====================

def _create_reservation_from_data(property_link_id: int, data: dict) -> StayManagerReservation:
    """Create a StayManagerReservation from API data."""
    return StayManagerReservation(
        property_link_id=property_link_id,
        staymanager_reservation_id=data.get('id'),
        external_id=data.get('external_id'),
        platform=data.get('platform'),
        check_in=datetime.fromisoformat(data['check_in'].replace('Z', '+00:00')) if data.get('check_in') else None,
        check_out=datetime.fromisoformat(data['check_out'].replace('Z', '+00:00')) if data.get('check_out') else None,
        nights=data.get('nights'),
        guest_name=data.get('guest_name') or data.get('guest_name_partial'),
        guest_phone=data.get('guest_phone'),
        guest_email=data.get('guest_email'),
        guest_count=data.get('guest_count') or data.get('number_of_guests'),
        staymanager_guest_id=data.get('guest_id'),
        status=data.get('status', 'confirmed'),
        guest_verified=data.get('guest_verified', False),
        verification_status=data.get('verification_status'),
        total_price=data.get('total_price'),
        currency=data.get('currency', 'Dh'),
        guest_notes=data.get('notes'),
        special_requests=data.get('special_requests'),
        raw_data=data,
        synced_at=datetime.utcnow()
    )


def _update_reservation_from_data(reservation: StayManagerReservation, data: dict):
    """Update a StayManagerReservation from API data."""
    reservation.external_id = data.get('external_id', reservation.external_id)
    reservation.platform = data.get('platform', reservation.platform)
    reservation.status = data.get('status', reservation.status)
    reservation.guest_verified = data.get('guest_verified', reservation.guest_verified)
    reservation.verification_status = data.get('verification_status', reservation.verification_status)
    reservation.total_price = data.get('total_price', reservation.total_price)
    reservation.guest_notes = data.get('notes', reservation.guest_notes)
    reservation.special_requests = data.get('special_requests', reservation.special_requests)
    reservation.raw_data = data
    reservation.synced_at = datetime.utcnow()


def _handle_reservation_created(integration: StayManagerIntegration, reservation_data: dict):
    """Handle reservation.created webhook event."""
    if not reservation_data:
        return

    property_id = reservation_data.get('property_id')
    link = StayManagerPropertyLink.query.filter_by(
        integration_id=integration.id,
        staymanager_property_id=property_id
    ).first()

    if not link:
        return

    # Check if already exists
    existing = StayManagerReservation.query.filter_by(
        staymanager_reservation_id=reservation_data.get('id')
    ).first()

    if not existing:
        reservation = _create_reservation_from_data(link.id, reservation_data)
        db.session.add(reservation)


def _handle_reservation_updated(integration: StayManagerIntegration, reservation_data: dict):
    """Handle reservation.updated webhook event."""
    if not reservation_data:
        return

    reservation = StayManagerReservation.query.filter_by(
        staymanager_reservation_id=reservation_data.get('id')
    ).first()

    if reservation:
        _update_reservation_from_data(reservation, reservation_data)


def _handle_reservation_cancelled(integration: StayManagerIntegration, reservation_data: dict):
    """Handle reservation.cancelled webhook event (payload carries a full 'reservation' object)."""
    if not reservation_data:
        return

    reservation = StayManagerReservation.query.filter_by(
        staymanager_reservation_id=reservation_data.get('id')
    ).first()

    if reservation:
        _update_reservation_from_data(reservation, reservation_data)
        reservation.status = 'cancelled'


def _handle_guest_verified(integration: StayManagerIntegration, guest_data: dict, reservation_data: dict):
    """Handle guest.verified webhook event (payload carries 'reservation' and 'guest' objects)."""
    reservation_id = reservation_data.get('id') if reservation_data else None
    guest_id = guest_data.get('id') if guest_data else None

    if reservation_id:
        reservation = StayManagerReservation.query.filter_by(
            staymanager_reservation_id=reservation_id
        ).first()
        if reservation:
            reservation.guest_verified = True
            reservation.verification_status = 'verified'
            reservation.synced_at = datetime.utcnow()
    elif guest_id:
        # No reservation id supplied: mark every cached reservation for this guest
        StayManagerReservation.query.filter_by(
            staymanager_guest_id=guest_id
        ).update({
            'guest_verified': True,
            'verification_status': 'verified',
            'synced_at': datetime.utcnow()
        })


def _handle_property_updated(integration: StayManagerIntegration, property_data: dict):
    """Handle property.updated webhook event."""
    if not property_data:
        return

    link = StayManagerPropertyLink.query.filter_by(
        integration_id=integration.id,
        staymanager_property_id=property_data.get('id')
    ).first()

    if link:
        link.staymanager_property_name = property_data.get('name', link.staymanager_property_name)
