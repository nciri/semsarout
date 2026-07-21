"""
Billing API endpoints for payment methods, invoices and subscription management.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from flask import request, jsonify, Response
from flask_jwt_extended import jwt_required, get_jwt_identity
from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from app import db
from app.api.v1 import api_v1_bp
from app.models import User, PaymentMethod, Invoice, Subscription, SubscriptionPlan


# ==================== PAYMENT METHODS ====================

@api_v1_bp.route('/payment-methods', methods=['GET'])
@jwt_required()
def list_payment_methods():
    """List user's payment methods."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    # Get payment methods for user or their agency
    if user.agency_id:
        methods = PaymentMethod.query.filter_by(agency_id=user.agency_id).all()
    else:
        methods = PaymentMethod.query.filter_by(user_id=user.id).all()

    return jsonify({
        'payment_methods': [pm.to_dict() for pm in methods]
    })


@api_v1_bp.route('/payment-methods', methods=['POST'])
@jwt_required()
def add_payment_method():
    """Add a new payment method."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    pm_type = data.get('type')

    if pm_type not in ['card', 'paypal']:
        return jsonify({'error': 'Invalid payment method type'}), 400

    # Check if this should be default
    existing_methods = PaymentMethod.query.filter_by(
        agency_id=user.agency_id if user.agency_id else None,
        user_id=user.id if not user.agency_id else None
    ).all()

    is_default = len(existing_methods) == 0 or data.get('is_default', False)

    # If setting as default, unset others
    if is_default:
        for method in existing_methods:
            method.is_default = False

    # Create payment method
    payment_method = PaymentMethod(
        user_id=user.id if not user.agency_id else None,
        agency_id=user.agency_id,
        type=pm_type,
        is_default=is_default
    )

    if pm_type == 'card':
        payment_method.card_brand = data.get('brand', 'visa').lower()
        payment_method.card_last4 = data.get('last4')
        expiry = data.get('expiry', '')
        if '/' in expiry:
            parts = expiry.split('/')
            payment_method.card_exp_month = int(parts[0])
            payment_method.card_exp_year = int('20' + parts[1]) if len(parts[1]) == 2 else int(parts[1])
        payment_method.card_holder_name = data.get('name')
    elif pm_type == 'paypal':
        payment_method.paypal_email = data.get('email')

    db.session.add(payment_method)
    db.session.commit()

    return jsonify({
        'message': 'Payment method added',
        'payment_method': payment_method.to_dict()
    }), 201


@api_v1_bp.route('/payment-methods/<int:pm_id>', methods=['DELETE'])
@jwt_required()
def delete_payment_method(pm_id):
    """Delete a payment method."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    pm = PaymentMethod.query.get_or_404(pm_id)

    # Verify ownership
    if user.agency_id:
        if pm.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
    else:
        if pm.user_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    was_default = pm.is_default
    db.session.delete(pm)

    # If deleted was default, make another one default
    if was_default:
        other = PaymentMethod.query.filter_by(
            agency_id=user.agency_id if user.agency_id else None,
            user_id=user.id if not user.agency_id else None
        ).first()
        if other:
            other.is_default = True

    db.session.commit()

    return jsonify({'message': 'Payment method deleted'})


@api_v1_bp.route('/payment-methods/<int:pm_id>/set-default', methods=['POST'])
@jwt_required()
def set_default_payment_method(pm_id):
    """Set a payment method as default."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    pm = PaymentMethod.query.get_or_404(pm_id)

    # Verify ownership
    if user.agency_id:
        if pm.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
        methods = PaymentMethod.query.filter_by(agency_id=user.agency_id).all()
    else:
        if pm.user_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403
        methods = PaymentMethod.query.filter_by(user_id=user.id).all()

    # Unset all others, set this one
    for method in methods:
        method.is_default = (method.id == pm_id)

    db.session.commit()

    return jsonify({'message': 'Default payment method updated'})


# ==================== INVOICES ====================

@api_v1_bp.route('/invoices', methods=['GET'])
@jwt_required()
def list_invoices():
    """List user's invoices."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    # Get invoices for user or their agency
    if user.agency_id:
        query = Invoice.query.filter_by(agency_id=user.agency_id)
    else:
        query = Invoice.query.filter_by(user_id=user.id)

    query = query.order_by(Invoice.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'invoices': [inv.to_dict() for inv in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': page
    })


@api_v1_bp.route('/invoices/<int:invoice_id>', methods=['GET'])
@jwt_required()
def get_invoice(invoice_id):
    """Get invoice details."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    invoice = Invoice.query.get_or_404(invoice_id)

    # Verify ownership
    if user.agency_id:
        if invoice.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
    else:
        if invoice.user_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    return jsonify({'invoice': invoice.to_dict()})


@api_v1_bp.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
@jwt_required()
def download_invoice_pdf(invoice_id):
    """Download invoice as PDF."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    invoice = Invoice.query.get_or_404(invoice_id)

    # Verify ownership
    if user.agency_id:
        if invoice.agency_id != user.agency_id:
            return jsonify({'error': 'Unauthorized'}), 403
    else:
        if invoice.user_id != user.id:
            return jsonify({'error': 'Unauthorized'}), 403

    # Generate PDF
    pdf_buffer = generate_invoice_pdf(invoice, user)

    return Response(
        pdf_buffer.getvalue(),
        mimetype='application/pdf',
        headers={
            'Content-Disposition': f'attachment; filename={invoice.reference}.pdf'
        }
    )


def generate_invoice_pdf(invoice, user):
    """Generate a PDF invoice using ReportLab."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)

    styles = getSampleStyleSheet()
    story = []

    # Colors
    primary_color = colors.HexColor('#1e3a5f')
    gray_color = colors.HexColor('#6b7280')

    # Header
    header_style = ParagraphStyle(
        'Header',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=primary_color,
        spaceAfter=10
    )
    story.append(Paragraph('SemsarOut', header_style))
    story.append(Paragraph('www.semsarout.com', styles['Normal']))
    story.append(Spacer(1, 20))

    # Invoice info
    info_style = ParagraphStyle('Info', parent=styles['Normal'], fontSize=10)
    story.append(Paragraph(f'<b>FACTURE</b> {invoice.reference}', header_style))
    story.append(Paragraph(f'Date: {invoice.created_at.strftime("%d/%m/%Y")}', info_style))
    story.append(Paragraph(f'Période: {invoice.period_label}', info_style))
    story.append(Spacer(1, 20))

    # Client info
    client_name = f'{user.first_name} {user.last_name}' if user.first_name else user.email
    story.append(Paragraph(f'<b>Facturé à:</b> {client_name}', info_style))
    story.append(Paragraph(f'Email: {user.email}', info_style))
    story.append(Spacer(1, 20))

    # Items table
    plan_name = invoice.subscription.plan.name if invoice.subscription else 'Abonnement'
    table_data = [
        ['Description', 'Qté', 'Prix unitaire', 'Total'],
        [f'Abonnement {plan_name} - {invoice.period_label}', '1', f'{invoice.subtotal:.2f} MAD', f'{invoice.subtotal:.2f} MAD'],
    ]

    table = Table(table_data, colWidths=[250, 50, 80, 80])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), primary_color),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 1, colors.lightgrey),
    ]))
    story.append(table)
    story.append(Spacer(1, 20))

    # Totals
    totals_data = [
        ['', '', 'Sous-total HT:', f'{invoice.subtotal:.2f} MAD'],
        ['', '', f'TVA ({invoice.tax_rate}%):', f'{invoice.tax_amount:.2f} MAD'],
        ['', '', 'Total TTC:', f'{invoice.total:.2f} MAD'],
    ]
    totals_table = Table(totals_data, colWidths=[200, 60, 100, 100])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (2, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (2, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (2, -1), (-1, -1), primary_color),
        ('TEXTCOLOR', (2, -1), (-1, -1), colors.white),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 20))

    # Status
    if invoice.status == 'paid':
        status_style = ParagraphStyle('Status', parent=styles['Normal'], textColor=colors.green)
        story.append(Paragraph('✓ PAYÉE', status_style))

    # Footer
    story.append(Spacer(1, 40))
    footer_style = ParagraphStyle('Footer', parent=styles['Normal'], fontSize=8, textColor=gray_color)
    story.append(Paragraph('SemsarOut SARL - RC: 123456 - IF: 12345678 - ICE: 001234567000012', footer_style))
    story.append(Paragraph('Pour toute question: facturation@semsarout.com', footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer


# ==================== SUBSCRIPTION MANAGEMENT ====================

@api_v1_bp.route('/subscription/change-plan', methods=['POST'])
@jwt_required()
def change_plan():
    """Change subscription plan (upgrade/downgrade)."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json()
    new_plan_id = data.get('plan_id')
    payment_method_id = data.get('payment_method_id')

    if not new_plan_id:
        return jsonify({'error': 'plan_id is required'}), 400

    # Get new plan
    new_plan = SubscriptionPlan.query.get(new_plan_id)
    if not new_plan:
        new_plan = SubscriptionPlan.query.filter_by(slug=new_plan_id).first()
    if not new_plan or not new_plan.is_active:
        return jsonify({'error': 'Plan not found'}), 404

    # Get or verify payment method
    if user.agency_id:
        pm = PaymentMethod.query.filter_by(agency_id=user.agency_id, is_default=True).first()
    else:
        pm = PaymentMethod.query.filter_by(user_id=user.id, is_default=True).first()

    if payment_method_id:
        pm = PaymentMethod.query.get(payment_method_id)
        # Security: Verify ownership of payment method (prevent IDOR)
        if pm:
            if user.agency_id and pm.agency_id != user.agency_id:
                return jsonify({'error': 'Unauthorized access to payment method'}), 403
            elif not user.agency_id and pm.user_id != user.id:
                return jsonify({'error': 'Unauthorized access to payment method'}), 403

    if not pm:
        return jsonify({'error': 'No payment method found. Please add a payment method first.'}), 400

    # Get or create subscription
    if user.agency_id:
        subscription = Subscription.query.filter_by(agency_id=user.agency_id).first()
    else:
        # For individual users, we need to handle differently
        # For now, require agency
        return jsonify({'error': 'Individual subscriptions not yet supported'}), 400

    now = datetime.utcnow()
    billing_cycle = data.get('billing_cycle', 'monthly')

    if billing_cycle == 'yearly' and new_plan.price_yearly:
        amount = new_plan.price_yearly
        end_date = now + timedelta(days=365)
    else:
        amount = new_plan.price_monthly
        end_date = now + timedelta(days=30)
        billing_cycle = 'monthly'

    if subscription:
        # Update existing subscription - set to pending until payment is confirmed
        subscription.plan_id = new_plan.id
        subscription.billing_cycle = billing_cycle
        subscription.amount = amount
        subscription.status = 'incomplete'  # Wait for payment confirmation
        subscription.end_date = end_date
        subscription.updated_at = now
    else:
        # Create new subscription - set to pending until payment is confirmed
        subscription = Subscription(
            agency_id=user.agency_id,
            plan_id=new_plan.id,
            billing_cycle=billing_cycle,
            amount=amount,
            status='incomplete',  # Wait for payment confirmation
            start_date=now,
            end_date=end_date
        )
        db.session.add(subscription)
        db.session.flush()  # Get subscription ID

    # Create invoice
    month_names = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                   'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

    invoice_count = Invoice.query.filter(
        db.extract('year', Invoice.created_at) == now.year
    ).count()

    invoice = Invoice(
        reference=f'INV-{now.year}-{str(invoice_count + 1).zfill(3)}',
        subscription_id=subscription.id,
        agency_id=user.agency_id,
        user_id=user.id,
        period_start=now,
        period_end=end_date,
        period_label=f'{month_names[now.month - 1]} {now.year}',
        subtotal=Decimal(str(float(amount) * 0.8)),  # HT
        tax_rate=Decimal('20'),
        tax_amount=Decimal(str(float(amount) * 0.2)),
        total=amount,
        status='pending',  # Wait for payment gateway confirmation
        payment_method_id=pm.id,
        paid_at=None,  # Set after payment is confirmed
        due_date=now
    )

    db.session.add(invoice)
    db.session.commit()

    return jsonify({
        'message': 'Subscription updated successfully',
        'subscription': subscription.to_dict(),
        'invoice': invoice.to_dict()
    })


@api_v1_bp.route('/subscription/current', methods=['GET'])
@jwt_required()
def get_current_subscription():
    """Get current user's subscription with full details."""
    current_user_id = int(get_jwt_identity())
    user = User.query.get(current_user_id)

    if not user:
        return jsonify({'error': 'User not found'}), 404

    subscription = None
    if user.agency_id:
        subscription = Subscription.query.filter_by(agency_id=user.agency_id).first()

    # Get all available plans
    plans = SubscriptionPlan.query.filter_by(is_active=True).order_by(SubscriptionPlan.price_monthly).all()

    return jsonify({
        'subscription': subscription.to_dict() if subscription else None,
        'current_plan': subscription.plan.slug if subscription else 'free',
        'plans': [p.to_dict() for p in plans]
    })
