from flask import jsonify, request, g
from datetime import datetime
from app import db
from app.api.v1.backoffice import backoffice_bp
from app.api.v1.backoffice.dashboard import require_auth
from app.models import Role, Permission, User, ActivityLog, user_roles


@backoffice_bp.route('/roles', methods=['GET'])
@require_auth
def get_roles():
    """Get all roles."""
    agency_id = g.agency_id

    query = Role.query.filter(
        (Role.agency_id == agency_id) | (Role.agency_id.is_(None))
    )

    roles = query.order_by(Role.level).all()

    return jsonify({
        'roles': [r.to_dict(include_permissions=True) for r in roles]
    })


@backoffice_bp.route('/roles/<int:role_id>', methods=['GET'])
@require_auth
def get_role(role_id):
    """Get a single role with permissions."""
    role = Role.query.get_or_404(role_id)

    return jsonify(role.to_dict(include_permissions=True))


@backoffice_bp.route('/roles', methods=['POST'])
@require_auth
def create_role():
    """Create a new role."""
    data = request.get_json()

    role = Role(
        name=data.get('name'),
        slug=data.get('slug') or data.get('name', '').lower().replace(' ', '_'),
        description=data.get('description'),
        color=data.get('color', 'gray'),
        level=data.get('level', 100),
        agency_id=g.agency_id
    )

    # Add permissions
    if 'permissions' in data:
        permissions = Permission.query.filter(Permission.id.in_(data['permissions'])).all()
        role.permissions = permissions

    db.session.add(role)
    db.session.commit()

    return jsonify(role.to_dict(include_permissions=True)), 201


@backoffice_bp.route('/roles/<int:role_id>', methods=['PUT'])
@require_auth
def update_role(role_id):
    """Update a role."""
    role = Role.query.get_or_404(role_id)

    if role.is_system:
        return jsonify({'error': 'Cannot modify system role'}), 403

    data = request.get_json()

    for field in ['name', 'description', 'color', 'level']:
        if field in data:
            setattr(role, field, data[field])

    # Update permissions
    if 'permissions' in data:
        permissions = Permission.query.filter(Permission.id.in_(data['permissions'])).all()
        role.permissions = permissions

    role.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify(role.to_dict(include_permissions=True))


@backoffice_bp.route('/roles/<int:role_id>', methods=['DELETE'])
@require_auth
def delete_role(role_id):
    """Delete a role."""
    role = Role.query.get_or_404(role_id)

    if role.is_system:
        return jsonify({'error': 'Cannot delete system role'}), 403

    if len(role.users) > 0:
        return jsonify({'error': 'Cannot delete role with assigned users'}), 400

    db.session.delete(role)
    db.session.commit()

    return jsonify({'message': 'Role deleted'})


@backoffice_bp.route('/permissions', methods=['GET'])
@require_auth
def get_permissions():
    """Get all available permissions grouped by module."""
    permissions = Permission.query.order_by(Permission.module, Permission.name).all()

    # Group by module
    grouped = {}
    for p in permissions:
        if p.module not in grouped:
            grouped[p.module] = []
        grouped[p.module].append(p.to_dict())

    return jsonify({
        'permissions': [p.to_dict() for p in permissions],
        'grouped': grouped
    })


@backoffice_bp.route('/users', methods=['GET'])
@require_auth
def get_users():
    """Get all users (for the backoffice)."""
    agency_id = g.agency_id
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Filters
    user_type = request.args.get('type')
    is_active = request.args.get('is_active')
    search = request.args.get('q')

    query = User.query
    if agency_id:
        query = query.filter(User.agency_id == agency_id)

    if user_type:
        query = query.filter(User.user_type == user_type)
    if is_active is not None:
        query = query.filter(User.is_active == (is_active.lower() == 'true'))
    if search:
        from sqlalchemy import or_
        query = query.filter(or_(
            User.first_name.ilike(f'%{search}%'),
            User.last_name.ilike(f'%{search}%'),
            User.email.ilike(f'%{search}%')
        ))

    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    users_data = []
    for user in pagination.items:
        user_dict = user.to_dict()
        user_dict['roles'] = [r.to_dict() for r in user.roles]
        users_data.append(user_dict)

    return jsonify({
        'users': users_data,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@backoffice_bp.route('/users/<int:user_id>', methods=['GET'])
@require_auth
def get_user(user_id):
    """Get a single user."""
    user = User.query.get_or_404(user_id)

    if g.agency_id and user.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    user_dict = user.to_dict()
    user_dict['roles'] = [r.to_dict(include_permissions=True) for r in user.roles]

    return jsonify(user_dict)


@backoffice_bp.route('/users/<int:user_id>/roles', methods=['PUT'])
@require_auth
def update_user_roles(user_id):
    """Update user roles."""
    user = User.query.get_or_404(user_id)

    if g.agency_id and user.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    data = request.get_json()
    role_ids = data.get('roles', [])

    roles = Role.query.filter(Role.id.in_(role_ids)).all()
    user.roles = roles

    db.session.commit()

    # Log activity
    log = ActivityLog(
        user_id=g.current_user.id if g.current_user else None,
        action='update_roles',
        entity_type='user',
        entity_id=user.id,
        new_values={'roles': [r.name for r in roles]},
        agency_id=g.agency_id,
        ip_address=request.remote_addr
    )
    db.session.add(log)
    db.session.commit()

    return jsonify({'message': 'Roles updated'})


@backoffice_bp.route('/users/<int:user_id>/activate', methods=['POST'])
@require_auth
def activate_user(user_id):
    """Activate a user."""
    user = User.query.get_or_404(user_id)

    if g.agency_id and user.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    user.is_active = True
    db.session.commit()

    return jsonify({'message': 'User activated'})


@backoffice_bp.route('/users/<int:user_id>/deactivate', methods=['POST'])
@require_auth
def deactivate_user(user_id):
    """Deactivate a user."""
    user = User.query.get_or_404(user_id)

    if g.agency_id and user.agency_id != g.agency_id:
        return jsonify({'error': 'Access denied'}), 403

    user.is_active = False
    db.session.commit()

    return jsonify({'message': 'User deactivated'})


# Initialize default roles and permissions
def init_default_roles_permissions():
    """Create default roles and permissions if they don't exist."""

    # Default permissions
    default_permissions = [
        # Properties
        {'name': 'Voir les biens', 'slug': 'properties.view', 'module': 'properties'},
        {'name': 'Créer des biens', 'slug': 'properties.create', 'module': 'properties'},
        {'name': 'Modifier les biens', 'slug': 'properties.edit', 'module': 'properties'},
        {'name': 'Supprimer les biens', 'slug': 'properties.delete', 'module': 'properties'},
        {'name': 'Publier les biens', 'slug': 'properties.publish', 'module': 'properties'},

        # Clients
        {'name': 'Voir les clients', 'slug': 'clients.view', 'module': 'clients'},
        {'name': 'Créer des clients', 'slug': 'clients.create', 'module': 'clients'},
        {'name': 'Modifier les clients', 'slug': 'clients.edit', 'module': 'clients'},
        {'name': 'Supprimer les clients', 'slug': 'clients.delete', 'module': 'clients'},

        # Leads
        {'name': 'Voir les leads', 'slug': 'leads.view', 'module': 'leads'},
        {'name': 'Gérer les leads', 'slug': 'leads.manage', 'module': 'leads'},

        # Transactions
        {'name': 'Voir les transactions', 'slug': 'transactions.view', 'module': 'transactions'},
        {'name': 'Créer des transactions', 'slug': 'transactions.create', 'module': 'transactions'},
        {'name': 'Modifier les transactions', 'slug': 'transactions.edit', 'module': 'transactions'},

        # Visits
        {'name': 'Voir les visites', 'slug': 'visits.view', 'module': 'visits'},
        {'name': 'Gérer les visites', 'slug': 'visits.manage', 'module': 'visits'},

        # Finances
        {'name': 'Voir les finances', 'slug': 'finances.view', 'module': 'finances'},
        {'name': 'Gérer les finances', 'slug': 'finances.manage', 'module': 'finances'},

        # Reports
        {'name': 'Voir les rapports', 'slug': 'reports.view', 'module': 'reports'},
        {'name': 'Exporter les données', 'slug': 'reports.export', 'module': 'reports'},

        # Settings
        {'name': 'Voir les paramètres', 'slug': 'settings.view', 'module': 'settings'},
        {'name': 'Modifier les paramètres', 'slug': 'settings.edit', 'module': 'settings'},

        # Users
        {'name': 'Voir les utilisateurs', 'slug': 'users.view', 'module': 'users'},
        {'name': 'Gérer les utilisateurs', 'slug': 'users.manage', 'module': 'users'},
        {'name': 'Gérer les rôles', 'slug': 'roles.manage', 'module': 'users'},
    ]

    for perm_data in default_permissions:
        if not Permission.query.filter_by(slug=perm_data['slug']).first():
            perm = Permission(**perm_data)
            db.session.add(perm)

    db.session.commit()

    # Default roles
    all_permissions = Permission.query.all()

    default_roles = [
        {
            'name': 'Administrateur',
            'slug': 'admin',
            'description': 'Accès complet à toutes les fonctionnalités',
            'color': 'red',
            'level': 0,
            'is_system': True,
            'permissions': all_permissions
        },
        {
            'name': 'Manager',
            'slug': 'manager',
            'description': 'Gestion de l\'équipe et des opérations',
            'color': 'purple',
            'level': 10,
            'is_system': True,
            'permissions': [p for p in all_permissions if not p.slug.startswith('roles.')]
        },
        {
            'name': 'Agent',
            'slug': 'agent',
            'description': 'Agent immobilier',
            'color': 'blue',
            'level': 50,
            'is_system': True,
            'permissions': [p for p in all_permissions if p.module in ['properties', 'clients', 'leads', 'visits', 'transactions']]
        },
        {
            'name': 'Marketing',
            'slug': 'marketing',
            'description': 'Équipe marketing',
            'color': 'green',
            'level': 60,
            'is_system': True,
            'permissions': [p for p in all_permissions if p.module in ['properties', 'reports'] and 'view' in p.slug]
        },
        {
            'name': 'Comptable',
            'slug': 'accountant',
            'description': 'Accès aux finances',
            'color': 'yellow',
            'level': 70,
            'is_system': True,
            'permissions': [p for p in all_permissions if p.module in ['finances', 'reports']]
        },
        {
            'name': 'Lecture seule',
            'slug': 'readonly',
            'description': 'Consultation uniquement',
            'color': 'gray',
            'level': 100,
            'is_system': True,
            'permissions': [p for p in all_permissions if 'view' in p.slug]
        }
    ]

    for role_data in default_roles:
        if not Role.query.filter_by(slug=role_data['slug']).first():
            permissions = role_data.pop('permissions')
            role = Role(**role_data)
            role.permissions = permissions
            db.session.add(role)

    db.session.commit()
