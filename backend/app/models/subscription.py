from datetime import datetime
from app import db


class SubscriptionPlan(db.Model):
    """Subscription plans for agencies."""
    __tablename__ = 'subscription_plans'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    slug = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.Text)

    # Limits
    max_listings = db.Column(db.Integer, nullable=False)  # -1 for unlimited
    max_featured = db.Column(db.Integer, default=0)
    max_urgent = db.Column(db.Integer, default=0)

    # Features
    has_api_access = db.Column(db.Boolean, default=False)
    has_csv_import = db.Column(db.Boolean, default=False)
    has_staymanager_sync = db.Column(db.Boolean, default=False)
    has_lead_contact = db.Column(db.Boolean, default=True)
    has_analytics = db.Column(db.Boolean, default=False)
    has_priority_support = db.Column(db.Boolean, default=False)

    # Pricing (MAD - Dirham marocain)
    price_monthly = db.Column(db.Numeric(10, 2), nullable=False)
    price_yearly = db.Column(db.Numeric(10, 2))  # Discounted yearly price

    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    subscriptions = db.relationship('Subscription', back_populates='plan')

    def to_dict(self):
        """Serialize plan to dictionary."""
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'max_listings': self.max_listings,
            'max_featured': self.max_featured,
            'max_urgent': self.max_urgent,
            'has_api_access': self.has_api_access,
            'has_csv_import': self.has_csv_import,
            'has_staymanager_sync': self.has_staymanager_sync,
            'has_lead_contact': self.has_lead_contact,
            'has_analytics': self.has_analytics,
            'has_priority_support': self.has_priority_support,
            'price_monthly': float(self.price_monthly),
            'price_yearly': float(self.price_yearly) if self.price_yearly else None
        }

    def __repr__(self):
        return f'<SubscriptionPlan {self.name}>'


class Subscription(db.Model):
    """Active subscriptions for agencies."""
    __tablename__ = 'subscriptions'

    id = db.Column(db.Integer, primary_key=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False)
    plan_id = db.Column(db.Integer, db.ForeignKey('subscription_plans.id'), nullable=False)

    # Billing
    billing_cycle = db.Column(db.String(10), default='monthly')  # 'monthly', 'yearly'
    amount = db.Column(db.Numeric(10, 2), nullable=False)

    # Status: 'active', 'cancelled', 'past_due', 'trialing'
    status = db.Column(db.String(20), default='active')

    # Dates
    start_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    end_date = db.Column(db.DateTime)
    trial_end = db.Column(db.DateTime)
    cancelled_at = db.Column(db.DateTime)

    # Usage tracking
    listings_used = db.Column(db.Integer, default=0)
    featured_used = db.Column(db.Integer, default=0)
    urgent_used = db.Column(db.Integer, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    agency = db.relationship('Agency', back_populates='subscription')
    plan = db.relationship('SubscriptionPlan', back_populates='subscriptions')

    def can_add_listing(self):
        """Check if subscription allows adding more listings."""
        if self.plan.max_listings == -1:
            return True
        return self.listings_used < self.plan.max_listings

    def to_dict(self):
        """Serialize subscription to dictionary."""
        return {
            'id': self.id,
            'agency_id': self.agency_id,
            'plan': self.plan.to_dict(),
            'billing_cycle': self.billing_cycle,
            'amount': float(self.amount),
            'status': self.status,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'listings_used': self.listings_used,
            'listings_remaining': self.plan.max_listings - self.listings_used if self.plan.max_listings != -1 else None
        }

    def __repr__(self):
        return f'<Subscription {self.id}>'


class PaymentMethod(db.Model):
    """Payment methods for agencies and users."""
    __tablename__ = 'payment_methods'

    id = db.Column(db.Integer, primary_key=True)

    # Owner: either user or agency
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)

    # Type: 'card', 'paypal', 'bank_transfer'
    type = db.Column(db.String(20), nullable=False)

    # Card details (masked)
    card_brand = db.Column(db.String(20))  # 'visa', 'mastercard', 'amex'
    card_last4 = db.Column(db.String(4))
    card_exp_month = db.Column(db.Integer)
    card_exp_year = db.Column(db.Integer)
    card_holder_name = db.Column(db.String(100))

    # PayPal details
    paypal_email = db.Column(db.String(255))

    # Stripe payment method ID
    stripe_payment_method_id = db.Column(db.String(100))

    # Default payment method
    is_default = db.Column(db.Boolean, default=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        data = {
            'id': self.id,
            'type': self.type,
            'is_default': self.is_default,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if self.type == 'card':
            data.update({
                'brand': self.card_brand,
                'last4': self.card_last4,
                'expiry': f'{self.card_exp_month:02d}/{str(self.card_exp_year)[-2:]}' if self.card_exp_month else None,
                'name': self.card_holder_name
            })
        elif self.type == 'paypal':
            data['email'] = self.paypal_email
        return data

    def __repr__(self):
        return f'<PaymentMethod {self.id} - {self.type}>'


class Invoice(db.Model):
    """Invoices for subscription billing."""
    __tablename__ = 'invoices'

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(30), unique=True, nullable=False, index=True)

    # Related subscription
    subscription_id = db.Column(db.Integer, db.ForeignKey('subscriptions.id'), nullable=False)
    subscription = db.relationship('Subscription', backref='invoices')

    # Owner
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)

    # Billing period
    period_start = db.Column(db.DateTime, nullable=False)
    period_end = db.Column(db.DateTime, nullable=False)
    period_label = db.Column(db.String(50))  # e.g., "Janvier 2026"

    # Amounts (in MAD)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)
    tax_rate = db.Column(db.Numeric(5, 2), default=20)  # TVA 20%
    tax_amount = db.Column(db.Numeric(10, 2))
    total = db.Column(db.Numeric(10, 2), nullable=False)

    # Currency
    currency = db.Column(db.String(3), default='MAD')

    # Status: 'draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded'
    status = db.Column(db.String(20), default='pending')

    # Payment
    payment_method_id = db.Column(db.Integer, db.ForeignKey('payment_methods.id'), nullable=True)
    paid_at = db.Column(db.DateTime)
    stripe_invoice_id = db.Column(db.String(100))
    stripe_payment_intent_id = db.Column(db.String(100))

    # Due date
    due_date = db.Column(db.DateTime, nullable=False)

    # PDF URL
    pdf_url = db.Column(db.String(255))

    # Notes
    notes = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'reference': self.reference,
            'subscription_id': self.subscription_id,
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'period_label': self.period_label,
            'subtotal': float(self.subtotal) if self.subtotal else None,
            'tax_rate': float(self.tax_rate) if self.tax_rate else None,
            'tax_amount': float(self.tax_amount) if self.tax_amount else None,
            'total': float(self.total) if self.total else None,
            'currency': self.currency,
            'status': self.status,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'paid_at': self.paid_at.isoformat() if self.paid_at else None,
            'pdf_url': self.pdf_url,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<Invoice {self.reference}>'
