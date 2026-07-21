from datetime import datetime
from app import db


class Property(db.Model):
    """Property listing model."""
    __tablename__ = 'properties'

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(20), unique=True, nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text)

    # Type: 'apartment', 'house', 'villa', 'land', 'commercial', 'office'
    property_type = db.Column(db.String(20), nullable=False)
    # Transaction: 'sale', 'rent', 'vacation_rental'
    transaction_type = db.Column(db.String(20), nullable=False)

    # Price
    price = db.Column(db.Numeric(12, 2), nullable=False)
    price_per_sqm = db.Column(db.Numeric(10, 2))
    charges = db.Column(db.Numeric(10, 2))  # Monthly charges for rent

    # Characteristics
    surface = db.Column(db.Float)  # m2
    land_surface = db.Column(db.Float)  # m2 for land/house
    rooms = db.Column(db.Integer)
    bedrooms = db.Column(db.Integer)
    bathrooms = db.Column(db.Integer)
    floor = db.Column(db.Integer)
    total_floors = db.Column(db.Integer)
    construction_year = db.Column(db.Integer)

    # Features (JSON array)
    features = db.Column(db.JSON, default=list)
    # Examples: parking, garage, terrace, balcony, garden, pool, elevator, etc.

    # Energy
    energy_class = db.Column(db.String(1))  # A-G
    ges_class = db.Column(db.String(1))  # A-G

    # Location
    address = db.Column(db.String(255))
    city = db.Column(db.String(100), nullable=False, index=True)
    neighborhood = db.Column(db.String(100))
    postal_code = db.Column(db.String(10))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)

    # Status: 'draft', 'active', 'pending', 'sold', 'rented', 'archived'
    status = db.Column(db.String(20), default='draft')

    # Visibility options
    is_premium = db.Column(db.Boolean, default=False)
    is_urgent = db.Column(db.Boolean, default=False)
    urgent_until = db.Column(db.DateTime)  # When urgent status expires
    is_featured = db.Column(db.Boolean, default=False)
    boost_until = db.Column(db.DateTime)

    # Stats
    views_count = db.Column(db.Integer, default=0)
    contacts_count = db.Column(db.Integer, default=0)
    favorites_count = db.Column(db.Integer, default=0)

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = db.Column(db.DateTime)

    # Relationships
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    owner = db.relationship('User', back_populates='properties')

    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=True)
    agency = db.relationship('Agency', back_populates='properties')

    images = db.relationship('PropertyImage', back_populates='property',
                            lazy='dynamic', cascade='all, delete-orphan',
                            order_by='PropertyImage.position')

    documents = db.relationship('PropertyDocument', back_populates='property',
                               lazy='dynamic', cascade='all, delete-orphan')

    def to_dict(self, include_images=True):
        """Serialize property to dictionary."""
        data = {
            'id': self.id,
            'reference': self.reference,
            'title': self.title,
            'description': self.description,
            'property_type': self.property_type,
            'transaction_type': self.transaction_type,
            'price': float(self.price) if self.price else None,
            'price_per_sqm': float(self.price_per_sqm) if self.price_per_sqm else None,
            'charges': float(self.charges) if self.charges else None,
            'surface': self.surface,
            'land_surface': self.land_surface,
            'rooms': self.rooms,
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'floor': self.floor,
            'total_floors': self.total_floors,
            'construction_year': self.construction_year,
            'features': self.features or [],
            'energy_class': self.energy_class,
            'ges_class': self.ges_class,
            'address': self.address,
            'city': self.city,
            'neighborhood': self.neighborhood,
            'postal_code': self.postal_code,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'status': self.status,
            'is_premium': self.is_premium,
            'is_urgent': self.is_urgent,
            'urgent_until': self.urgent_until.isoformat() if self.urgent_until else None,
            'is_featured': self.is_featured,
            'views_count': self.views_count,
            'contacts_count': self.contacts_count,
            'favorites_count': self.favorites_count,
            'owner_id': self.owner_id,
            'agency_id': self.agency_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None
        }
        if include_images:
            data['images'] = [img.to_dict() for img in self.images]
        return data

    def __repr__(self):
        return f'<Property {self.reference}>'


class PropertyDocument(db.Model):
    """Documents attached to a property (sale dossier): title deed, ID, plans..."""
    __tablename__ = 'property_documents'

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)

    # 'titre_foncier', 'cin', 'plan', 'reglement_copropriete', 'diagnostic', 'autre'
    doc_type = db.Column(db.String(30), nullable=False, default='autre')
    file_url = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    property = db.relationship('Property', back_populates='documents')

    def to_dict(self):
        """Serialize document to dictionary.

        The raw stored filename is never exposed: access goes through the
        authenticated /api/v1/documents/<id> endpoint (owner or admin only).
        """
        return {
            'id': self.id,
            'doc_type': self.doc_type,
            'download_url': f'/api/v1/documents/{self.id}',
            'original_name': self.original_name,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<PropertyDocument {self.id}>'


class PropertyImage(db.Model):
    """Property images model."""
    __tablename__ = 'property_images'

    id = db.Column(db.Integer, primary_key=True)
    property_id = db.Column(db.Integer, db.ForeignKey('properties.id'), nullable=False)
    url = db.Column(db.String(255), nullable=False)
    thumbnail_url = db.Column(db.String(255))
    caption = db.Column(db.String(200))
    position = db.Column(db.Integer, default=0)
    is_primary = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    property = db.relationship('Property', back_populates='images')

    def to_dict(self):
        """Serialize image to dictionary."""
        return {
            'id': self.id,
            'url': self.url,
            'thumbnail_url': self.thumbnail_url,
            'caption': self.caption,
            'position': self.position,
            'is_primary': self.is_primary
        }

    def __repr__(self):
        return f'<PropertyImage {self.id}>'
