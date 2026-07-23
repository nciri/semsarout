from datetime import datetime, timedelta
from flask import jsonify, request, g
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Agency
from app.services.analytics_scope import analytics_scope

STAGE_PROBABILITY = {
    'contact': 0.10, 'visit': 0.40, 'offer': 0.60, 'negotiation': 0.70,
    'application': 0.40, 'verification': 0.55, 'compromise': 0.85,
    'lease': 0.85, 'final_act': 0.95, 'move_in': 0.95,
}


def _range_start(range_str):
    now = datetime.utcnow()
    if range_str == '30d':
        return now - timedelta(days=30)
    if range_str == '90d':
        return now - timedelta(days=90)
    if range_str == 'ytd':
        return datetime(now.year, 1, 1)
    return now - timedelta(days=365)  # 12m default


def stage_probability(txn):
    if txn.status == 'won':
        return 1.0
    if txn.status == 'lost':
        return 0.0
    return STAGE_PROBABILITY.get(txn.stage, 0.2)


def current_scope():
    """(agency, scope) for the authed user, or (None, None)."""
    agency = Agency.query.get(g.agency_id) if g.agency_id else None
    if not agency:
        return None, None
    return agency, analytics_scope(g.current_user, agency)


@backoffice_bp.route('/analytics/ping', methods=['GET'])
@require_auth
def analytics_ping():
    agency, scope = current_scope()
    return jsonify({'ok': True, 'scope': scope})
