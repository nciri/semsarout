"""Platform maintenance CLI commands."""
from datetime import datetime, timedelta
import click
from flask.cli import with_appcontext
from app import db
from app.models import User
from app.services.moderation import anonymize_user, log_admin_action


def purge_deleted_accounts(retention_days=90):
    """Anonymize accounts soft-deleted more than retention_days ago. Returns count."""
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    stale = User.query.filter(User.deleted_at.isnot(None),
                              User.deleted_at < cutoff,
                              User.anonymized_at.is_(None)).all()
    for u in stale:
        anonymize_user(u)
        # actor = the account itself (system purge); entity is the user
        log_admin_action(u, 'purge_anonymize', 'user', u.id, {'auto': True})
    db.session.commit()
    return len(stale)


@click.command('purge-deleted')
@click.option('--retention-days', default=90, show_default=True, type=int)
@with_appcontext
def purge_deleted_command(retention_days):
    """Anonymize accounts deleted more than N days ago (RGPD)."""
    count = purge_deleted_accounts(retention_days=retention_days)
    click.echo(f'Anonymized {count} account(s).')


def register_commands(app):
    app.cli.add_command(purge_deleted_command)
