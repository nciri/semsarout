from flask import jsonify, request, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from functools import wraps
from datetime import datetime, timedelta
from sqlalchemy import func, and_
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.models import (
    Property, Lead, Client, Visit, Transaction, User, Agency,
    ActivityLog, SALE_STAGES, RENT_STAGES
)


def require_auth(f):
    """Require a valid JWT and load the authenticated user into g.

    L'identité provient du token (get_jwt_identity), jamais d'un en-tête
    fourni par le client : impossible d'usurper un autre utilisateur.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({'error': 'Authorization required'}), 401

        identity = get_jwt_identity()
        g.current_user = User.query.get(int(identity)) if identity else None
        if not g.current_user:
            return jsonify({'error': 'Invalid token'}), 401
        g.agency_id = g.current_user.agency_id

        return f(*args, **kwargs)
    return decorated


@backoffice_bp.route('/dashboard', methods=['GET'])
@require_auth
def get_dashboard():
    """Get dashboard KPIs and summary data."""
    agency_id = g.agency_id

    # Date ranges
    today = datetime.utcnow().date()
    start_of_month = today.replace(day=1)
    start_of_week = today - timedelta(days=today.weekday())
    last_month_start = (start_of_month - timedelta(days=1)).replace(day=1)

    # Base query filters
    agency_filter = Property.agency_id == agency_id if agency_id else True

    # Properties stats
    properties_query = Property.query.filter(agency_filter)
    total_properties = properties_query.count()
    active_properties = properties_query.filter(Property.status == 'active').count()
    draft_properties = properties_query.filter(Property.status == 'draft').count()
    sold_this_month = properties_query.filter(
        Property.status == 'sold',
        Property.updated_at >= start_of_month
    ).count()

    # Leads stats
    lead_filter = Lead.agency_id == agency_id if agency_id else True
    leads_query = Lead.query.filter(lead_filter)
    total_leads = leads_query.count()
    new_leads = leads_query.filter(Lead.status == 'new').count()
    leads_this_month = leads_query.filter(Lead.created_at >= start_of_month).count()
    leads_this_week = leads_query.filter(Lead.created_at >= datetime.combine(start_of_week, datetime.min.time())).count()

    # Clients stats
    client_filter = Client.agency_id == agency_id if agency_id else True
    clients_query = Client.query.filter(client_filter)
    total_clients = clients_query.count()
    active_clients = clients_query.filter(Client.status == 'active').count()
    new_clients_this_month = clients_query.filter(Client.created_at >= start_of_month).count()

    # Visits stats
    visit_filter = Visit.agency_id == agency_id if agency_id else True
    visits_query = Visit.query.filter(visit_filter)
    visits_today = visits_query.filter(
        func.date(Visit.scheduled_at) == today
    ).count()
    visits_this_week = visits_query.filter(
        Visit.scheduled_at >= datetime.combine(start_of_week, datetime.min.time()),
        Visit.scheduled_at < datetime.combine(start_of_week + timedelta(days=7), datetime.min.time())
    ).count()
    pending_visits = visits_query.filter(Visit.status.in_(['scheduled', 'confirmed'])).count()

    # Transactions stats
    tx_filter = Transaction.agency_id == agency_id if agency_id else True
    transactions_query = Transaction.query.filter(tx_filter)
    active_transactions = transactions_query.filter(Transaction.status == 'active').count()
    won_this_month = transactions_query.filter(
        Transaction.status == 'won',
        Transaction.closed_at >= start_of_month
    ).count()

    # Revenue calculation (commissions from won transactions)
    revenue_this_month = db.session.query(
        func.sum(Transaction.commission_amount)
    ).filter(
        tx_filter,
        Transaction.status == 'won',
        Transaction.closed_at >= start_of_month
    ).scalar() or 0

    # Pipeline value (potential revenue from active deals)
    pipeline_value = db.session.query(
        func.sum(Transaction.asking_price * Transaction.commission_rate / 100)
    ).filter(
        tx_filter,
        Transaction.status == 'active'
    ).scalar() or 0

    # Recent activity
    recent_leads = Lead.query.filter(lead_filter).order_by(
        Lead.created_at.desc()
    ).limit(5).all()

    recent_visits = Visit.query.filter(visit_filter).filter(
        Visit.scheduled_at >= datetime.utcnow()
    ).order_by(Visit.scheduled_at.asc()).limit(5).all()

    # Conversion rates
    total_leads_last_month = Lead.query.filter(
        lead_filter,
        Lead.created_at >= last_month_start,
        Lead.created_at < start_of_month
    ).count()
    converted_last_month = Lead.query.filter(
        lead_filter,
        Lead.status == 'converted',
        Lead.converted_at >= last_month_start,
        Lead.converted_at < start_of_month
    ).count()
    conversion_rate = (converted_last_month / total_leads_last_month * 100) if total_leads_last_month > 0 else 0

    return jsonify({
        'properties': {
            'total': total_properties,
            'active': active_properties,
            'draft': draft_properties,
            'sold_this_month': sold_this_month
        },
        'leads': {
            'total': total_leads,
            'new': new_leads,
            'this_month': leads_this_month,
            'this_week': leads_this_week,
            'conversion_rate': round(conversion_rate, 1)
        },
        'clients': {
            'total': total_clients,
            'active': active_clients,
            'new_this_month': new_clients_this_month
        },
        'visits': {
            'today': visits_today,
            'this_week': visits_this_week,
            'pending': pending_visits
        },
        'transactions': {
            'active': active_transactions,
            'won_this_month': won_this_month,
            'pipeline_value': float(pipeline_value)
        },
        'revenue': {
            'this_month': float(revenue_this_month)
        },
        'recent_leads': [l.to_dict() for l in recent_leads],
        'upcoming_visits': [v.to_dict() for v in recent_visits]
    })


@backoffice_bp.route('/dashboard/charts/leads-by-source', methods=['GET'])
@require_auth
def get_leads_by_source():
    """Get leads grouped by source for chart."""
    agency_id = g.agency_id
    agency_filter = Lead.agency_id == agency_id if agency_id else True

    # Get date range from query params
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)

    results = db.session.query(
        Lead.source,
        func.count(Lead.id)
    ).filter(
        agency_filter,
        Lead.created_at >= start_date
    ).group_by(Lead.source).all()

    return jsonify({
        'data': [{'source': r[0], 'count': r[1]} for r in results]
    })


@backoffice_bp.route('/dashboard/charts/properties-by-status', methods=['GET'])
@require_auth
def get_properties_by_status():
    """Get properties grouped by status for chart."""
    agency_id = g.agency_id
    agency_filter = Property.agency_id == agency_id if agency_id else True

    results = db.session.query(
        Property.status,
        func.count(Property.id)
    ).filter(agency_filter).group_by(Property.status).all()

    return jsonify({
        'data': [{'status': r[0], 'count': r[1]} for r in results]
    })


@backoffice_bp.route('/dashboard/charts/revenue-trend', methods=['GET'])
@require_auth
def get_revenue_trend():
    """Get monthly revenue trend."""
    agency_id = g.agency_id
    tx_filter = Transaction.agency_id == agency_id if agency_id else True

    # Last 12 months
    results = []
    for i in range(11, -1, -1):
        date = datetime.utcnow() - timedelta(days=i*30)
        month_start = date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if date.month == 12:
            month_end = month_start.replace(year=date.year+1, month=1)
        else:
            month_end = month_start.replace(month=date.month+1)

        revenue = db.session.query(
            func.sum(Transaction.commission_amount)
        ).filter(
            tx_filter,
            Transaction.status == 'won',
            Transaction.closed_at >= month_start,
            Transaction.closed_at < month_end
        ).scalar() or 0

        results.append({
            'month': month_start.strftime('%Y-%m'),
            'revenue': float(revenue)
        })

    return jsonify({'data': results})


@backoffice_bp.route('/dashboard/activity', methods=['GET'])
@require_auth
def get_activity_feed():
    """Get recent activity feed."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = ActivityLog.query
    if agency_id:
        query = query.filter(ActivityLog.agency_id == agency_id)

    pagination = query.order_by(ActivityLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'activities': [a.to_dict() for a in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })
