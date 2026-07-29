"""Adaptateur email SMTP (Brevo en dev/prod). Config via variables d'environnement (voir
`.env.example`). `send_email` lève en cas d'échec → l'appelant décide (log 'failed' / DLQ).

La config est lue à l'appel (pas au chargement) pour que le worker charge d'abord son `.env`.
"""
import os
import smtplib
import ssl
from email.message import EmailMessage


def is_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER")
                and os.environ.get("SMTP_PASSWORD"))


def send_email(to: str, subject: str, body: str, *, html: str | None = None,
               from_email: str | None = None) -> None:
    """Envoie un email via SMTP (STARTTLS sur 587, SSL implicite sur 465). `from_email` permet de
    choisir l'expéditeur (noreply@ / contact@…) selon le cas. Lève si échec."""
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = from_email or os.environ.get("SMTP_FROM", user)
    sender_name = os.environ.get("SMTP_FROM_NAME", "SemsarOut")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{sender_name} <{sender}>"
    msg["To"] = to
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")

    ctx = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20, context=ctx) as s:
            s.login(user, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.ehlo()
            s.starttls(context=ctx)
            s.ehlo()
            s.login(user, password)
            s.send_message(msg)
