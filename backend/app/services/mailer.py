"""Lightweight email sending helper.

Wraps Flask-Mail so callers never crash on SMTP failures (unconfigured
credentials in dev, provider downtime, etc) — every send is best-effort and
logs on failure instead of raising, since notification emails are secondary
to the primary action (saving a search, replying to a message).
"""
from flask import current_app, render_template_string
from flask_mail import Message
from app import mail


def send_email(to, subject, html_body, text_body=None):
    """Send an email. Returns True on success, False on failure (logged)."""
    if not current_app.config.get('MAIL_USERNAME'):
        current_app.logger.info(f'[mail disabled - no MAIL_USERNAME configured] To: {to} | Subject: {subject}')
        return False

    try:
        msg = Message(
            subject=subject,
            recipients=[to] if isinstance(to, str) else to,
            html=html_body,
            body=text_body or ''
        )
        mail.send(msg)
        return True
    except Exception as e:
        current_app.logger.error(f'Failed to send email to {to}: {e}')
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
