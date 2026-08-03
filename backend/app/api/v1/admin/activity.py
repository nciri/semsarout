from flask import jsonify, request
from app.models import ActivityLog
from app.api.v1.admin import admin_bp, require_superadmin


@admin_bp.route('/activity', methods=['GET'])
@require_superadmin
def global_activity():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 30, type=int)
    q = ActivityLog.query
    if request.args.get('entity_type'):
        q = q.filter(ActivityLog.entity_type == request.args.get('entity_type'))
    if request.args.get('actor_id', type=int):
        q = q.filter(ActivityLog.user_id == request.args.get('actor_id', type=int))
    q = q.order_by(ActivityLog.created_at.desc())
    p = q.paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({'items': [l.to_dict() for l in p.items],
                    'total': p.total, 'page': p.page, 'pages': p.pages})
