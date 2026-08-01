"""Platform maintenance CLI commands."""
from datetime import datetime, timedelta
import click
from flask.cli import with_appcontext
from app import db
from app.models import User, Agency, ActivityLog
from app.services.moderation import anonymize_user, anonymize_agency, log_admin_action


def purge_deleted_accounts(retention_days=90):
    """Anonymize accounts (users + agencies) soft-deleted more than retention_days ago.

    Returns the total count anonymized (users + agencies).
    """
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    stale = User.query.filter(User.deleted_at.isnot(None),
                              User.deleted_at < cutoff,
                              User.anonymized_at.is_(None)).all()
    for u in stale:
        anonymize_user(u)
        # actor = the account itself (system purge); entity is the user
        log_admin_action(u, 'purge_anonymize', 'user', u.id, {'auto': True})

    stale_agencies = Agency.query.filter(Agency.deleted_at.isnot(None),
                                         Agency.deleted_at < cutoff,
                                         Agency.anonymized_at.is_(None)).all()
    for a in stale_agencies:
        anonymize_agency(a)
        # agencies aren't users: log the purge without a user actor
        db.session.add(ActivityLog(user_id=None, action='purge_anonymize',
                                    entity_type='agency', entity_id=a.id,
                                    extra_data={'auto': True}))

    db.session.commit()
    return len(stale) + len(stale_agencies)


@click.command('purge-deleted')
@click.option('--retention-days', default=90, show_default=True, type=int)
@with_appcontext
def purge_deleted_command(retention_days):
    """Anonymize accounts deleted more than N days ago (RGPD)."""
    count = purge_deleted_accounts(retention_days=retention_days)
    click.echo(f'Anonymized {count} account(s).')


def register_commands(app):
    app.cli.add_command(purge_deleted_command)
