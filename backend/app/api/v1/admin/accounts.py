from flask import jsonify, request
from sqlalchemy import or_
from app.models import User, Agency, Property, ActivityLog
from app.api.v1.admin import admin_bp, require_superadmin


def _user_row(u):
    return {
        'kind': 'user', 'id': u.id, 'name': u.full_name, 'email': u.email,
        'status': u.moderation_state(), 'plan': None,
        'last_login': u.last_login.isoformat() if u.last_login else None,
        'listings_count': Property.query.filter_by(owner_id=u.id).count(),
    }


def _agency_row(a):
    sub = a.subscription
    return {
        'kind': 'agency', 'id': a.id, 'name': a.name,
        'email': getattr(a, 'email', None), 'status': a.moderation_state(),
        'plan': sub.plan.slug if sub and sub.plan else None,
        'last_login': None,
        'listings_count': Property.query.filter_by(agency_id=a.id).count(),
    }


@admin_bp.route('/accounts', methods=['GET'])
@require_superadmin
def list_accounts():
    kind = request.args.get('type')          # 'user' | 'agency' | None(both)
    status = request.args.get('status')       # 'active'|'suspended'|'deleted'
    q = request.args.get('q', '').strip()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    rows = []
    if kind in (None, 'user'):
        uq = User.query
        if q:
            uq = uq.filter(or_(User.email.ilike(f'%{q}%'),
                               User.first_name.ilike(f'%{q}%'),
                               User.last_name.ilike(f'%{q}%')))
        rows += [_user_row(u) for u in uq.all()]
    if kind in (None, 'agency'):
        aq = Agency.query
        if q:
            aq = aq.filter(Agency.name.ilike(f'%{q}%'))
        rows += [_agency_row(a) for a in aq.all()]

    if status:
        rows = [r for r in rows if r['status'] == status]
    if request.args.get('plan'):
        rows = [r for r in rows if r['plan'] == request.args.get('plan')]

    rows.sort(key=lambda r: (r['name'] or '').lower())
    total = len(rows)
    start = (page - 1) * per_page
    items = rows[start:start + per_page]
    pages = (total + per_page - 1) // per_page if per_page else 1
    return jsonify({'items': items, 'total': total, 'page': page, 'pages': pages})


def _activity_for(entity_type, entity_id, limit=30):
    logs = (ActivityLog.query
            .filter(ActivityLog.entity_type == entity_type,
                    ActivityLog.entity_id == entity_id)
            .order_by(ActivityLog.created_at.desc()).limit(limit).all())
    return [l.to_dict() for l in logs]


@admin_bp.route('/accounts/users/<int:user_id>', methods=['GET'])
@require_superadmin
def user_detail(user_id):
    u = User.query.get(user_id)
    if not u:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'user': u.to_dict(),
        'agency': u.agency.to_dict() if u.agency else None,
        'listings_count': Property.query.filter_by(owner_id=u.id).count(),
        'activity': _activity_for('user', u.id),
    })


@admin_bp.route('/accounts/agencies/<int:agency_id>', methods=['GET'])
@require_superadmin
def agency_detail(agency_id):
    a = Agency.query.get(agency_id)
    if not a:
        return jsonify({'error': 'Agency not found'}), 404
    sub = a.subscription
    return jsonify({
        'agency': a.to_dict(),
        'members': [m.to_dict() for m in a.members],
        'subscription': sub.to_dict() if sub else None,
        'listings_count': Property.query.filter_by(agency_id=a.id).count(),
        'activity': _activity_for('agency', a.id),
    })
