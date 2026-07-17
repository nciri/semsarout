from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_mail import Mail

from config.settings import config

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
mail = Mail()


def create_app(config_name='default'):
    """Application factory."""
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)
    mail.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Register blueprints
    from app.api.v1 import api_v1_bp
    app.register_blueprint(api_v1_bp, url_prefix='/api/v1')

    # Health check route
    @app.route('/health')
    def health_check():
        return {'status': 'healthy', 'service': 'semsar-api'}

    # Serve listing photos only. Sensitive documents (title deeds, ID cards)
    # live in uploads/documents/ and are served exclusively through the
    # authenticated /api/v1/documents/<id> endpoint with an ownership check.
    # The <string> converter rejects slashes, preventing subpath escapes.
    @app.route('/uploads/photos/<string:filename>')
    def uploaded_photo(filename):
        import os
        from flask import send_from_directory
        uploads = app.config.get(
            'UPLOAD_FOLDER', os.path.join(app.root_path, '..', 'uploads')
        )
        return send_from_directory(
            os.path.abspath(os.path.join(uploads, 'photos')), filename
        )

    return app
