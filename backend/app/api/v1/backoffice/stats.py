from flask import jsonify, request, g
from datetime import datetime, timedelta
from sqlalchemy import func, and_
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Property, Lead, Client, Visit, Transaction, User


@backoffice_bp.route('/stats/overview', methods=['GET'])
@require_auth
def get_overview_stats():
    """Get overview statistics for dashboard."""
    agency_id = g.agency_id
    period = request.args.get('period', '30')  # days

    try:
        days = int(period)
    except ValueError:
        days = 30

    start_date = datetime.utcnow() - timedelta(days=days)
    prev_start_date = start_date - timedelta(days=days)

    # Helper for agency filtering
    def with_agency(query, model):
        if agency_id and hasattr(model, 'agency_id'):
            return query.filter(model.agency_id == agency_id)
        return query

    # Current period counts
    properties_current = with_agency(
        Property.query.filter(Property.created_at >= start_date), Property
    ).count()

    leads_current = with_agency(
        Lead.query.filter(Lead.created_at >= start_date), Lead
    ).count()

    clients_current = with_agency(
        Client.query.filter(Client.created_at >= start_date), Client
    ).count()

    visits_current = with_agency(
        Visit.query.filter(Visit.created_at >= start_date), Visit
    ).count()

    # Previous period for comparison
    properties_prev = with_agency(
        Property.query.filter(
            Property.created_at >= prev_start_date,
            Property.created_at < start_date
        ), Property
    ).count()

    leads_prev = with_agency(
        Lead.query.filter(
            Lead.created_at >= prev_start_date,
            Lead.created_at < start_date
        ), Lead
    ).count()

    clients_prev = with_agency(
        Client.query.filter(
            Client.created_at >= prev_start_date,
            Client.created_at < start_date
        ), Client
    ).count()

    visits_prev = with_agency(
        Visit.query.filter(
            Visit.created_at >= prev_start_date,
            Visit.created_at < start_date
        ), Visit
    ).count()

    def calc_change(current, previous):
        if previous == 0:
            return 100 if current > 0 else 0
        return round((current - previous) / previous * 100, 1)

    return jsonify({
        'period_days': days,
        'properties': {
            'count': properties_current,
            'change': calc_change(properties_current, properties_prev)
        },
        'leads': {
            'count': leads_current,
            'change': calc_change(leads_current, leads_prev)
        },
        'clients': {
            'count': clients_current,
            'change': calc_change(clients_current, clients_prev)
        },
        'visits': {
            'count': visits_current,
            'change': calc_change(visits_current, visits_prev)
        }
    })


@backoffice_bp.route('/stats/agent-performance', methods=['GET'])
@require_auth
def get_agent_performance():
    """Get performance stats by agent."""
    agency_id = g.agency_id
    period = request.args.get('period', '30')

    try:
        days = int(period)
    except ValueError:
        days = 30

    start_date = datetime.utcnow() - timedelta(days=days)

    # Build query for agency users
    users_query = User.query.filter(User.user_type == 'professional')
    if agency_id:
        users_query = users_query.filter(User.agency_id == agency_id)

    agents = users_query.all()

    performance = []
    for agent in agents:
        # Properties created
        properties_created = Property.query.filter(
            Property.owner_id == agent.id,
            Property.created_at >= start_date
        ).count()

        # Visits conducted
        visits_completed = Visit.query.filter(
            Visit.agent_id == agent.id,
            Visit.status == 'completed',
            Visit.completed_at >= start_date
        ).count()

        # Transactions closed
        transactions_won = Transaction.query.filter(
            Transaction.agent_id == agent.id,
            Transaction.status == 'won',
            Transaction.closed_at >= start_date
        ).count()

        # Commission earned
        commission = db.session.query(
            func.sum(Transaction.commission_amount)
        ).filter(
            Transaction.agent_id == agent.id,
            Transaction.status == 'won',
            Transaction.closed_at >= start_date
        ).scalar() or 0

        # Active clients
        active_clients = Client.query.filter(
            Client.assigned_to_id == agent.id,
            Client.status == 'active'
        ).count()

        performance.append({
            'agent_id': agent.id,
            'agent_name': agent.full_name,
            'avatar_url': agent.avatar_url,
            'properties_created': properties_created,
            'visits_completed': visits_completed,
            'transactions_won': transactions_won,
            'commission_earned': float(commission),
            'active_clients': active_clients
        })

    # Sort by transactions won
    performance.sort(key=lambda x: x['transactions_won'], reverse=True)

    return jsonify({'agents': performance})


@backoffice_bp.route('/stats/conversion-funnel', methods=['GET'])
@require_auth
def get_conversion_funnel():
    """Get conversion funnel statistics."""
    agency_id = g.agency_id
    period = request.args.get('period', '30')

    try:
        days = int(period)
    except ValueError:
        days = 30

    start_date = datetime.utcnow() - timedelta(days=days)

    # Build filters
    lead_filter = Lead.created_at >= start_date
    if agency_id:
        lead_filter = and_(lead_filter, Lead.agency_id == agency_id)

    # Funnel stages
    total_leads = Lead.query.filter(lead_filter).count()

    contacted_leads = Lead.query.filter(
        lead_filter,
        Lead.status.in_(['contacted', 'qualified', 'converted'])
    ).count()

    qualified_leads = Lead.query.filter(
        lead_filter,
        Lead.status.in_(['qualified', 'converted'])
    ).count()

    converted_leads = Lead.query.filter(
        lead_filter,
        Lead.status == 'converted'
    ).count()

    # Visits
    visit_filter = Visit.created_at >= start_date
    if agency_id:
        visit_filter = and_(visit_filter, Visit.agency_id == agency_id)

    total_visits = Visit.query.filter(visit_filter).count()
    completed_visits = Visit.query.filter(
        visit_filter,
        Visit.status == 'completed'
    ).count()

    # Transactions
    tx_filter = Transaction.created_at >= start_date
    if agency_id:
        tx_filter = and_(tx_filter, Transaction.agency_id == agency_id)

    total_transactions = Transaction.query.filter(tx_filter).count()
    won_transactions = Transaction.query.filter(
        tx_filter,
        Transaction.status == 'won'
    ).count()

    return jsonify({
        'funnel': [
            {'stage': 'Leads', 'count': total_leads},
            {'stage': 'Contactés', 'count': contacted_leads},
            {'stage': 'Qualifiés', 'count': qualified_leads},
            {'stage': 'Convertis', 'count': converted_leads}
        ],
        'visits': {
            'total': total_visits,
            'completed': completed_visits,
            'rate': round(completed_visits / total_visits * 100, 1) if total_visits > 0 else 0
        },
        'transactions': {
            'total': total_transactions,
            'won': won_transactions,
            'rate': round(won_transactions / total_transactions * 100, 1) if total_transactions > 0 else 0
        }
    })


@backoffice_bp.route('/stats/properties-by-city', methods=['GET'])
@require_auth
def get_properties_by_city():
    """Get property distribution by city."""
    agency_id = g.agency_id

    query = db.session.query(
        Property.city,
        func.count(Property.id),
        func.avg(Property.price)
    )

    if agency_id:
        query = query.filter(Property.agency_id == agency_id)

    results = query.filter(
        Property.status == 'active'
    ).group_by(Property.city).order_by(func.count(Property.id).desc()).limit(10).all()

    return jsonify({
        'cities': [
            {
                'city': r[0],
                'count': r[1],
                'avg_price': float(r[2]) if r[2] else 0
            }
            for r in results
        ]
    })


@backoffice_bp.route('/stats/price-distribution', methods=['GET'])
@require_auth
def get_price_distribution():
    """Get property price distribution."""
    agency_id = g.agency_id
    transaction_type = request.args.get('type', 'sale')

    query = Property.query.filter(
        Property.status == 'active',
        Property.transaction_type == transaction_type
    )

    if agency_id:
        query = query.filter(Property.agency_id == agency_id)

    properties = query.all()

    # Define price ranges
    if transaction_type == 'sale':
        ranges = [
            (0, 500000, '< 500K'),
            (500000, 1000000, '500K - 1M'),
            (1000000, 2000000, '1M - 2M'),
            (2000000, 5000000, '2M - 5M'),
            (5000000, float('inf'), '> 5M')
        ]
    else:  # rent
        ranges = [
            (0, 3000, '< 3K'),
            (3000, 5000, '3K - 5K'),
            (5000, 10000, '5K - 10K'),
            (10000, 20000, '10K - 20K'),
            (20000, float('inf'), '> 20K')
        ]

    distribution = []
    for min_price, max_price, label in ranges:
        count = sum(1 for p in properties if min_price <= float(p.price) < max_price)
        distribution.append({'range': label, 'count': count})

    return jsonify({'distribution': distribution})


@backoffice_bp.route('/stats/export', methods=['GET'])
@require_auth
def export_stats():
    """Export statistics to CSV."""
    agency_id = g.agency_id
    export_type = request.args.get('type', 'properties')  # properties, clients, transactions

    import csv
    from io import StringIO
    from flask import Response

    output = StringIO()
    writer = csv.writer(output)

    if export_type == 'properties':
        # Headers
        writer.writerow([
            'Reference', 'Title', 'Type', 'Transaction', 'Price', 'City',
            'Surface', 'Rooms', 'Status', 'Views', 'Created At'
        ])

        query = Property.query
        if agency_id:
            query = query.filter(Property.agency_id == agency_id)

        for p in query.all():
            writer.writerow([
                p.reference, p.title, p.property_type, p.transaction_type,
                float(p.price), p.city, p.surface, p.rooms, p.status,
                p.views_count, p.created_at.strftime('%Y-%m-%d')
            ])

    elif export_type == 'clients':
        writer.writerow([
            'Name', 'Email', 'Phone', 'Type', 'Status', 'Source',
            'City', 'Created At'
        ])

        query = Client.query
        if agency_id:
            query = query.filter(Client.agency_id == agency_id)

        for c in query.all():
            writer.writerow([
                c.full_name, c.email, c.phone, c.client_type, c.status,
                c.source, c.city, c.created_at.strftime('%Y-%m-%d')
            ])

    elif export_type == 'transactions':
        writer.writerow([
            'Reference', 'Type', 'Stage', 'Status', 'Asking Price',
            'Final Price', 'Commission', 'Agent', 'Created At'
        ])

        query = Transaction.query
        if agency_id:
            query = query.filter(Transaction.agency_id == agency_id)

        for t in query.all():
            writer.writerow([
                t.reference, t.transaction_type, t.stage, t.status,
                float(t.asking_price) if t.asking_price else '',
                float(t.final_price) if t.final_price else '',
                float(t.commission_amount) if t.commission_amount else '',
                t.agent.full_name if t.agent else '',
                t.created_at.strftime('%Y-%m-%d')
            ])

    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename={export_type}_{datetime.utcnow().strftime("%Y%m%d")}.csv'
        }
    )
