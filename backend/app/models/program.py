from datetime import datetime
from app import db


class Program(db.Model):
    """Real estate program/project with multiple units."""
    __tablename__ = 'programs'

    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(50), unique=True, index=True)
    name = db.Column(db.String(255), nullable=False)
    slug = db.Column(db.String(255), unique=True, index=True)
    description = db.Column(db.Text)

    # Program type
    program_type = db.Column(db.String(50))  # residential, commercial, mixed

    # Location
    address = db.Column(db.String(255))
    city = db.Column(db.String(100), index=True)
    neighborhood = db.Column(db.String(100))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)

    # Project details
    total_units = db.Column(db.Integer, default=0)
    available_units = db.Column(db.Integer, default=0)
    min_price = db.Column(db.Numeric(12, 2))
    max_price = db.Column(db.Numeric(12, 2))
    delivery_date = db.Column(db.Date)  # Expected delivery
    construction_status = db.Column(db.String(50), default='planning')  # planning, under_construction, delivered

    # Features (JSON array)
    amenities = db.Column(db.JSON)  # pool, gym, security, parking, etc.

    # Media
    cover_image_url = db.Column(db.String(500))
    brochure_url = db.Column(db.String(500))
    video_url = db.Column(db.String(500))

    # Status
    status = db.Column(db.String(20), default='draft')  # draft, active, completed, archived

    # Ownership
    agency_id = db.Column(db.Integer, db.ForeignKey('agencies.id'), nullable=False)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    published_at = db.Column(db.DateTime)

    # Analytics
    views_count = db.Column(db.Integer, default=0)
    contacts_count = db.Column(db.Integer, default=0)

    # Relationships
    agency = db.relationship('Agency', backref='programs')
    created_by = db.relationship('User')
    units = db.relationship('ProgramUnit', back_populates='program', cascade='all, delete-orphan')
    images = db.relationship('ProgramImage', back_populates='program', cascade='all, delete-orphan')
    plans = db.relationship('ProgramPlan', back_populates='program', cascade='all, delete-orphan',
                            order_by='ProgramPlan.position')

    def to_dict(self, include_units=False, include_images=False):
        """Serialize program to dictionary."""
        data = {
            'id': self.id,
            'reference': self.reference,
            'name': self.name,
            'slug': self.slug,
            'description': self.description,
            'program_type': self.program_type,
            'address': self.address,
            'city': self.city,
            'neighborhood': self.neighborhood,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'total_units': self.total_units,
            'available_units': self.available_units,
            'min_price': float(self.min_price) if self.min_price else None,
            'max_price': float(self.max_price) if self.max_price else None,
            'delivery_date': self.delivery_date.isoformat() if self.delivery_date else None,
            'construction_status': self.construction_status,
            'amenities': self.amenities,
            'cover_image_url': self.cover_image_url,
            'brochure_url': self.brochure_url,
            'video_url': self.video_url,
            'status': self.status,
            'agency_id': self.agency_id,
            'agency_name': self.agency.name if self.agency else None,
            'agency_phone': self.agency.phone if self.agency else None,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'published_at': self.published_at.isoformat() if self.published_at else None,
            'views_count': self.views_count,
            'contacts_count': self.contacts_count
        }

        if include_units:
            data['units'] = [unit.to_dict() for unit in self.units]

        if include_images:
            data['images'] = [img.to_dict() for img in self.images]

        return data

    def __repr__(self):
        return f'<Program {self.name}>'


class ProgramUnit(db.Model):
    """A unit type within a program (e.g., T2, T3, Villa Type A)."""
    __tablename__ = 'program_units'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False)

    name = db.Column(db.String(100), nullable=False)  # "Appartement T2", "Villa Type A"
    unit_type = db.Column(db.String(50))  # apartment, villa, duplex, studio

    # Specifications
    surface_min = db.Column(db.Float)
    surface_max = db.Column(db.Float)
    rooms = db.Column(db.Integer)
    bedrooms = db.Column(db.Integer)
    bathrooms = db.Column(db.Integer)

    # Pricing
    price_from = db.Column(db.Numeric(12, 2))
    price_to = db.Column(db.Numeric(12, 2))

    # Availability
    total_count = db.Column(db.Integer, default=0)
    available_count = db.Column(db.Integer, default=0)

    # Features specific to this unit type
    features = db.Column(db.JSON)
    floor_plan_url = db.Column(db.String(500))

    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    program = db.relationship('Program', back_populates='units')
    images = db.relationship('ProgramUnitImage', back_populates='unit', cascade='all, delete-orphan')

    def to_dict(self, include_images=False):
        """Serialize unit to dictionary."""
        data = {
            'id': self.id,
            'program_id': self.program_id,
            'name': self.name,
            'unit_type': self.unit_type,
            'surface_min': self.surface_min,
            'surface_max': self.surface_max,
            'rooms': self.rooms,
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'price_from': float(self.price_from) if self.price_from else None,
            'price_to': float(self.price_to) if self.price_to else None,
            'total_count': self.total_count,
            'available_count': self.available_count,
            'features': self.features,
            'floor_plan_url': self.floor_plan_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

        if include_images:
            data['images'] = [img.to_dict() for img in self.images]

        return data

    def __repr__(self):
        return f'<ProgramUnit {self.name}>'


class ProgramImage(db.Model):
    """Images for a program."""
    __tablename__ = 'program_images'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.String(255))
    image_type = db.Column(db.String(50))  # exterior, interior, amenity, plan
    position = db.Column(db.Integer, default=0)

    # Relationships
    program = db.relationship('Program', back_populates='images')

    def to_dict(self):
        """Serialize image to dictionary."""
        return {
            'id': self.id,
            'program_id': self.program_id,
            'url': self.url,
            'caption': self.caption,
            'image_type': self.image_type,
            'position': self.position
        }

    def __repr__(self):
        return f'<ProgramImage {self.id}>'


class ProgramUnitImage(db.Model):
    """Images for a specific unit type within a program."""
    __tablename__ = 'program_unit_images'

    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('program_units.id'), nullable=False)
    url = db.Column(db.String(500), nullable=False)
    caption = db.Column(db.String(255))
    image_type = db.Column(db.String(50))  # floor_plan, bedroom, living_room, kitchen, bathroom, exterior, amenity
    position = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationships
    unit = db.relationship('ProgramUnit', back_populates='images')

    def to_dict(self):
        """Serialize unit image to dictionary."""
        return {
            'id': self.id,
            'unit_id': self.unit_id,
            'url': self.url,
            'caption': self.caption,
            'image_type': self.image_type,
            'position': self.position,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<ProgramUnitImage {self.id}>'


# Lot status values used across the interactive lot plan feature
LOT_STATUSES = ('available', 'reserved', 'sold')


class ProgramPlan(db.Model):
    """A visual plan (masterplan / floor plan) of a program, on which
    individual lots are positioned as SVG polygon zones."""
    __tablename__ = 'program_plans'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False, index=True)

    name = db.Column(db.String(150), nullable=False)  # "Plan de masse", "Étage 3"...
    image_url = db.Column(db.String(500))
    position = db.Column(db.Integer, default=0)  # ordering among a program's plans

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    program = db.relationship('Program', back_populates='plans')
    lots = db.relationship('ProgramLot', back_populates='plan', cascade='all, delete-orphan')

    def status_counts(self):
        counts = {s: 0 for s in LOT_STATUSES}
        for lot in self.lots:
            if lot.status in counts:
                counts[lot.status] += 1
        return counts

    def to_dict(self, include_lots=True):
        data = {
            'id': self.id,
            'program_id': self.program_id,
            'name': self.name,
            'image_url': self.image_url,
            'position': self.position,
            'status_counts': self.status_counts(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
        if include_lots:
            data['lots'] = [lot.to_dict() for lot in self.lots]
        return data

    def __repr__(self):
        return f'<ProgramPlan {self.name}>'


class ProgramLot(db.Model):
    """An individual sellable lot positioned on a program plan.

    Autonomous: carries its own specs rather than referencing a unit type.
    `zone` stores the polygon as a list of normalized points [{x, y}, ...] with
    x/y in 0..1 relative to the plan image, so it scales responsively."""
    __tablename__ = 'program_lots'

    id = db.Column(db.Integer, primary_key=True)
    program_id = db.Column(db.Integer, db.ForeignKey('programs.id'), nullable=False, index=True)
    plan_id = db.Column(db.Integer, db.ForeignKey('program_plans.id'), nullable=False, index=True)

    reference = db.Column(db.String(50))          # "A302", "Lot 45"
    title = db.Column(db.String(150))
    lot_type = db.Column(db.String(30))           # apartment, villa, terrain, commercial...

    surface = db.Column(db.Float)
    rooms = db.Column(db.Integer)
    bedrooms = db.Column(db.Integer)
    bathrooms = db.Column(db.Integer)
    floor = db.Column(db.Integer)
    price = db.Column(db.Numeric(12, 2))

    # available | reserved | sold
    status = db.Column(db.String(20), default='available', index=True)

    zone = db.Column(db.JSON)                     # [{x, y}, ...] normalized 0..1
    description = db.Column(db.Text)
    image_url = db.Column(db.String(500))

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    plan = db.relationship('ProgramPlan', back_populates='lots')

    def to_dict(self):
        return {
            'id': self.id,
            'program_id': self.program_id,
            'plan_id': self.plan_id,
            'reference': self.reference,
            'title': self.title,
            'lot_type': self.lot_type,
            'surface': self.surface,
            'rooms': self.rooms,
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'floor': self.floor,
            'price': float(self.price) if self.price is not None else None,
            'status': self.status,
            'zone': self.zone or [],
            'description': self.description,
            'image_url': self.image_url,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def __repr__(self):
        return f'<ProgramLot {self.reference} {self.status}>'
