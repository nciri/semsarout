"""Agent-side inbox for buyer messages (bidirectional messaging threads)."""
from datetime import datetime
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, BuyerMessage, MessageReply, Property
from app.services.mailer import send_email, render_email


def _owned_message_query(user):
    """Messages for properties this agent/agency owns."""
    query = BuyerMessage.query.join(Property, BuyerMessage.property_id == Property.id)
    if user.agency_id:
        return query.filter(Property.agency_id == user.agency_id)
    return query.filter(Property.owner_id == user.id)


@api_v1_bp.route('/agency/messages', methods=['GET'])
@jwt_required()
def list_agency_messages():
    """List buyer messages for the current agent's properties."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = _owned_message_query(user).order_by(BuyerMessage.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'messages': [m.to_dict() for m in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/agency/messages/<int:message_id>', methods=['GET'])
@jwt_required()
def get_agency_message(message_id):
    """Get a message thread and mark it read."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    message = _owned_message_query(user).filter(BuyerMessage.id == message_id).first()
    if not message:
        return jsonify({'error': 'Message non trouvé'}), 404

    if message.status == 'new':
        message.status = 'read'
        message.read_at = datetime.utcnow()
        db.session.commit()

    return jsonify({'message': message.to_dict(include_replies=True)})


@api_v1_bp.route('/agency/messages/<int:message_id>/reply', methods=['POST'])
@jwt_required()
def reply_to_agency_message(message_id):
    """Agent replies to a buyer's message thread."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    message = _owned_message_query(user).filter(BuyerMessage.id == message_id).first()
    if not message:
        return jsonify({'error': 'Message non trouvé'}), 404

    data = request.get_json() or {}
    body = data.get('body', '').strip()
    if not body:
        return jsonify({'error': 'Le message ne peut pas être vide'}), 400

    reply = MessageReply(
        buyer_message_id=message.id,
        sender_role='agent',
        sender_user_id=current_user_id,
        body=body
    )
    message.status = 'replied'
    db.session.add(reply)
    db.session.commit()

    buyer = User.query.get(message.buyer_id)
    if buyer and buyer.email:
        content = (
            f'<p>Bonjour {buyer.first_name},</p>'
            f'<p>Vous avez reçu une réponse concernant votre message « {message.subject} » :</p>'
            f'<p style="background:#f8fafc;padding:12px;border-radius:8px">{body}</p>'
            f'<p><a href="https://semsarout.ma/dashboard/mes-messages">Voir la conversation</a></p>'
        )
        send_email(
            to=buyer.email,
            subject='Nouvelle réponse à votre message',
            html_body=render_email(content)
        )

    return jsonify({'reply': reply.to_dict()}), 201
