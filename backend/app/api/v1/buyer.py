"""Buyer features API: saved searches, favorites, messages, estimates."""
from datetime import datetime
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from markupsafe import escape
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, SavedSearch, Favorite, BuyerMessage, MessageReply, PropertyEstimate, Property
from app.services.mailer import send_email, render_email


def require_buyer_role(f):
    """Decorator to require buyer account role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        current_user_id = int(get_jwt_identity())
        user = User.query.get(current_user_id)

        if not user:
            return jsonify({'error': 'Utilisateur non trouvé'}), 404

        if user.account_role != 'buyer':
            return jsonify({'error': 'Cette fonctionnalité est réservée aux acheteurs/chercheurs'}), 403

        return f(*args, **kwargs)
    return decorated


# ============================================
# SAVED SEARCHES ENDPOINTS
# ============================================

@api_v1_bp.route('/buyer/saved-searches', methods=['GET'])
@jwt_required()
@require_buyer_role
def list_saved_searches():
    """List user's saved searches."""
    current_user_id = int(get_jwt_identity())

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    searches = SavedSearch.query.filter_by(user_id=current_user_id).order_by(SavedSearch.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'searches': [s.to_dict() for s in searches.items],
        'total': searches.total,
        'pages': searches.pages,
        'current_page': page
    })


@api_v1_bp.route('/buyer/saved-searches', methods=['POST'])
@jwt_required()
@require_buyer_role
def create_saved_search():
    """Create a new saved search."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data.get('name'):
        return jsonify({'error': 'Le nom de la recherche est requis'}), 400

    search = SavedSearch(
        user_id=current_user_id,
        name=data['name'],
        description=data.get('description'),
        criteria=data.get('criteria', {}),
        notify_new_matches=data.get('notify_new_matches', True)
    )

    db.session.add(search)
    db.session.commit()

    return jsonify({
        'search': search.to_dict(),
        'message': 'Recherche sauvegardée'
    }), 201


@api_v1_bp.route('/buyer/saved-searches/<int:search_id>', methods=['PUT'])
@jwt_required()
@require_buyer_role
def update_saved_search(search_id):
    """Update a saved search."""
    current_user_id = int(get_jwt_identity())
    search = SavedSearch.query.filter_by(id=search_id, user_id=current_user_id).first()

    if not search:
        return jsonify({'error': 'Recherche non trouvée'}), 404

    data = request.get_json()

    if 'name' in data:
        search.name = data['name']
    if 'description' in data:
        search.description = data['description']
    if 'criteria' in data:
        search.criteria = data['criteria']
    if 'notify_new_matches' in data:
        search.notify_new_matches = data['notify_new_matches']

    search.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'search': search.to_dict()})


@api_v1_bp.route('/buyer/saved-searches/<int:search_id>', methods=['DELETE'])
@jwt_required()
@require_buyer_role
def delete_saved_search(search_id):
    """Delete a saved search."""
    current_user_id = int(get_jwt_identity())
    search = SavedSearch.query.filter_by(id=search_id, user_id=current_user_id).first()

    if not search:
        return jsonify({'error': 'Recherche non trouvée'}), 404

    db.session.delete(search)
    db.session.commit()

    return jsonify({'message': 'Recherche supprimée'})


# ============================================
# FAVORITES ENDPOINTS
# ============================================

@api_v1_bp.route('/buyer/favorites', methods=['GET'])
@jwt_required()
@require_buyer_role
def list_favorites():
    """List user's favorite properties."""
    current_user_id = int(get_jwt_identity())

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    favorites = Favorite.query.filter_by(user_id=current_user_id).order_by(Favorite.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'favorites': [f.to_dict() for f in favorites.items],
        'total': favorites.total,
        'pages': favorites.pages,
        'current_page': page
    })


@api_v1_bp.route('/buyer/favorites', methods=['POST'])
@jwt_required()
@require_buyer_role
def add_favorite():
    """Add a property to favorites."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()

    property_id = data.get('property_id')
    if not property_id:
        return jsonify({'error': 'property_id requis'}), 400

    # Check if property exists
    property = Property.query.get(property_id)
    if not property:
        return jsonify({'error': 'Propriété non trouvée'}), 404

    # Check if already favorited
    existing = Favorite.query.filter_by(user_id=current_user_id, property_id=property_id).first()
    if existing:
        return jsonify({'error': 'Propriété déjà en favoris'}), 400

    favorite = Favorite(
        user_id=current_user_id,
        property_id=property_id,
        notes=data.get('notes'),
        rating=data.get('rating')
    )

    db.session.add(favorite)
    db.session.commit()

    return jsonify({
        'favorite': favorite.to_dict(),
        'message': 'Ajouté aux favoris'
    }), 201


@api_v1_bp.route('/buyer/favorites/<int:favorite_id>', methods=['PUT'])
@jwt_required()
@require_buyer_role
def update_favorite(favorite_id):
    """Update a favorite property."""
    current_user_id = int(get_jwt_identity())
    favorite = Favorite.query.filter_by(id=favorite_id, user_id=current_user_id).first()

    if not favorite:
        return jsonify({'error': 'Favori non trouvé'}), 404

    data = request.get_json()

    if 'notes' in data:
        favorite.notes = data['notes']
    if 'rating' in data:
        favorite.rating = data['rating']

    db.session.commit()

    return jsonify({'favorite': favorite.to_dict()})


@api_v1_bp.route('/buyer/favorites/<int:favorite_id>', methods=['DELETE'])
@jwt_required()
@require_buyer_role
def remove_favorite(favorite_id):
    """Remove a property from favorites."""
    current_user_id = int(get_jwt_identity())
    favorite = Favorite.query.filter_by(id=favorite_id, user_id=current_user_id).first()

    if not favorite:
        return jsonify({'error': 'Favori non trouvé'}), 404

    db.session.delete(favorite)
    db.session.commit()

    return jsonify({'message': 'Supprimé des favoris'})


# ============================================
# MESSAGES ENDPOINTS
# ============================================

@api_v1_bp.route('/buyer/messages', methods=['GET'])
@jwt_required()
@require_buyer_role
def list_buyer_messages():
    """List user's messages."""
    current_user_id = int(get_jwt_identity())

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    messages = BuyerMessage.query.filter_by(buyer_id=current_user_id).order_by(BuyerMessage.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'messages': [m.to_dict() for m in messages.items],
        'total': messages.total,
        'pages': messages.pages,
        'current_page': page
    })


@api_v1_bp.route('/buyer/messages', methods=['POST'])
@jwt_required()
@require_buyer_role
def send_message():
    """Send a message about a property."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)
    data = request.get_json()

    property_id = data.get('property_id')
    if not property_id:
        return jsonify({'error': 'property_id requis'}), 400

    # Check if property exists
    property = Property.query.get(property_id)
    if not property:
        return jsonify({'error': 'Propriété non trouvée'}), 404

    message = BuyerMessage(
        buyer_id=current_user_id,
        property_id=property_id,
        subject=data.get('subject', 'Demande d\'information'),
        message=data.get('message'),
        buyer_email=data.get('email', user.email if user else ''),
        buyer_phone=data.get('phone', user.phone if user and hasattr(user, 'phone') else '')
    )

    db.session.add(message)
    db.session.commit()

    owner = User.query.get(property.owner_id)
    if owner and owner.email:
        sender_label = escape(user.full_name) if user else escape(message.buyer_email)
        content = (
            f'<p>Bonjour {escape(owner.first_name)},</p>'
            f'<p><strong>{sender_label}</strong> vous a envoyé un message '
            f'concernant votre annonce <strong>{escape(property.title)}</strong> :</p>'
            f'<p style="background:#f8fafc;padding:12px;border-radius:8px">{escape(message.message)}</p>'
            f'<p><a href="https://semsarout.ma/dashboard/leads">Répondre depuis votre tableau de bord</a></p>'
        )
        send_email(
            to=owner.email,
            subject=f'Nouveau message : {message.subject}',
            html_body=render_email(content)
        )

    return jsonify({
        'message': message.to_dict(),
        'status': 'Message envoyé avec succès'
    }), 201


@api_v1_bp.route('/buyer/messages/<int:message_id>', methods=['GET'])
@jwt_required()
@require_buyer_role
def get_buyer_message(message_id):
    """Get a specific message thread (including agent replies)."""
    current_user_id = int(get_jwt_identity())
    message = BuyerMessage.query.filter_by(id=message_id, buyer_id=current_user_id).first()

    if not message:
        return jsonify({'error': 'Message non trouvé'}), 404

    # Mark as read
    if message.status == 'new':
        message.status = 'read'
        message.read_at = datetime.utcnow()
        db.session.commit()

    return jsonify({'message': message.to_dict(include_replies=True)})


@api_v1_bp.route('/buyer/messages/<int:message_id>/reply', methods=['POST'])
@jwt_required()
@require_buyer_role
def reply_to_message(message_id):
    """Buyer adds a reply to an existing message thread."""
    current_user_id = int(get_jwt_identity())
    message = BuyerMessage.query.filter_by(id=message_id, buyer_id=current_user_id).first()

    if not message:
        return jsonify({'error': 'Message non trouvé'}), 404

    data = request.get_json() or {}
    body = data.get('body', '').strip()
    if not body:
        return jsonify({'error': 'Le message ne peut pas être vide'}), 400

    reply = MessageReply(
        buyer_message_id=message.id,
        sender_role='buyer',
        sender_user_id=current_user_id,
        body=body
    )
    db.session.add(reply)
    db.session.commit()

    return jsonify({'reply': reply.to_dict()}), 201


# ============================================
# ESTIMATES ENDPOINTS
# ============================================

@api_v1_bp.route('/buyer/estimates', methods=['GET'])
@jwt_required()
@require_buyer_role
def list_estimates():
    """List user's property estimates."""
    current_user_id = int(get_jwt_identity())

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    estimates = PropertyEstimate.query.filter_by(user_id=current_user_id).order_by(PropertyEstimate.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'estimates': [e.to_dict() for e in estimates.items],
        'total': estimates.total,
        'pages': estimates.pages,
        'current_page': page
    })


@api_v1_bp.route('/buyer/estimates', methods=['POST'])
@jwt_required()
@require_buyer_role
def create_estimate():
    """Create a property estimate."""
    current_user_id = int(get_jwt_identity())
    data = request.get_json()

    property_id = data.get('property_id')
    estimated_price = data.get('estimated_price')

    if not property_id or not estimated_price:
        return jsonify({'error': 'property_id et estimated_price requis'}), 400

    # Check if property exists
    property = Property.query.get(property_id)
    if not property:
        return jsonify({'error': 'Propriété non trouvée'}), 404

    estimate = PropertyEstimate(
        user_id=current_user_id,
        property_id=property_id,
        estimated_price=estimated_price,
        estimated_reason=data.get('estimated_reason'),
        market_analysis=data.get('market_analysis'),
        comparison_properties=data.get('comparison_properties')
    )

    db.session.add(estimate)
    db.session.commit()

    return jsonify({
        'estimate': estimate.to_dict(),
        'message': 'Estimation créée'
    }), 201


@api_v1_bp.route('/buyer/estimates/<int:estimate_id>', methods=['PUT'])
@jwt_required()
@require_buyer_role
def update_estimate(estimate_id):
    """Update a property estimate."""
    current_user_id = int(get_jwt_identity())
    estimate = PropertyEstimate.query.filter_by(id=estimate_id, user_id=current_user_id).first()

    if not estimate:
        return jsonify({'error': 'Estimation non trouvée'}), 404

    data = request.get_json()

    if 'estimated_price' in data:
        estimate.estimated_price = data['estimated_price']
    if 'estimated_reason' in data:
        estimate.estimated_reason = data['estimated_reason']
    if 'market_analysis' in data:
        estimate.market_analysis = data['market_analysis']
    if 'comparison_properties' in data:
        estimate.comparison_properties = data['comparison_properties']

    estimate.updated_at = datetime.utcnow()
    db.session.commit()

    return jsonify({'estimate': estimate.to_dict()})


@api_v1_bp.route('/buyer/estimates/<int:estimate_id>', methods=['DELETE'])
@jwt_required()
@require_buyer_role
def delete_estimate(estimate_id):
    """Delete a property estimate."""
    current_user_id = int(get_jwt_identity())
    estimate = PropertyEstimate.query.filter_by(id=estimate_id, user_id=current_user_id).first()

    if not estimate:
        return jsonify({'error': 'Estimation non trouvée'}), 404

    db.session.delete(estimate)
    db.session.commit()

    return jsonify({'message': 'Estimation supprimée'})
