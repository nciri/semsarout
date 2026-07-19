"""Flask CLI commands, meant to be triggered by an external cron/scheduler.

Example crontab entry (daily at 8am):
    0 8 * * * cd /path/to/backend && venv/bin/flask send-search-alerts
"""
from datetime import datetime, timedelta

import click
from flask import current_app
from flask.cli import with_appcontext

from app import db
from app.models import SavedSearch, User, Property
from app.services.mailer import send_email, render_email


def _apply_criteria(query, criteria):
    """Apply a SavedSearch.criteria dict to a Property query.

    Mirrors the filter keys accepted by GET /api/v1/properties so a saved
    search matches exactly what the buyer would see if they re-ran it.
    """
    if not criteria:
        return query

    if criteria.get('transaction_type'):
        query = query.filter(Property.transaction_type == criteria['transaction_type'])
    if criteria.get('property_type'):
        types = criteria['property_type'] if isinstance(criteria['property_type'], list) \
            else str(criteria['property_type']).split(',')
        query = query.filter(Property.property_type.in_(types))
    if criteria.get('city'):
        query = query.filter(Property.city.ilike(f"%{criteria['city']}%"))
    if criteria.get('neighborhood'):
        query = query.filter(Property.neighborhood.ilike(f"%{criteria['neighborhood']}%"))
    if criteria.get('min_price'):
        query = query.filter(Property.price >= float(criteria['min_price']))
    if criteria.get('max_price'):
        query = query.filter(Property.price <= float(criteria['max_price']))
    if criteria.get('min_surface'):
        query = query.filter(Property.surface >= float(criteria['min_surface']))
    if criteria.get('max_surface'):
        query = query.filter(Property.surface <= float(criteria['max_surface']))
    if criteria.get('min_rooms'):
        query = query.filter(Property.rooms >= int(criteria['min_rooms']))
    if criteria.get('min_bedrooms'):
        query = query.filter(Property.bedrooms >= int(criteria['min_bedrooms']))

    return query


def _run_search_alerts():
    """Find new matches for every SavedSearch with alerts enabled and email them."""
    searches = SavedSearch.query.filter_by(notify_new_matches=True).all()
    total_emails = 0

    for search in searches:
        since = search.last_notified_at or (datetime.utcnow() - timedelta(days=7))

        query = Property.query.filter(
            Property.status == 'active',
            Property.published_at.isnot(None),
            Property.published_at > since
        )
        query = _apply_criteria(query, search.criteria or {})
        matches = query.order_by(Property.published_at.desc()).limit(20).all()

        if not matches:
            continue

        user = User.query.get(search.user_id)
        if not user or not user.email:
            continue

        items_html = ''.join(
            f'<div style="padding:12px 0;border-bottom:1px solid #eee">'
            f'<a href="https://semsarout.ma/annonces/{p.id}" style="color:#0F766E;font-weight:bold;text-decoration:none">{p.title}</a>'
            f'<div style="color:#64748b;font-size:14px">{p.city} · {p.price:.0f} Dh</div>'
            f'</div>'
            for p in matches
        )
        content = (
            f'<p>Bonjour {user.first_name},</p>'
            f'<p><strong>{len(matches)} nouveau(x) bien(s)</strong> correspondent à votre recherche '
            f'« {search.name} » :</p>'
            f'{items_html}'
        )

        sent = send_email(
            to=user.email,
            subject=f'{len(matches)} nouveau(x) bien(s) pour "{search.name}"',
            html_body=render_email(content)
        )

        if sent:
            total_emails += 1

        search.last_notified_at = datetime.utcnow()

    db.session.commit()
    return len(searches), total_emails


@click.command('send-search-alerts')
@with_appcontext
def send_search_alerts_command():
    """Email buyers about new listings matching their saved searches."""
    checked, sent = _run_search_alerts()
    click.echo(f'Checked {checked} saved searches, sent {sent} alert email(s).')


def register_cli(app):
    app.cli.add_command(send_search_alerts_command)
