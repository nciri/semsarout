"""Centralized email sending via flask-mail — best-effort, never raises.

Supports both call styles used across the app:
  - send_email(to, subject, text_body)                    # plain text (team invitations)
  - send_email(to, subject, html_body=render_email(...))  # html (buyer notifications)
A mail outage / missing config only logs — it must never fail the calling request.
"""
from flask import current_app, render_template_string


def send_email(to, subject, body=None, html=None, html_body=None, text_body=None):
    """Send an email if MAIL is configured. Returns True if sent, False if only logged."""
    server = current_app.config.get('MAIL_SERVER')
    username = current_app.config.get('MAIL_USERNAME')
    if not server or not username:
        current_app.logger.info('[MAIL not configured] To=%s Subject=%s', to, subject)
        return False
    html_content = html if html is not None else html_body
    text_content = body if body is not None else text_body
    try:
        from flask_mail import Message
        from app import mail
        sender = current_app.config.get('MAIL_DEFAULT_SENDER') or username
        recipients = [to] if isinstance(to, str) else to
        msg = Message(subject=subject, recipients=recipients,
                      body=text_content or '', html=html_content, sender=sender)
        mail.send(msg)
        return True
    except Exception as exc:  # pragma: no cover - depends on live SMTP
        current_app.logger.warning('send_email failed to %s: %s', to, exc)
        return False


BASE_TEMPLATE = """
<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e2530">
  <div style="font-size:20px;font-weight:bold;color:#0B1220;margin-bottom:16px">SemsarOut</div>
  {{ content|safe }}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#94a3b8">
    Vous recevez cet email suite à votre activité sur SemsarOut.
  </div>
</div>
"""


def render_email(content_html):
    return render_template_string(BASE_TEMPLATE, content=content_html)
