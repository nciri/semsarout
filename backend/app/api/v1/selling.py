"""Online selling journey: file uploads, price estimation, sale requests."""
import os
import uuid
from datetime import datetime
from statistics import median

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from app import db
from app.api.v1 import api_v1_bp
from app.models import Property, PropertyImage, PropertyDocument, Lead, User

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'pdf'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

VALID_DOC_TYPES = {
    'titre_foncier', 'cin', 'plan', 'reglement_copropriete', 'diagnostic', 'autre'
}


def uploads_dir(kind):
    """Storage directory per file kind.

    'photos' is served publicly (listing images); 'documents' holds sensitive
    PII (title deeds, ID cards) and is only accessible through the
    authenticated /documents/<id> endpoint.
    """
    base = current_app.config.get(
        'UPLOAD_FOLDER',
        os.path.join(current_app.root_path, '..', 'uploads')
    )
    path = os.path.join(base, kind)
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)


@api_v1_bp.route('/uploads', methods=['POST'])
@jwt_required()
def upload_file():
    """Upload a photo or document (multipart/form-data, fields 'file' and 'kind')."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    kind = request.form.get('kind', 'photo')
    if kind not in ('photo', 'document'):
        return jsonify({'error': 'Invalid kind (photo or document)'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    allowed = ALLOWED_EXTENSIONS if kind == 'document' else ALLOWED_EXTENSIONS - {'pdf'}
    if ext not in allowed:
        return jsonify({'error': f'File type not allowed (accepted: {", ".join(sorted(allowed))})'}), 400

    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({'error': 'File too large (max 10 MB)'}), 400

    stored_name = f"{uuid.uuid4().hex}.{ext}"

    if kind == 'photo':
        file.save(os.path.join(uploads_dir('photos'), stored_name))
        return jsonify({
            'url': f'/uploads/photos/{stored_name}',
            'original_name': secure_filename(file.filename)
        }), 201

    # Documents are stored privately: no public URL, only an opaque id the
    # wizard passes back at submission time.
    file.save(os.path.join(uploads_dir('documents'), stored_name))
    return jsonify({
        'file_id': stored_name,
        'original_name': secure_filename(file.filename)
    }), 201


@api_v1_bp.route('/documents/<int:doc_id>', methods=['GET'])
@jwt_required()
def download_document(doc_id):
    """Serve a property document to its owner (or an admin)."""
    from flask import send_from_directory
    from app.models import PropertyDocument

    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)
    doc = PropertyDocument.query.get_or_404(doc_id)

    is_owner = doc.property.owner_id == current_user_id
    is_admin = user is not None and user.user_type == 'admin'
    if not (is_owner or is_admin):
        return jsonify({'error': 'Unauthorized'}), 403

    # file_url stores the opaque stored filename (no path component)
    filename = os.path.basename(doc.file_url)
    return send_from_directory(uploads_dir('documents'), filename)


@api_v1_bp.route('/estimate', methods=['POST'])
def estimate_price():
    """Estimate a sale price from comparable active listings."""
    data = request.get_json() or {}

    city = data.get('city')
    property_type = data.get('property_type')
    surface = data.get('surface')

    if not city or not property_type or not surface:
        return jsonify({'error': 'city, property_type and surface are required'}), 400

    try:
        surface = float(surface)
    except (TypeError, ValueError):
        return jsonify({'error': 'surface must be a number'}), 400
    if surface <= 0:
        return jsonify({'error': 'surface must be positive'}), 400

    base = Property.query.filter(
        Property.transaction_type == 'sale',
        Property.status == 'active',
        Property.price.isnot(None),
        Property.surface.isnot(None),
        Property.surface > 0
    )

    # Narrowest comparable set first, then widen
    scopes = [
        ('city_and_type', base.filter(Property.city.ilike(city), Property.property_type == property_type)),
        ('city', base.filter(Property.city.ilike(city))),
        ('type', base.filter(Property.property_type == property_type)),
    ]

    comparables, scope_used = [], None
    for scope_name, query in scopes:
        rows = query.limit(500).all()
        if len(rows) >= 3:
            comparables, scope_used = rows, scope_name
            break

    if not comparables:
        return jsonify({
            'available': False,
            'message': 'Pas assez de biens comparables pour estimer'
        })

    ppsqm = median(float(p.price) / p.surface for p in comparables)
    estimate = ppsqm * surface

    return jsonify({
        'available': True,
        'scope': scope_used,
        'comparables_count': len(comparables),
        'price_per_sqm': round(ppsqm),
        'estimate': round(estimate),
        'estimate_low': round(estimate * 0.9),
        'estimate_high': round(estimate * 1.1)
    })


@api_v1_bp.route('/sale-requests', methods=['POST'])
@jwt_required()
def create_sale_request():
    """Submit a complete online sale dossier.

    Creates the property in 'pending' status (awaiting expert validation),
    attaches photos and documents, and opens a lead for the sales team.
    """
    current_user_id = int(get_jwt_identity()) if get_jwt_identity() else None
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json() or {}
    prop_data = data.get('property') or {}

    required = ['property_type', 'city', 'surface']
    for field in required:
        if not prop_data.get(field):
            return jsonify({'error': f'property.{field} is required'}), 400

    if not data.get('desired_price'):
        return jsonify({'error': 'desired_price is required'}), 400

    photos = data.get('photos') or []
    documents = data.get('documents') or []
    wants_pro_photos = bool(data.get('wants_pro_photos'))

    if not photos and not wants_pro_photos:
        return jsonify({'error': 'At least one photo or the professional shooting option is required'}), 400

    type_labels = {
        'apartment': 'Appartement', 'house': 'Maison', 'villa': 'Villa',
        'riad': 'Riad', 'land': 'Terrain', 'commercial': 'Local commercial',
        'office': 'Bureau', 'garage': 'Garage/Parking'
    }
    title = prop_data.get('title')
    if not title:
        label = type_labels.get(prop_data['property_type'], 'Bien')
        rooms = prop_data.get('rooms')
        title = f"{label}{f' {rooms} pièces' if rooms else ''} - {prop_data['city']}"

    from app.api.v1.properties import generate_reference

    surface = float(prop_data['surface'])
    price = float(data['desired_price'])

    property = Property(
        reference=generate_reference(),
        title=title,
        description=prop_data.get('description'),
        property_type=prop_data['property_type'],
        transaction_type='sale',
        price=price,
        price_per_sqm=round(price / surface, 2) if surface else None,
        surface=surface,
        land_surface=prop_data.get('land_surface'),
        rooms=prop_data.get('rooms'),
        bedrooms=prop_data.get('bedrooms'),
        bathrooms=prop_data.get('bathrooms'),
        floor=prop_data.get('floor'),
        total_floors=prop_data.get('total_floors'),
        construction_year=prop_data.get('construction_year'),
        features=prop_data.get('features', []),
        address=prop_data.get('address'),
        city=prop_data['city'],
        neighborhood=prop_data.get('neighborhood'),
        postal_code=prop_data.get('postal_code'),
        owner_id=user.id,
        agency_id=user.agency_id,
        status='pending'
    )
    db.session.add(property)
    db.session.flush()  # get property.id for images/documents

    for idx, url in enumerate(photos):
        db.session.add(PropertyImage(
            property_id=property.id,
            url=url,
            position=idx,
            is_primary=(idx == 0)
        ))

    for doc in documents:
        file_id = doc.get('file_id')
        if not file_id:
            continue
        # Opaque filename only — reject anything that looks like a path
        file_id = os.path.basename(file_id)
        if not os.path.exists(os.path.join(uploads_dir('documents'), file_id)):
            continue
        doc_type = doc.get('doc_type')
        db.session.add(PropertyDocument(
            property_id=property.id,
            doc_type=doc_type if doc_type in VALID_DOC_TYPES else 'autre',
            file_url=file_id,
            original_name=doc.get('original_name')
        ))

    summary = (
        f"Dossier de vente en ligne {property.reference} - {title} - "
        f"Prix souhaité : {int(price)} MAD - "
        f"{len(photos)} photo(s), {len(documents)} document(s)"
        f"{' - Shooting pro demandé' if wants_pro_photos else ''}"
    )
    lead = Lead(
        name=user.full_name,
        email=user.email,
        phone=user.phone,
        message=data.get('notes') or summary,
        notes=summary,
        source='service_request',
        service='vente',
        owner_id=user.id
    )
    db.session.add(lead)
    db.session.commit()

    return jsonify({
        'message': 'Sale request submitted successfully',
        'property': property.to_dict(),
        'documents': [d.to_dict() for d in property.documents],
        'reference': property.reference
    }), 201
