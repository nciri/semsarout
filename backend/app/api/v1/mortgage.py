"""Mortgage/loan simulator — pure calculation, no external bank API needed for v1."""
from flask import request, jsonify
from app.api.v1 import api_v1_bp


@api_v1_bp.route('/mortgage/simulate', methods=['POST'])
def simulate_mortgage():
    """
    Compute a standard amortized loan monthly payment.

    Body: { "price": 1500000, "down_payment": 300000, "annual_rate": 4.5, "years": 20 }
    """
    data = request.get_json() or {}

    try:
        price = float(data.get('price', 0))
        down_payment = float(data.get('down_payment', 0))
        annual_rate = float(data.get('annual_rate', 4.5))
        years = int(data.get('years', 20))
    except (TypeError, ValueError):
        return jsonify({'error': 'Paramètres invalides'}), 400

    if price <= 0 or years <= 0:
        return jsonify({'error': 'price et years doivent être positifs'}), 400
    if down_payment < 0 or down_payment >= price:
        return jsonify({'error': 'down_payment doit être inférieur au prix'}), 400
    if annual_rate < 0 or annual_rate > 30:
        return jsonify({'error': 'annual_rate hors limites raisonnables'}), 400

    principal = price - down_payment
    months = years * 12
    monthly_rate = (annual_rate / 100) / 12

    if monthly_rate == 0:
        monthly_payment = principal / months
    else:
        monthly_payment = principal * monthly_rate * (1 + monthly_rate) ** months / \
            ((1 + monthly_rate) ** months - 1)

    total_paid = monthly_payment * months
    total_interest = total_paid - principal

    return jsonify({
        'principal': round(principal, 2),
        'monthly_payment': round(monthly_payment, 2),
        'months': months,
        'total_paid': round(total_paid, 2),
        'total_interest': round(total_interest, 2),
        'annual_rate': annual_rate
    })
