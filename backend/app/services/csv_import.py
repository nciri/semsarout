import csv
import io
from app import db
from app.models import Property, Agency, User


class CSVImportService:
    """Service to import properties from CSV files."""

    REQUIRED_FIELDS = ['title', 'property_type', 'transaction_type', 'price', 'city']

    FIELD_MAPPING = {
        'titre': 'title',
        'description': 'description',
        'type': 'property_type',
        'transaction': 'transaction_type',
        'prix': 'price',
        'surface': 'surface',
        'pieces': 'rooms',
        'chambres': 'bedrooms',
        'sdb': 'bathrooms',
        'ville': 'city',
        'quartier': 'neighborhood',
        'adresse': 'address',
        'code_postal': 'postal_code',
    }

    def __init__(self, agency_id: int, user_id: int):
        self.agency = Agency.query.get(agency_id)
        self.user = User.query.get(user_id)
        self.errors = []
        self.imported = 0

    def normalize_field(self, field: str) -> str:
        """Normalize field name from French or common variants."""
        field_lower = field.lower().strip()
        return self.FIELD_MAPPING.get(field_lower, field_lower)

    def parse_csv(self, file_content: str) -> list:
        """Parse CSV content and return list of property dicts."""
        reader = csv.DictReader(io.StringIO(file_content))
        properties = []

        for row_num, row in enumerate(reader, start=2):
            # Normalize field names
            normalized_row = {}
            for key, value in row.items():
                norm_key = self.normalize_field(key)
                normalized_row[norm_key] = value.strip() if value else None

            # Validate required fields
            missing = []
            for field in self.REQUIRED_FIELDS:
                if not normalized_row.get(field):
                    missing.append(field)

            if missing:
                self.errors.append({
                    'row': row_num,
                    'error': f'Missing required fields: {", ".join(missing)}'
                })
                continue

            properties.append(normalized_row)

        return properties

    def import_properties(self, file_content: str) -> dict:
        """Import properties from CSV content."""
        if not self.agency:
            return {'success': False, 'error': 'Agency not found'}

        properties_data = self.parse_csv(file_content)

        for data in properties_data:
            try:
                property = Property(
                    reference=self._generate_reference(),
                    title=data['title'],
                    description=data.get('description'),
                    property_type=data['property_type'],
                    transaction_type=data['transaction_type'],
                    price=float(data['price']),
                    surface=float(data['surface']) if data.get('surface') else None,
                    rooms=int(data['rooms']) if data.get('rooms') else None,
                    bedrooms=int(data['bedrooms']) if data.get('bedrooms') else None,
                    bathrooms=int(data['bathrooms']) if data.get('bathrooms') else None,
                    city=data['city'],
                    neighborhood=data.get('neighborhood'),
                    address=data.get('address'),
                    postal_code=data.get('postal_code'),
                    owner_id=self.user.id,
                    agency_id=self.agency.id,
                    status='draft'
                )
                db.session.add(property)
                self.imported += 1
            except Exception as e:
                self.errors.append({
                    'data': data.get('title', 'Unknown'),
                    'error': str(e)
                })

        db.session.commit()

        return {
            'success': True,
            'imported': self.imported,
            'errors': self.errors
        }

    def _generate_reference(self) -> str:
        """Generate unique property reference."""
        import uuid
        return f"SEM-{uuid.uuid4().hex[:8].upper()}"
