import os
from datetime import timedelta


class Config:
    """Base configuration."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-prod')
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-change-in-prod')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

    # File Upload
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

    # Mail Configuration
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'no-reply@semsarout.ma')

    # Celery
    CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0')

    # StayManager Integration (Partner API v1 — see docs/api/partner-api-v1.md
    # in the staymanager.ma repo). There is no api.staymanager.ma subdomain;
    # everything is served from staymanager.ma itself under /api/v1.
    STAYMANAGER_API_URL = os.environ.get('STAYMANAGER_API_URL', 'https://staymanager.ma/api/v1')

    # Public HTTPS base URL of this SemsarOut deployment, used to build the
    # webhook callback URL registered with StayManager
    # (`{APP_BASE_URL}/api/v1/integrations/staymanager/webhook`). StayManager
    # rejects non-https URLs and URLs resolving to private/loopback addresses,
    # so this must be a real public hostname (e.g. an ngrok tunnel in dev).
    APP_BASE_URL = os.environ.get('APP_BASE_URL')


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL',
        'postgresql://postgres:postgres@localhost:5432/semsar_dev'
    )
    # No transactional email provider is configured yet. When explicitly enabled,
    # password-reset links are logged locally instead of emailed. Never enable
    # this outside local development.
    DEBUG_EMAIL_TO_LOG = os.environ.get('DEBUG_EMAIL_TO_LOG', 'false').lower() == 'true'


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')


config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
