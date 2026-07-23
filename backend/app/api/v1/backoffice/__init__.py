# Backoffice API endpoints
from flask import Blueprint

backoffice_bp = Blueprint('backoffice', __name__, url_prefix='/backoffice')

from app.api.v1.backoffice import dashboard
from app.api.v1.backoffice import clients
from app.api.v1.backoffice import visits
from app.api.v1.backoffice import transactions
from app.api.v1.backoffice import roles
from app.api.v1.backoffice import stats
from app.api.v1.backoffice import properties
from app.api.v1.backoffice import leads
from app.api.v1.backoffice import team
from app.api.v1.backoffice import analytics
from app.api.v1.backoffice import contracts
from app.api.v1.backoffice import legal
from app.api.v1.backoffice import artisans
from app.api.v1.backoffice import shop
