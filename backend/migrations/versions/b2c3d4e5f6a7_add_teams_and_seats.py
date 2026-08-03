"""Add teams, invitations, seats/owner columns."""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.add_column(sa.Column('max_seats', sa.Integer(), nullable=True, server_default='0'))
        b.add_column(sa.Column('max_teams', sa.Integer(), nullable=True, server_default='0'))
    with op.batch_alter_table('agencies', schema=None) as b:
        b.add_column(sa.Column('owner_id', sa.Integer(), nullable=True))

    op.create_table('teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('agency_id', 'name', name='uq_team_agency_name'),
    )
    op.create_index('ix_teams_agency_id', 'teams', ['agency_id'])

    with op.batch_alter_table('users', schema=None) as b:
        b.add_column(sa.Column('team_id', sa.Integer(), nullable=True))

    op.create_table('invitations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agency_id', sa.Integer(), sa.ForeignKey('agencies.id'), nullable=False),
        sa.Column('email', sa.String(length=120), nullable=False),
        sa.Column('role_id', sa.Integer(), sa.ForeignKey('roles.id'), nullable=True),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=True),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('invited_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_invitations_agency_id', 'invitations', ['agency_id'])
    op.create_index('ix_invitations_token_hash', 'invitations', ['token_hash'])

    # Backfill agency.owner_id: highest-level role holder, else oldest member.
    conn = op.get_bind()
    agencies = conn.execute(sa.text("SELECT id FROM agencies")).fetchall()
    for (aid,) in agencies:
        row = conn.execute(sa.text("""
            SELECT u.id FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.id
            LEFT JOIN roles r ON r.id = ur.role_id
            WHERE u.agency_id = :aid
            ORDER BY COALESCE(r.level, -1) DESC, u.created_at ASC
            LIMIT 1
        """), {"aid": aid}).fetchone()
        if row:
            conn.execute(sa.text("UPDATE agencies SET owner_id = :oid WHERE id = :aid"),
                         {"oid": row[0], "aid": aid})


def downgrade():
    with op.batch_alter_table('users', schema=None) as b:
        b.drop_column('team_id')
    op.drop_index('ix_invitations_token_hash', table_name='invitations')
    op.drop_index('ix_invitations_agency_id', table_name='invitations')
    op.drop_table('invitations')
    op.drop_index('ix_teams_agency_id', table_name='teams')
    op.drop_table('teams')
    with op.batch_alter_table('agencies', schema=None) as b:
        b.drop_column('owner_id')
    with op.batch_alter_table('subscription_plans', schema=None) as b:
        b.drop_column('max_teams')
        b.drop_column('max_seats')
