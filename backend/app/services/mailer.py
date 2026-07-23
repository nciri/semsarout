"""Centralized email sending via Brevo SMTP relay (flask-mail); link-fallback otherwise."""
from flask import current_app


def send_email(to, subject, body, html=None):
    """Send an email if MAIL is configured. Returns True if sent, False if only logged.

    Never raises — a mail outage must not fail the calling request.
    """
    server = current_app.config.get('MAIL_SERVER')
    username = current_app.config.get('MAIL_USERNAME')
    if not server or not username:
        current_app.logger.info('[MAIL not configured] To=%s Subject=%s Body=%s', to, subject, body)
        return False
    try:
        from flask_mail import Message
        from app import mail
        sender = current_app.config.get('MAIL_DEFAULT_SENDER') or username
        msg = Message(subject=subject, recipients=[to], body=body, html=html, sender=sender)
        mail.send(msg)
        return True
    except Exception as exc:  # pragma: no cover - depends on live SMTP
        current_app.logger.warning('send_email failed to %s: %s', to, exc)
        return False
