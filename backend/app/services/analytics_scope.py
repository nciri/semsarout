"""Agent-vs-agency visibility for analytics."""


def analytics_scope(user, agency):
    """Return {'all': bool, 'agent_id': int|None}. Agency-wide if owner or analytics.view_all."""
    if agency is not None and agency.owner_id and user.id == agency.owner_id:
        return {'all': True, 'agent_id': None}
    if any(r.has_permission('analytics.view_all') for r in user.roles):
        return {'all': True, 'agent_id': None}
    return {'all': False, 'agent_id': user.id}
