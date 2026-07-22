from datetime import datetime, timedelta
from flask import jsonify
from sqlalchemy import func
from app import db
from app.models import User, Agency, Subscription, SubscriptionPlan
from app.api.v1.admin import admin_bp, require_superadmin


@admin_bp.route('/overview', methods=['GET'])
@require_superadmin
def get_overview():
    total_users = User.query.filter(User.deleted_at.is_(None)).count()
    total_agencies = Agency.query.filter(Agency.deleted_at.is_(None)).count()

    # Active subscriptions grouped by plan slug
    rows = (db.session.query(SubscriptionPlan.slug, func.count(Subscription.id))
            .join(Subscription, Subscription.plan_id == SubscriptionPlan.id)
            .filter(Subscription.status == 'active')
            .group_by(SubscriptionPlan.slug).all())
    active_subscriptions = {slug: count for slug, count in rows}

    # MRR: monthly-normalized amount of active subscriptions
    active = Subscription.query.filter(Subscription.status == 'active').all()
    mrr = 0.0
    for s in active:
        amt = float(s.amount or 0)
        mrr += amt / 12.0 if s.billing_cycle == 'yearly' else amt

    since = datetime.utcnow() - timedelta(days=30)
    signups_last_30d = User.query.filter(User.created_at >= since).count()
    suspended_count = (User.query.filter(User.is_suspended.is_(True)).count()
                       + Agency.query.filter(Agency.is_suspended.is_(True)).count())
    deleted_pending = (User.query.filter(User.deleted_at.isnot(None),
                                         User.anonymized_at.is_(None)).count()
                       + Agency.query.filter(Agency.deleted_at.isnot(None),
                                             Agency.anonymized_at.is_(None)).count())

    return jsonify({
        'total_users': total_users,
        'total_agencies': total_agencies,
        'active_subscriptions': active_subscriptions,
        'mrr_estimate': round(mrr, 2),
        'signups_last_30d': signups_last_30d,
        'suspended_count': suspended_count,
        'deleted_pending_purge_count': deleted_pending,
    })
