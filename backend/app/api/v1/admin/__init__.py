"""Platform super-admin API (above per-agency backoffice)."""
from functools import wraps
from flask import Blueprint, jsonify, g
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from app.models import User

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def require_superadmin(f):
    """Require a valid JWT whose user carries the 'superadmin' role. No agency scoping."""
    @wraps(f)
    def decorated(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({'error': 'Authorization required'}), 401
        identity = get_jwt_identity()
        user = User.query.get(int(identity)) if identity else None
        if not user:
            return jsonify({'error': 'Invalid token'}), 401
        if not any(getattr(r, 'slug', None) == 'superadmin' for r in user.roles):
            return jsonify({'error': 'Super-admin access required'}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated


# Import routes so they register on admin_bp
from app.api.v1.admin import overview, accounts, moderation, activity  # noqa: E402,F401
