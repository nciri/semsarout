from datetime import datetime, timedelta
from flask import jsonify, request, g
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Agency, Transaction, User, Property, NeighborhoodPriceRef, Lead
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
    lost = base.filter(
        Transaction.status == 'lost',
        db.func.coalesce(Transaction.closed_at, Transaction.updated_at) >= start,
    ).all()
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
    agents_map = {}
    if comm_by_agent:
        agents_map = {u.id: u for u in User.query.filter(User.id.in_(comm_by_agent.keys())).all()}
    agent_rows = []
    for aid, amount in comm_by_agent.items():
        agent = agents_map.get(aid)
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


def _prop_base(agency, scope):
    q = Property.query.filter(Property.agency_id == agency.id)
    if not scope['all']:
        q = q.filter(Property.owner_id == scope['agent_id'])
    return q


@backoffice_bp.route('/analytics/market', methods=['GET'])
@require_auth
def analytics_market():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    start = _range_start(request.args.get('range', '12m'))

    active = _prop_base(agency, scope).filter(Property.status == 'active').all()
    # Absorbed = terminal states (sale closed OR rental signed)
    sold = _prop_base(agency, scope).filter(Property.status.in_(['sold', 'rented'])).all()

    ppsqm = [float(p.price_per_sqm) for p in active if p.price_per_sqm]
    portfolio_avg = round(sum(ppsqm) / len(ppsqm), 2) if ppsqm else 0

    # Market reference weighted by the portfolio's neighborhoods
    market_vals = []
    for p in active:
        ref = NeighborhoodPriceRef.query.filter_by(city=p.city, neighborhood=p.neighborhood).first()
        if ref and ref.avg_price_sqm:
            market_vals.append(float(ref.avg_price_sqm))
    market_avg = round(sum(market_vals) / len(market_vals), 2) if market_vals else 0
    price_gap = round((portfolio_avg - market_avg) / market_avg * 100, 1) if market_avg else 0

    now = datetime.utcnow()
    doms = [(now - (p.published_at or p.created_at)).days for p in active if (p.published_at or p.created_at)]
    avg_dom = round(sum(doms) / len(doms), 1) if doms else 0
    absorption = round(len(sold) / (len(sold) + len(active)), 3) if (len(sold) + len(active)) else 0

    by_nb = {}
    for p in active:
        key = f"{p.city} · {p.neighborhood or '—'}"
        by_nb.setdefault(key, {'portfolio': [], 'market': None})
        if p.price_per_sqm:
            by_nb[key]['portfolio'].append(float(p.price_per_sqm))
        ref = NeighborhoodPriceRef.query.filter_by(city=p.city, neighborhood=p.neighborhood).first()
        if ref:
            by_nb[key]['market'] = float(ref.avg_price_sqm)
    price_sqm_by_neighborhood = [
        {'area': k, 'portfolio': round(sum(v['portfolio']) / len(v['portfolio']), 2) if v['portfolio'] else 0,
         'market': v['market'] or 0}
        for k, v in by_nb.items()
    ]

    buckets = {'0-30j': 0, '31-60j': 0, '61-90j': 0, '90j+': 0}
    for d in doms:
        if d <= 30: buckets['0-30j'] += 1
        elif d <= 60: buckets['31-60j'] += 1
        elif d <= 90: buckets['61-90j'] += 1
        else: buckets['90j+'] += 1
    days_on_market_distribution = [{'bucket': k, 'count': v} for k, v in buckets.items()]

    val_by_city = {}
    for p in active:
        val_by_city.setdefault(p.city, 0.0)
        val_by_city[p.city] += float(p.price or 0)
    portfolio_valuation_by_city = [{'city': k, 'value': round(v, 2)} for k, v in val_by_city.items()]

    status_counts = {}
    for p in _prop_base(agency, scope).all():
        status_counts.setdefault(p.status, 0)
        status_counts[p.status] += 1
    inventory_by_status = [{'status': k, 'count': v} for k, v in status_counts.items()]

    return jsonify({
        'summary': {
            'portfolio_avg_price_sqm': portfolio_avg, 'market_avg_price_sqm': market_avg,
            'price_gap_pct': price_gap, 'avg_days_on_market': avg_dom, 'absorption_rate': absorption,
        },
        'detail': {
            'price_sqm_by_neighborhood': price_sqm_by_neighborhood,
            'days_on_market_distribution': days_on_market_distribution,
            'portfolio_valuation_by_city': portfolio_valuation_by_city,
            'inventory_by_status': inventory_by_status,
        },
    })


@backoffice_bp.route('/analytics/pipeline', methods=['GET'])
@require_auth
def analytics_pipeline():
    agency, scope = current_scope()
    if not agency:
        return jsonify({'error': 'Aucune agence'}), 400
    start = _range_start(request.args.get('range', '12m'))

    lead_q = Lead.query.filter(Lead.agency_id == agency.id, Lead.created_at >= start)
    if not scope['all']:
        lead_q = lead_q.filter(Lead.assigned_to_id == scope['agent_id'])
    leads = lead_q.all()
    n_leads = len(leads)
    n_qualified = sum(1 for l in leads if l.qualified_at)

    txn_q = _txn_base(agency, scope, start)
    open_txn = txn_q.filter(Transaction.status == 'active').all()
    won_txn = txn_q.filter(Transaction.status == 'won', Transaction.closing_date >= start).all()
    txn_pool = open_txn + won_txn
    reached_visit = sum(1 for t in txn_pool if t.visit_date or t.offer_date or t.closing_date or t.status == 'won')
    reached_offer = sum(1 for t in txn_pool if t.offer_date or t.closing_date or t.status == 'won')
    closed = len(won_txn)

    # Cap each stage at the previous so the funnel is non-increasing.
    n_qualified = min(n_qualified, n_leads)
    n_visits = min(reached_visit, n_qualified)
    n_offers = min(reached_offer, n_visits)
    n_closed = min(closed, n_offers)

    conversion = min(100.0, round(n_closed / n_leads * 100, 1)) if n_leads else 0
    pipeline_value_open = round(sum(_commission_estimate(t) for t in open_txn), 2)

    now = datetime.utcnow()
    soon = now + timedelta(days=30)
    exp = [t for t in open_txn if t.expected_closing_date and now <= t.expected_closing_date <= soon]
    expected_30d = {'count': len(exp), 'value': round(sum(_commission_estimate(t) for t in exp), 2)}

    funnel = {'leads': n_leads, 'qualified': n_qualified, 'visits': n_visits, 'offers': n_offers, 'closed': n_closed}
    funnel_stages = [{'stage': k, 'count': v} for k, v in
                     [('Leads', n_leads), ('Qualifiés', n_qualified), ('Visites', n_visits),
                      ('Offres', n_offers), ('Clôturés', n_closed)]]

    def conv(a, b):
        return min(100.0, round(b / a * 100, 1)) if a else 0
    conversion_by_stage = [
        {'from': 'Leads→Qualifiés', 'pct': conv(n_leads, n_qualified)},
        {'from': 'Qualifiés→Visites', 'pct': conv(n_qualified, n_visits)},
        {'from': 'Visites→Offres', 'pct': conv(n_visits, n_offers)},
        {'from': 'Offres→Clôturés', 'pct': conv(n_offers, n_closed)},
    ]

    # Stage velocity: avg days between consecutive funnel dates on won deals
    def avg_days(pairs):
        vals = [(b - a).days for a, b in pairs if a and b and (b - a).days >= 0]
        return round(sum(vals) / len(vals), 1) if vals else 0
    stage_velocity_days = [
        {'stage': 'Contact→Visite', 'days': avg_days([(t.contact_date, t.visit_date) for t in won_txn])},
        {'stage': 'Visite→Offre', 'days': avg_days([(t.visit_date, t.offer_date) for t in won_txn])},
        {'stage': 'Offre→Clôture', 'days': avg_days([(t.offer_date, t.closing_date) for t in won_txn])},
    ]

    tl = {}
    for t in exp:
        k = t.expected_closing_date.strftime('%Y-%m-%d')
        tl.setdefault(k, 0.0)
        tl[k] += _commission_estimate(t)
    expected_closings_timeline = [{'date': k, 'value': round(v, 2)} for k, v in sorted(tl.items())]

    return jsonify({
        'summary': {'funnel': funnel, 'conversion_overall_pct': conversion,
                    'expected_closings_30d': expected_30d, 'pipeline_value_open': pipeline_value_open},
        'detail': {'funnel_stages': funnel_stages, 'conversion_by_stage': conversion_by_stage,
                   'stage_velocity_days': stage_velocity_days,
                   'expected_closings_timeline': expected_closings_timeline},
    })
