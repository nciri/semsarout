"""Market price positioning: where a property's price/m² sits in its neighborhood.

Reference basis (in priority order):
  1. Manual `NeighborhoodPriceRef` for the neighborhood (if present).
  2. Auto: distribution of price/m² of active listings in the same
     city + neighborhood + transaction_type, filtered by property_type with
     fallback to neighborhood (all types), then city (by type), then city.
"""
import math
from functools import wraps
from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.api.v1 import api_v1_bp
from app.models import Property, NeighborhoodPriceRef, User

MIN_SAMPLE = 3  # minimum comparable listings for a trustworthy auto reference

SCOPE_LABELS = {
    'manual': 'référence quartier',
    'neighborhood_type': 'quartier · même type',
    'neighborhood': 'quartier',
    'city_type': 'ville · même type',
    'city': 'ville'
}


def _sqm(prop):
    """price/m² for a property, or None if not computable."""
    if prop.price_per_sqm:
        return float(prop.price_per_sqm)
    if prop.price and prop.surface and prop.surface > 0:
        return float(prop.price) / float(prop.surface)
    return None


def _percentile(sorted_vals, p):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return sorted_vals[0]
    k = (len(sorted_vals) - 1) * (p / 100.0)
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return sorted_vals[int(k)]
    return sorted_vals[f] * (c - k) + sorted_vals[c] * (k - f)


def _band(percent):
    if percent <= -15:
        return 'very_low', 'Bien en dessous du marché'
    if percent <= -5:
        return 'low', 'Sous le marché du quartier'
    if percent < 5:
        return 'average', 'Dans la moyenne du quartier'
    if percent < 15:
        return 'high', 'Au-dessus du marché'
    return 'very_high', 'Bien au-dessus du marché'


@api_v1_bp.route('/properties/<int:property_id>/price-position', methods=['GET'])
def price_position(property_id):
    """Return where this property's price/m² sits within its neighborhood."""
    prop = Property.query.get_or_404(property_id)

    sqm = _sqm(prop)
    if not sqm:
        return jsonify({'available': False, 'reason': 'no_surface'})

    tx = prop.transaction_type
    ptype = prop.property_type
    city = prop.city
    neighborhood = prop.neighborhood

    reference = low = high = None
    source = 'listings'
    scope = None
    sample_size = None

    # 1) Manual reference (priority)
    if city and neighborhood:
        base = NeighborhoodPriceRef.query.filter_by(
            city=city, neighborhood=neighborhood, transaction_type=tx
        )
        ref = base.filter_by(property_type=ptype).first() or base.filter_by(property_type=None).first()
        if ref and ref.avg_price_sqm:
            reference = float(ref.avg_price_sqm)
            low = float(ref.min_price_sqm) if ref.min_price_sqm else reference * 0.8
            high = float(ref.max_price_sqm) if ref.max_price_sqm else reference * 1.2
            source = 'manual'
            scope = 'manual'

    # 2) Auto from active listings
    if reference is None:
        attempts = []
        if city and neighborhood:
            attempts.append(('neighborhood_type',
                             [Property.city == city, Property.neighborhood == neighborhood,
                              Property.property_type == ptype]))
            attempts.append(('neighborhood',
                             [Property.city == city, Property.neighborhood == neighborhood]))
        if city:
            attempts.append(('city_type', [Property.city == city, Property.property_type == ptype]))
            attempts.append(('city', [Property.city == city]))

        for label, filters in attempts:
            rows = Property.query.filter(
                Property.status == 'active',
                Property.transaction_type == tx,
                Property.id != prop.id,
                *filters
            ).all()
            vals = sorted(v for v in (_sqm(r) for r in rows) if v and v > 0)
            if len(vals) >= MIN_SAMPLE:
                reference = _percentile(vals, 50)  # median
                low = _percentile(vals, 10)
                high = _percentile(vals, 90)
                scope = label
                sample_size = len(vals)
                break

    if reference is None:
        return jsonify({'available': False, 'reason': 'insufficient_data'})

    # Guard against degenerate bounds
    if high is None or low is None or high <= low:
        low, high = reference * 0.8, reference * 1.2

    percent = round((sqm - reference) / reference * 100, 1)
    position = max(0.0, min(1.0, (sqm - low) / (high - low)))
    band, label = _band(percent)

    return jsonify({
        'available': True,
        'transaction_type': tx,
        'property_type': ptype,
        'city': city,
        'neighborhood': neighborhood,
        'property_price_sqm': round(sqm, 2),
        'reference_price_sqm': round(reference, 2),
        'low_price_sqm': round(low, 2),
        'high_price_sqm': round(high, 2),
        'percent_vs_market': percent,
        'position': round(position, 4),
        'band': band,
        'label': label,
        'scope': scope,
        'scope_label': SCOPE_LABELS.get(scope, scope),
        'sample_size': sample_size,
        'source': source,
        'currency': 'Dh'
    })


# ============================================
# ADMIN — manage manual neighborhood references
# ============================================

def require_admin(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        user = User.query.get(int(get_jwt_identity()))
        if not user or (user.user_type != 'admin' and getattr(user, 'account_role', None) != 'admin'):
            return jsonify({'error': 'Accès réservé aux administrateurs'}), 403
        return f(*args, **kwargs)
    return decorated


@api_v1_bp.route('/market/neighborhood-prices', methods=['GET'])
@jwt_required()
@require_admin
def list_neighborhood_prices():
    refs = NeighborhoodPriceRef.query.order_by(
        NeighborhoodPriceRef.city, NeighborhoodPriceRef.neighborhood
    ).all()
    return jsonify({'references': [r.to_dict() for r in refs]})


@api_v1_bp.route('/market/neighborhood-prices', methods=['POST'])
@jwt_required()
@require_admin
def create_neighborhood_price():
    data = request.get_json() or {}
    for field in ('city', 'neighborhood', 'transaction_type', 'avg_price_sqm'):
        if not data.get(field):
            return jsonify({'error': f'{field} requis'}), 400
    if data['transaction_type'] not in ('sale', 'rent'):
        return jsonify({'error': 'transaction_type invalide'}), 400

    ref = NeighborhoodPriceRef(
        city=data['city'].strip(),
        neighborhood=data['neighborhood'].strip(),
        property_type=data.get('property_type') or None,
        transaction_type=data['transaction_type'],
        avg_price_sqm=data['avg_price_sqm'],
        min_price_sqm=data.get('min_price_sqm') or None,
        max_price_sqm=data.get('max_price_sqm') or None,
        source=data.get('source') or 'manuel'
    )
    db.session.add(ref)
    db.session.commit()
    return jsonify({'reference': ref.to_dict()}), 201


@api_v1_bp.route('/market/neighborhood-prices/<int:ref_id>', methods=['PUT'])
@jwt_required()
@require_admin
def update_neighborhood_price(ref_id):
    ref = NeighborhoodPriceRef.query.get_or_404(ref_id)
    data = request.get_json() or {}

    for field in ('city', 'neighborhood', 'transaction_type', 'avg_price_sqm', 'source'):
        if field in data and data[field]:
            setattr(ref, field, data[field])
    # Nullable fields: empty → NULL
    for field in ('property_type', 'min_price_sqm', 'max_price_sqm'):
        if field in data:
            setattr(ref, field, data[field] or None)

    db.session.commit()
    return jsonify({'reference': ref.to_dict()})


@api_v1_bp.route('/market/neighborhood-prices/<int:ref_id>', methods=['DELETE'])
@jwt_required()
@require_admin
def delete_neighborhood_price(ref_id):
    ref = NeighborhoodPriceRef.query.get_or_404(ref_id)
    db.session.delete(ref)
    db.session.commit()
    return jsonify({'message': 'Référence supprimée'})
