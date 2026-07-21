"""
Third-party integrations API package.
"""

from flask import Blueprint

integrations_bp = Blueprint('integrations', __name__)

# Import and register integration blueprints
from app.api.v1.integrations.staymanager import staymanager_bp
integrations_bp.register_blueprint(staymanager_bp)
