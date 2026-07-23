from datetime import datetime, timedelta
from flask import jsonify, request, g
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Agency, Transaction, User
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


def _txn_base(agency, scope, start):
    q = Transaction.query.filter(Transaction.agency_id == agency.id)
    if not scope['all']:
        q = q.filter(Transaction.agent_id == scope['agent_id'])
    return q


def _commission_estimate(t):
    if t.commission_amount:
        return float(t.commission_amount)
    if t.asking_price and t.commission_rate:
        return float(t.asking_price) * float(t.commission_rate) / 100.0
    return 0.0


@backoffice_bp.route('/analytics/financial', methods=['GET'])
@require_auth
def analytics_financial():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    rng = request.args.get('range', '12m')
    start = _range_start(rng)

    base = _txn_base(agency, scope, start)
    won = base.filter(Transaction.status == 'won', Transaction.closing_date >= start).all()
    lost = base.filter(Transaction.status == 'lost').all()
    open_deals = base.filter(Transaction.status == 'active').all()

    revenue_realized = sum(float(t.commission_amount or 0) for t in won)
    revenue_weighted = sum(_commission_estimate(t) * stage_probability(t) for t in open_deals)
    final_prices = [float(t.final_price) for t in won if t.final_price]
    avg_deal = round(sum(final_prices) / len(final_prices), 2) if final_prices else 0
    cycles = [(t.closing_date - t.contact_date).days for t in won if t.closing_date and t.contact_date]
    avg_cycle = round(sum(cycles) / len(cycles), 1) if cycles else 0

    # Monthly series (last 12 months)
    def month_key(dt):
        return dt.strftime('%Y-%m')
    months = {}
    for t in won:
        if t.closing_date:
            months.setdefault(month_key(t.closing_date), 0.0)
            months[month_key(t.closing_date)] += float(t.commission_amount or 0)
    revenue_trend = [{'month': k, 'realized': round(v, 2)} for k, v in sorted(months.items())]

    # Commission by agent (agency view) — join agent names
    comm_by_agent = {}
    for t in won:
        comm_by_agent.setdefault(t.agent_id, 0.0)
        comm_by_agent[t.agent_id] += float(t.commission_amount or 0)
    agent_rows = []
    for aid, amount in comm_by_agent.items():
        agent = User.query.get(aid)
        agent_rows.append({'agent_id': aid, 'agent': agent.full_name if agent else '—', 'commission': round(amount, 2)})
    agent_rows.sort(key=lambda r: r['commission'], reverse=True)

    win_loss = {}
    for t in won:
        if t.closing_date:
            win_loss.setdefault(month_key(t.closing_date), {'won': 0, 'lost': 0})
            win_loss[month_key(t.closing_date)]['won'] += 1
    for t in lost:
        d = t.closed_at or t.updated_at
        if d:
            win_loss.setdefault(month_key(d), {'won': 0, 'lost': 0})
            win_loss[month_key(d)]['lost'] += 1
    win_loss_by_month = [{'month': k, **v} for k, v in sorted(win_loss.items())]

    by_type = {}
    for t in won:
        by_type.setdefault(t.transaction_type or 'autre', 0.0)
        by_type[t.transaction_type or 'autre'] += float(t.commission_amount or 0)
    deals_by_type = [{'type': k, 'commission': round(v, 2)} for k, v in by_type.items()]

    return jsonify({
        'summary': {
            'revenue_realized': round(revenue_realized, 2),
            'revenue_pipeline_weighted': round(revenue_weighted, 2),
            'deals_won': len(won), 'deals_lost': len(lost),
            'avg_deal_size': avg_deal, 'avg_sales_cycle_days': avg_cycle,
        },
        'detail': {
            'revenue_trend': revenue_trend,
            'commission_by_agent': agent_rows,
            'commission_by_month': revenue_trend,
            'win_loss_by_month': win_loss_by_month,
            'deals_by_type': deals_by_type,
        },
    })
