from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import uuid
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, Agency, Subscription, SubscriptionPlan


class Payment(db.Model):
    """Payment model for tracking transactions."""
    __tablename__ = 'payments'

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(50), unique=True, nullable=False)

    # Type: 'service', 'subscription'
    payment_type = db.Column(db.String(20), nullable=False)
    service_id = db.Column(db.String(50))  # For service payments
    plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.id'))
    billing_cycle = db.Column(db.String(20))  # monthly, yearly

    # Amount
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    currency = db.Column(db.String(3), default='MAD')

    # Status: 'pending', 'processing', 'completed', 'failed', 'refunded'
    status = db.Column(db.String(20), default='pending')

    # Payment method: 'card', 'transfer'
    payment_method = db.Column(db.String(20))
    gateway_reference = db.Column(db.String(100))  # CMI, etc.

    # Customer info
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    user = db.relationship('User')
    customer_name = db.Column(db.String(100))
    customer_email = db.Column(db.String(120))
    customer_phone = db.Column(db.String(20))
    customer_address = db.Column(db.String(255))
    customer_city = db.Column(db.String(100))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    # Extra data
    extra_data = db.Column(db.JSON, default=dict)

    def to_dict(self):
        return {
            'id': self.id,
            'reference': self.reference,
            'payment_type': self.payment_type,
            'amount': float(self.amount),
            'currency': self.currency,
            'status': self.status,
            'payment_method': self.payment_method,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


# Service prices
SERVICE_PRICES = {
    'forfait-vente': 4900,
    'photos-pro': 990,
    'photos-pro-360': 1490,
    'photos-pro-drone': 1790
}


@api_v1_bp.route('/payments/create-intent', methods=['POST'])
@jwt_required(optional=True)
def create_payment_intent():
    """Create a payment intent."""
    data = request.get_json()

    service_id = data.get('service_id')
    plan_id = data.get('plan_id')
    billing_cycle = data.get('billing_cycle', 'yearly')
    payment_method = data.get('payment_method', 'card')
    customer_info = data.get('customer_info', {})

    # Determine amount
    amount = 0
    payment_type = None

    if service_id and service_id in SERVICE_PRICES:
        amount = SERVICE_PRICES[service_id]
        payment_type = 'service'
    elif plan_id:
        plan = SubscriptionPlan.query.filter_by(slug=plan_id).first()
        if plan:
            amount = float(plan.price_yearly if billing_cycle == 'yearly' else plan.price_monthly)
            payment_type = 'subscription'
            plan_id = plan.id

    if amount <= 0:
        return jsonify({'error': 'Invalid service or plan'}), 400

    # Get current user if authenticated
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None

    # Generate unique reference
    reference = f"PAY-{uuid.uuid4().hex[:8].upper()}"

    # Create payment record
    payment = Payment(
        reference=reference,
        payment_type=payment_type,
        service_id=service_id if payment_type == 'service' else None,
        plan_id=plan_id if payment_type == 'subscription' else None,
        billing_cycle=billing_cycle if payment_type == 'subscription' else None,
        amount=amount,
        payment_method=payment_method,
        user_id=current_user_id,
        customer_name=customer_info.get('name'),
        customer_email=customer_info.get('email'),
        customer_phone=customer_info.get('phone'),
        customer_address=customer_info.get('address'),
        customer_city=customer_info.get('city')
    )

    db.session.add(payment)
    db.session.commit()

    if payment_method == 'card':
        # TODO: Integrate with CMI or other payment gateway
        # For now, return a mock payment URL
        payment_url = f"/payment-gateway?ref={reference}&amount={amount}"

        return jsonify({
            'payment_id': payment.id,
            'reference': reference,
            'payment_url': payment_url,
            'amount': amount
        })

    elif payment_method == 'transfer':
        # Return bank transfer instructions
        return jsonify({
            'payment_id': payment.id,
            'reference': reference,
            'status': 'pending_transfer',
            'bank_info': {
                'bank_name': 'Banque Populaire',
                'account_name': 'SemsarOut SARL',
                'rib': 'XXXX XXXX XXXX XXXX XXXX XX',
                'reference': reference,
                'amount': amount
            },
            'message': 'Veuillez effectuer le virement avec la référence indiquée'
        })

    return jsonify({'error': 'Invalid payment method'}), 400


@api_v1_bp.route('/payments/webhook', methods=['POST'])
def payment_webhook():
    """Handle payment gateway webhook."""
    data = request.get_json()

    # Verify webhook signature (TODO: implement based on gateway)

    reference = data.get('reference')
    status = data.get('status')
    gateway_reference = data.get('gateway_reference')

    payment = Payment.query.filter_by(reference=reference).first()
    if not payment:
        return jsonify({'error': 'Payment not found'}), 404

    if status == 'success':
        payment.status = 'completed'
        payment.gateway_reference = gateway_reference
        payment.completed_at = datetime.utcnow()

        # If subscription, create/update subscription
        if payment.payment_type == 'subscription' and payment.user_id:
            user = User.query.get(payment.user_id)
            if user and user.agency_id:
                # Create or update subscription
                subscription = Subscription.query.filter_by(
                    agency_id=user.agency_id,
                    status='active'
                ).first()

                if subscription:
                    # Extend existing subscription
                    if payment.billing_cycle == 'yearly':
                        subscription.end_date += timedelta(days=365)
                    else:
                        subscription.end_date += timedelta(days=30)
                else:
                    # Create new subscription
                    if payment.billing_cycle == 'yearly':
                        end_date = datetime.utcnow() + timedelta(days=365)
                    else:
                        end_date = datetime.utcnow() + timedelta(days=30)

                    subscription = Subscription(
                        agency_id=user.agency_id,
                        plan_id=payment.plan_id,
                        billing_cycle=payment.billing_cycle,
                        amount=payment.amount,
                        status='active',
                        start_date=datetime.utcnow(),
                        end_date=end_date
                    )
                    db.session.add(subscription)

        db.session.commit()

    elif status == 'failed':
        payment.status = 'failed'
        db.session.commit()

    return jsonify({'status': 'ok'})


@api_v1_bp.route('/payments/<reference>', methods=['GET'])
@jwt_required(optional=True)
def get_payment_status(reference):
    """Get payment status."""
    payment = Payment.query.filter_by(reference=reference).first()

    if not payment:
        return jsonify({'error': 'Payment not found'}), 404

    return jsonify({
        'payment': payment.to_dict()
    })


@api_v1_bp.route('/my-payments', methods=['GET'])
@jwt_required()
def my_payments():
    """Get current user's payment history."""
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    query = Payment.query.filter_by(user_id=current_user_id)
    query = query.order_by(Payment.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'payments': [p.to_dict() for p in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })
