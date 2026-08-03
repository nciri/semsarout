from datetime import datetime, timedelta
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, SubscriptionPlan, Subscription


@api_v1_bp.route('/subscription-plans', methods=['GET'])
def list_plans():
    """List all available subscription plans."""
    plans = SubscriptionPlan.query.filter_by(is_active=True).all()
    return jsonify({'plans': [p.to_dict() for p in plans]})


@api_v1_bp.route('/subscription-plans/<int:plan_id>', methods=['GET'])
def get_plan(plan_id):
    """Get subscription plan details."""
    plan = SubscriptionPlan.query.get_or_404(plan_id)
    return jsonify({'plan': plan.to_dict()})


@api_v1_bp.route('/my-subscription', methods=['GET'])
@jwt_required()
def my_subscription():
    """Get current user's agency subscription."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.agency_id:
        return jsonify({'error': 'You do not belong to an agency'}), 404

    subscription = Subscription.query.filter_by(agency_id=user.agency_id).first()

    if not subscription:
        return jsonify({'error': 'No active subscription'}), 404

    return jsonify({'subscription': subscription.to_dict()})


@api_v1_bp.route('/subscribe', methods=['POST'])
@jwt_required()
def subscribe():
    """Subscribe to a plan."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.agency_id:
        return jsonify({'error': 'You need to create an agency first'}), 400

    data = request.get_json()
    plan_id = data.get('plan_id')
    billing_cycle = data.get('billing_cycle', 'monthly')

    if not plan_id:
        return jsonify({'error': 'plan_id is required'}), 400

    plan = SubscriptionPlan.query.get(plan_id)
    if not plan or not plan.is_active:
        return jsonify({'error': 'Plan not found'}), 404

    # Check if already subscribed
    existing = Subscription.query.filter_by(
        agency_id=user.agency_id,
        status='active'
    ).first()

    if existing:
        return jsonify({'error': 'You already have an active subscription'}), 400

    # Calculate amount based on billing cycle
    if billing_cycle == 'yearly' and plan.price_yearly:
        amount = plan.price_yearly
        end_date = datetime.utcnow() + timedelta(days=365)
    else:
        amount = plan.price_monthly
        end_date = datetime.utcnow() + timedelta(days=30)

    # Create subscription
    subscription = Subscription(
        agency_id=user.agency_id,
        plan_id=plan.id,
        billing_cycle=billing_cycle,
        amount=amount,
        status='active',
        start_date=datetime.utcnow(),
        end_date=end_date
    )

    db.session.add(subscription)
    db.session.commit()

    return jsonify({
        'message': 'Subscription activated successfully',
        'subscription': subscription.to_dict()
    }), 201


@api_v1_bp.route('/cancel-subscription', methods=['POST'])
@jwt_required()
def cancel_subscription():
    """Cancel current subscription."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    if not user.agency_id:
        return jsonify({'error': 'You do not belong to an agency'}), 404

    subscription = Subscription.query.filter_by(
        agency_id=user.agency_id,
        status='active'
    ).first()

    if not subscription:
        return jsonify({'error': 'No active subscription to cancel'}), 404

    subscription.status = 'cancelled'
    subscription.cancelled_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': 'Subscription cancelled. Access continues until end of billing period.',
        'subscription': subscription.to_dict()
    })
