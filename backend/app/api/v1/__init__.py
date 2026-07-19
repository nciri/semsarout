from flask import Blueprint

api_v1_bp = Blueprint('api_v1', __name__)

# Import routes
from app.api.v1 import auth, properties, agencies, users, subscriptions, leads, payments, programs, billing, selling, buyer, agency_messages, availability, mortgage

# Import backoffice blueprint
from app.api.v1.backoffice import backoffice_bp
api_v1_bp.register_blueprint(backoffice_bp)

# Import integrations blueprint
from app.api.v1.integrations import integrations_bp
api_v1_bp.register_blueprint(integrations_bp)
