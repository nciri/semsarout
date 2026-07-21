"""Comprehensive seed script for testing all functionalities."""
import os
import sys
import random
import uuid
from datetime import datetime, timedelta

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app import create_app, db
from app.models import (
    User, Agency, Property, PropertyImage, SubscriptionPlan, Subscription,
    Lead, PaymentMethod, Invoice, Program, ProgramUnit, ProgramImage, ProgramUnitImage,
)

app = create_app('development')

# Moroccan cities with coordinates and neighborhoods
CITIES = {
    'Casablanca': {
        'lat': 33.5731,
        'lng': -7.5898,
        'neighborhoods': ['Maarif', 'Anfa', 'Bourgogne', 'Racine', 'Gauthier', 'Californie', 'Ain Diab', 'Corniche', 'Bouskoura', 'Sidi Maarouf']
    },
    'Rabat': {
        'lat': 34.0209,
        'lng': -6.8416,
        'neighborhoods': ['Agdal', 'Hay Riad', 'Hassan', 'Souissi', 'Les Orangers', 'Ocean', 'Akkari']
    },
    'Marrakech': {
        'lat': 31.6295,
        'lng': -7.9811,
        'neighborhoods': ['Guéliz', 'Hivernage', 'Palmeraie', 'Médina', 'Targa', 'Semlalia', 'Amelkis']
    },
    'Tanger': {
        'lat': 35.7595,
        'lng': -5.8340,
        'neighborhoods': ['Centre-ville', 'Malabata', 'Cap Spartel', 'Boukhalef', 'Iberia', 'Marshan']
    },
    'Agadir': {
        'lat': 30.4278,
        'lng': -9.5981,
        'neighborhoods': ['Centre-ville', 'Founty', 'Sonaba', 'Hay Mohammadi', 'Talborjt', 'Charaf']
    },
    'Fès': {
        'lat': 34.0181,
        'lng': -5.0078,
        'neighborhoods': ['Ville Nouvelle', 'Médina', 'Saiss', 'Narjiss', 'Mont Fleuri']
    },
    'Meknès': {
        'lat': 33.8731,
        'lng': -5.5407,
        'neighborhoods': ['Hamria', 'Ville Nouvelle', 'Médina', 'Zitoune']
    },
}

PROPERTY_FEATURES = [
    'Parking', 'Garage', 'Ascenseur', 'Gardien', 'Interphone', 'Digicode',
    'Balcon', 'Terrasse', 'Jardin', 'Piscine', 'Cave', 'Climatisation',
    'Chauffage central', 'Double vitrage', 'Cuisine équipée', 'Placard intégré',
    'Vue mer', 'Vue montagne', 'Vue jardin', 'Calme', 'Lumineux', 'Meublé',
    'Wifi inclus', 'Eau chaude solaire', 'Panneaux solaires'
]

PROPERTY_TITLES = {
    'apartment': [
        'Appartement {} pièces {}',
        'Bel appartement F{} {}',
        'Superbe {} pièces {}',
        'Appartement moderne {} chambres {}',
        'F{} rénové {}'
    ],
    'house': [
        'Maison {} chambres {}',
        'Belle maison familiale {}',
        'Maison traditionnelle {}',
        'Maison avec jardin {}'
    ],
    'villa': [
        'Villa de luxe {}',
        'Magnifique villa {}',
        'Villa contemporaine {}',
        'Villa avec piscine {}'
    ],
    'land': [
        'Terrain constructible {}',
        'Terrain {} m² {}',
        'Parcelle viabilisée {}',
        'Terrain R+{} {}'
    ],
    'commercial': [
        'Local commercial {}',
        'Boutique {}',
        'Magasin {} m² {}',
        'Commerce bien placé {}'
    ],
    'office': [
        'Bureau {} m² {}',
        'Plateau de bureaux {}',
        'Espace de travail {}',
        'Open space {}'
    ]
}


def clear_data():
    """Clear existing data."""
    print("Clearing existing data...")
    # Delete in correct order to respect foreign key constraints
    try:
        db.session.execute(text('DELETE FROM program_images'))
        db.session.execute(text('DELETE FROM program_units'))
        db.session.execute(text('DELETE FROM programs'))
        db.session.execute(text('DELETE FROM invoice'))
        db.session.execute(text('DELETE FROM payment_method'))
        db.session.execute(text('DELETE FROM lead'))
        db.session.execute(text('DELETE FROM property_image'))
        db.session.execute(text('DELETE FROM property'))
        db.session.execute(text('DELETE FROM subscription'))
        db.session.execute(text('DELETE FROM "user"'))
        db.session.execute(text('DELETE FROM agency'))
        db.session.execute(text('DELETE FROM subscription_plan'))
        db.session.commit()
    except Exception as e:
        print(f"Warning: {e}")
        db.session.rollback()
    print("Data cleared.")


def seed_plans():
    """Create subscription plans."""
    print("Creating subscription plans...")
    plans = [
        {
            'name': 'Starter',
            'slug': 'starter',
            'description': 'Idéal pour démarrer',
            'max_listings': 10,
            'max_featured': 1,
            'max_urgent': 1,
            'has_api_access': False,
            'has_csv_import': False,
            'has_staymanager_sync': False,
            'has_lead_contact': True,
            'has_analytics': False,
            'has_priority_support': False,
            'has_dedicated_account_manager': False,
            'has_programs': False,
            'max_programs': 0,
            'price_monthly': 299,
            'price_yearly': 2990
        },
        {
            'name': 'Pro',
            'slug': 'pro',
            'description': 'Pour les agences en croissance',
            'max_listings': 50,
            'max_featured': 5,
            'max_urgent': 5,
            'has_api_access': True,
            'has_csv_import': True,
            'has_staymanager_sync': True,
            'has_lead_contact': True,
            'has_analytics': True,
            'has_priority_support': False,
            'has_dedicated_account_manager': False,
            'has_programs': True,
            'max_programs': 10,
            'price_monthly': 799,
            'price_yearly': 7990
        },
        {
            'name': 'Enterprise',
            'slug': 'enterprise',
            'description': 'Solution complète pour grandes agences',
            'max_listings': -1,
            'max_featured': 20,
            'max_urgent': 20,
            'has_api_access': True,
            'has_csv_import': True,
            'has_staymanager_sync': True,
            'has_lead_contact': True,
            'has_analytics': True,
            'has_priority_support': True,
            'has_dedicated_account_manager': True,
            'has_programs': True,
            'max_programs': -1,
            'price_monthly': 1999,
            'price_yearly': 19990
        }
    ]

    created_plans = {}
    for plan_data in plans:
        plan = SubscriptionPlan(**plan_data)
        db.session.add(plan)
        created_plans[plan_data['slug']] = plan
        print(f"  Created plan: {plan_data['name']}")

    db.session.commit()
    return created_plans


def seed_agencies(plans):
    """Create test agencies with subscriptions."""
    print("Creating agencies...")
    agencies_data = [
        {
            'name': 'Immo Casa Premium',
            'slug': 'immo-casa-premium',
            'description': 'Agence immobilière de prestige spécialisée dans les biens haut de gamme à Casablanca.',
            'email': 'contact@immocasapremium.ma',
            'phone': '+212 522 123 456',
            'website': 'https://www.immocasapremium.ma',
            'address': '123 Boulevard Moulay Youssef',
            'city': 'Casablanca',
            'postal_code': '20000',
            'license_number': 'RC-CASA-12345',
            'is_verified': True,
            'plan': 'enterprise'
        },
        {
            'name': 'Rabat Immobilier',
            'slug': 'rabat-immobilier',
            'description': 'Votre partenaire immobilier dans la capitale. Vente, location, gestion locative.',
            'email': 'info@rabat-immo.ma',
            'phone': '+212 537 654 321',
            'website': 'https://www.rabat-immo.ma',
            'address': '45 Avenue Mohammed V',
            'city': 'Rabat',
            'postal_code': '10000',
            'license_number': 'RC-RABAT-67890',
            'is_verified': True,
            'plan': 'pro'
        },
        {
            'name': 'Marrakech Properties',
            'slug': 'marrakech-properties',
            'description': 'Spécialiste des riads et villas à Marrakech. Accompagnement personnalisé.',
            'email': 'hello@marrakech-properties.ma',
            'phone': '+212 524 111 222',
            'website': 'https://www.marrakech-properties.ma',
            'address': '78 Rue de la Liberté, Guéliz',
            'city': 'Marrakech',
            'postal_code': '40000',
            'license_number': 'RC-MARR-11111',
            'is_verified': True,
            'plan': 'pro'
        },
        {
            'name': 'Tanger Bay Realty',
            'slug': 'tanger-bay-realty',
            'description': 'L\'immobilier sur la côte tangéroise. Vue mer garantie.',
            'email': 'contact@tangerbay.ma',
            'phone': '+212 539 333 444',
            'address': '12 Avenue des FAR',
            'city': 'Tanger',
            'postal_code': '90000',
            'is_verified': True,
            'plan': 'starter'
        },
        {
            'name': 'Agadir Sun Immo',
            'slug': 'agadir-sun-immo',
            'description': 'Agence locale spécialisée dans l\'immobilier à Agadir et ses environs.',
            'email': 'agadir@sunimmo.ma',
            'phone': '+212 528 555 666',
            'address': '34 Boulevard Hassan II',
            'city': 'Agadir',
            'postal_code': '80000',
            'is_verified': False,
            'plan': 'starter'
        }
    ]

    created_agencies = []
    for agency_data in agencies_data:
        plan_slug = agency_data.pop('plan')
        agency = Agency(**agency_data)
        agency.api_key = f"sk_{uuid.uuid4().hex}"
        db.session.add(agency)
        db.session.flush()

        # Create subscription
        plan = plans[plan_slug]
        subscription = Subscription(
            agency_id=agency.id,
            plan_id=plan.id,
            billing_cycle='yearly',
            amount=plan.price_yearly,
            status='active',
            start_date=datetime.utcnow() - timedelta(days=random.randint(30, 300)),
            end_date=datetime.utcnow() + timedelta(days=random.randint(60, 365))
        )
        db.session.add(subscription)
        created_agencies.append(agency)
        print(f"  Created agency: {agency.name} ({plan_slug})")

    db.session.commit()
    return created_agencies


def seed_users(agencies):
    """Create test users."""
    print("Creating users...")
    users = []

    # Admin user
    admin = User(
        email='admin@semsarout.ma',
        first_name='Admin',
        last_name='SemsarOut',
        phone='+212 600 000 001',
        user_type='admin',
        account_role='admin',
        is_verified=True,
        is_active=True
    )
    admin.set_password('admin123')
    db.session.add(admin)
    users.append(admin)
    print(f"  Created admin: {admin.email}")

    # Demo user (particular)
    demo = User(
        email='demo@semsarout.ma',
        first_name='Demo',
        last_name='User',
        phone='+212 600 000 002',
        user_type='particular',
        is_verified=True,
        is_active=True
    )
    demo.set_password('demo1234')
    db.session.add(demo)
    users.append(demo)
    print(f"  Created demo user: {demo.email}")

    # Agency users
    for i, agency in enumerate(agencies):
        user = User(
            email=f'agent{i+1}@{agency.slug}.ma',
            first_name=['Ahmed', 'Fatima', 'Youssef', 'Salma', 'Omar'][i % 5],
            last_name=['Bennani', 'Alaoui', 'El Fassi', 'Idrissi', 'Tazi'][i % 5],
            phone=f'+212 6{random.randint(10, 99)} {random.randint(100, 999)} {random.randint(100, 999)}',
            user_type='professional',
            agency_id=agency.id,
            is_verified=True,
            is_active=True
        )
        user.set_password('password123')
        db.session.add(user)
        users.append(user)
        print(f"  Created agent: {user.email} ({agency.name})")

    # Random particular users
    particulars_data = [
        ('Karim', 'Benjelloun', 'karim.benjelloun@gmail.com'),
        ('Nadia', 'Chraibi', 'nadia.chraibi@outlook.com'),
        ('Mohammed', 'Squalli', 'msqualli@yahoo.fr'),
        ('Leila', 'Berrada', 'leila.berrada@hotmail.com'),
        ('Hamza', 'Kettani', 'hamza.kettani@gmail.com'),
        ('Sara', 'Filali', 'sara.filali@live.com'),
        ('Rachid', 'Bennis', 'rbennis@gmail.com'),
        ('Imane', 'Lahlou', 'imane.lahlou@outlook.com'),
    ]

    for first_name, last_name, email in particulars_data:
        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            phone=f'+212 6{random.randint(10, 99)} {random.randint(100, 999)} {random.randint(100, 999)}',
            user_type='particular',
            is_verified=random.choice([True, True, True, False]),
            is_active=True
        )
        user.set_password('user1234')
        db.session.add(user)
        users.append(user)
        print(f"  Created user: {user.email}")

    db.session.commit()
    return users


def seed_properties(users, agencies):
    """Create test properties."""
    print("Creating properties...")
    properties = []

    property_types = ['apartment', 'apartment', 'apartment', 'house', 'villa', 'land', 'commercial', 'office']
    transaction_types = ['sale', 'sale', 'sale', 'rent', 'rent']
    statuses = ['active', 'active', 'active', 'active', 'pending', 'sold', 'rented', 'draft']

    # Get users by type
    particular_users = [u for u in users if u.user_type == 'particular']
    agency_users = [u for u in users if u.user_type == 'professional']

    ref_counter = 1

    for city, city_data in CITIES.items():
        neighborhoods = city_data['neighborhoods']
        # Create 8-15 properties per city
        num_properties = random.randint(8, 15)

        for _ in range(num_properties):
            prop_type = random.choice(property_types)
            trans_type = random.choice(transaction_types)
            neighborhood = random.choice(neighborhoods)
            status = random.choice(statuses)

            # Determine owner
            if random.random() < 0.6 and agency_users:
                # Agency property
                owner = random.choice(agency_users)
                agency_id = owner.agency_id
            else:
                # Particular property
                owner = random.choice(particular_users)
                agency_id = None

            # Generate characteristics based on property type
            if prop_type == 'apartment':
                surface = random.randint(40, 200)
                rooms = random.randint(1, 5)
                bedrooms = max(0, rooms - 1)
                bathrooms = random.randint(1, 3)
                floor = random.randint(0, 10)
                total_floors = floor + random.randint(0, 5)
                land_surface = None
            elif prop_type == 'house':
                surface = random.randint(100, 300)
                rooms = random.randint(3, 8)
                bedrooms = max(2, rooms - 2)
                bathrooms = random.randint(1, 4)
                floor = None
                total_floors = random.randint(1, 3)
                land_surface = random.randint(100, 500)
            elif prop_type == 'villa':
                surface = random.randint(200, 600)
                rooms = random.randint(5, 12)
                bedrooms = max(3, rooms - 3)
                bathrooms = random.randint(2, 6)
                floor = None
                total_floors = random.randint(1, 3)
                land_surface = random.randint(300, 2000)
            elif prop_type == 'land':
                surface = None
                rooms = None
                bedrooms = None
                bathrooms = None
                floor = None
                total_floors = random.randint(2, 5)
                land_surface = random.randint(100, 5000)
            else:  # commercial, office
                surface = random.randint(30, 500)
                rooms = random.randint(1, 10)
                bedrooms = None
                bathrooms = random.randint(1, 3)
                floor = random.randint(0, 5)
                total_floors = floor + random.randint(0, 5)
                land_surface = None

            # Generate price based on type, city and transaction
            base_price_sqm = {
                'Casablanca': 15000,
                'Rabat': 14000,
                'Marrakech': 12000,
                'Tanger': 11000,
                'Agadir': 10000,
                'Fès': 8000,
                'Meknès': 7000
            }.get(city, 9000)

            type_multiplier = {
                'apartment': 1.0,
                'house': 1.1,
                'villa': 1.5,
                'land': 0.4,
                'commercial': 1.3,
                'office': 1.2
            }.get(prop_type, 1.0)

            if trans_type == 'sale':
                ref_surface = surface or land_surface or 100
                price = int(ref_surface * base_price_sqm * type_multiplier * random.uniform(0.7, 1.4))
                price = round(price, -4)  # Round to nearest 10000
                charges = None
            else:  # rent
                ref_surface = surface or 100
                monthly_sqm = base_price_sqm / 200
                price = int(ref_surface * monthly_sqm * type_multiplier * random.uniform(0.7, 1.3))
                price = round(price, -2)  # Round to nearest 100
                charges = random.choice([None, 200, 300, 500, 800, 1000])

            # Generate title
            title_templates = PROPERTY_TITLES.get(prop_type, ['Bien immobilier {}'])
            title_template = random.choice(title_templates)
            if '{}' in title_template:
                if rooms:
                    title = title_template.format(rooms, neighborhood)
                else:
                    title = title_template.format(neighborhood, '')
            else:
                title = title_template.format(neighborhood)

            # Generate features
            num_features = random.randint(3, 8)
            features = random.sample(PROPERTY_FEATURES, num_features)

            # Determine visibility options
            is_premium = random.random() < 0.15
            is_urgent = random.random() < 0.1
            urgent_until = datetime.utcnow() + timedelta(days=random.randint(2, 14)) if is_urgent else None
            is_featured = random.random() < 0.2

            # Reference
            reference = f'SO-{city[:3].upper()}-{ref_counter:05d}'
            ref_counter += 1

            # Create property
            prop = Property(
                reference=reference,
                title=title.strip(),
                description=generate_description(prop_type, trans_type, surface, land_surface, rooms, bedrooms, neighborhood, city, features),
                property_type=prop_type,
                transaction_type=trans_type,
                price=price,
                price_per_sqm=round(price / (surface or land_surface or 100), 2) if trans_type == 'sale' else None,
                charges=charges,
                surface=surface,
                land_surface=land_surface,
                rooms=rooms,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                floor=floor,
                total_floors=total_floors,
                construction_year=random.choice([None, *range(1980, 2024)]),
                features=features,
                energy_class=random.choice([None, 'A', 'B', 'C', 'D', 'E']),
                address=f'{random.randint(1, 200)} Rue {random.choice(["Mohammed V", "Hassan II", "des FAR", "de la Liberté", "Atlas"])}',
                city=city,
                neighborhood=neighborhood,
                postal_code=str(random.randint(10000, 99999)),
                latitude=city_data['lat'] + random.uniform(-0.05, 0.05),
                longitude=city_data['lng'] + random.uniform(-0.05, 0.05),
                status=status,
                is_premium=is_premium,
                is_urgent=is_urgent,
                urgent_until=urgent_until,
                is_featured=is_featured,
                views_count=random.randint(10, 5000),
                contacts_count=random.randint(0, 50),
                favorites_count=random.randint(0, 100),
                owner_id=owner.id,
                agency_id=agency_id,
                published_at=datetime.utcnow() - timedelta(days=random.randint(1, 90)) if status in ['active', 'pending', 'sold', 'rented'] else None
            )

            db.session.add(prop)
            properties.append(prop)

    db.session.commit()
    print(f"  Created {len(properties)} properties")

    # Add images to properties
    print("  Adding property images...")
    for prop in properties:
        num_images = random.randint(3, 10)
        for i in range(num_images):
            img = PropertyImage(
                property_id=prop.id,
                url=f'https://picsum.photos/seed/{prop.id}-{i}/800/600',
                thumbnail_url=f'https://picsum.photos/seed/{prop.id}-{i}/400/300',
                caption=f'Photo {i+1}' if i > 0 else 'Photo principale',
                position=i,
                is_primary=(i == 0)
            )
            db.session.add(img)

    db.session.commit()
    return properties


def seed_programs(users, agencies, skip_existing=False):
    """Create published new-build programs with their available unit types."""
    print("Creating real estate programs...")
    agency_by_city = {agency.city: agency for agency in agencies}
    user_by_agency = {user.agency_id: user for user in users if user.user_type == 'professional'}

    programs_data = [
        {
            'reference': 'PRG-CAS-001', 'name': 'Résidence Azure Anfa',
            'description': 'Une résidence contemporaine à Anfa, pensée pour une vie urbaine élégante avec des espaces communs soignés et une sécurité 24h/24.',
            'program_type': 'residential', 'address': '18 Boulevard de l\'Océan',
            'city': 'Casablanca', 'neighborhood': 'Anfa', 'latitude': 33.5932, 'longitude': -7.6474,
            'delivery_date': datetime(2027, 6, 30).date(), 'construction_status': 'under_construction',
            'amenities': ['Piscine', 'Salle de sport', 'Parking sous-sol', 'Sécurité 24h/24', 'Jardin paysager'],
            'cover_image_url': 'https://picsum.photos/seed/residence-azure-anfa/1200/800', 'views_count': 1840, 'contacts_count': 46,
            'units': [
                {'name': 'Studio', 'unit_type': 'apartment', 'surface_min': 35, 'surface_max': 42, 'rooms': 1, 'bedrooms': 0, 'bathrooms': 1, 'price_from': 850000, 'price_to': 950000, 'total_count': 12, 'available_count': 6, 'features': ['Kitchenette', 'Climatisation', 'Balcon']},
                {'name': 'Appartement T2 Compact', 'unit_type': 'apartment', 'surface_min': 52, 'surface_max': 62, 'rooms': 2, 'bedrooms': 1, 'bathrooms': 1, 'price_from': 1150000, 'price_to': 1350000, 'total_count': 18, 'available_count': 10, 'features': ['Terrasse', 'Cuisine équipée', 'Climatisation']},
                {'name': 'Appartement T2 Spacieux', 'unit_type': 'apartment', 'surface_min': 68, 'surface_max': 78, 'rooms': 2, 'bedrooms': 1, 'bathrooms': 1, 'price_from': 1400000, 'price_to': 1650000, 'total_count': 16, 'available_count': 8, 'features': ['Grande terrasse', 'Suite parentale', 'Double vitrage']},
                {'name': 'Appartement T3 Standard', 'unit_type': 'apartment', 'surface_min': 85, 'surface_max': 98, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 1, 'price_from': 1750000, 'price_to': 2050000, 'total_count': 24, 'available_count': 14, 'features': ['Balcon', 'Suite parentale', 'Cuisine équipée']},
                {'name': 'Appartement T3 Premium', 'unit_type': 'apartment', 'surface_min': 102, 'surface_max': 118, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 2, 'price_from': 2150000, 'price_to': 2550000, 'total_count': 20, 'available_count': 10, 'features': ['Terrasse', 'Suite parentale', 'Deux SDB', 'Double vitrage']},
                {'name': 'Appartement T4 Duplex', 'unit_type': 'duplex', 'surface_min': 155, 'surface_max': 175, 'rooms': 4, 'bedrooms': 3, 'bathrooms': 2, 'price_from': 3850000, 'price_to': 4450000, 'total_count': 8, 'available_count': 4, 'features': ['Grande terrasse', 'Mezzanine', 'Trois SDB', 'Parking']},
                {'name': 'Penthouse T4', 'unit_type': 'duplex', 'surface_min': 188, 'surface_max': 210, 'rooms': 4, 'bedrooms': 3, 'bathrooms': 3, 'price_from': 4850000, 'price_to': 5650000, 'total_count': 4, 'available_count': 2, 'features': ['Grande terrasse', 'Vue mer', 'Deux places de parking', 'Climatisation']},
            ],
        },
        {
            'reference': 'PRG-RAB-001', 'name': 'Les Jardins de Hay Riad',
            'description': 'Un programme résidentiel familial au cœur de Hay Riad, à proximité des écoles, commerces et grands axes de Rabat.',
            'program_type': 'residential', 'address': 'Avenue Annakhil',
            'city': 'Rabat', 'neighborhood': 'Hay Riad', 'latitude': 33.9663, 'longitude': -6.8668,
            'delivery_date': datetime(2026, 12, 31).date(), 'construction_status': 'under_construction',
            'amenities': ['Jardins', 'Aire de jeux', 'Conciergerie', 'Parking', 'Bornes de recharge'],
            'cover_image_url': 'https://picsum.photos/seed/jardins-hay-riad/1200/800', 'views_count': 1275, 'contacts_count': 38,
            'units': [
                {'name': 'Appartement T2', 'unit_type': 'apartment', 'surface_min': 62, 'surface_max': 72, 'rooms': 2, 'bedrooms': 1, 'bathrooms': 1, 'price_from': 1450000, 'price_to': 1650000, 'total_count': 16, 'available_count': 8, 'features': ['Balcon', 'Cuisine équipée', 'Climatisation']},
                {'name': 'Appartement T3 Standard', 'unit_type': 'apartment', 'surface_min': 88, 'surface_max': 102, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 1, 'price_from': 1800000, 'price_to': 2050000, 'total_count': 28, 'available_count': 15, 'features': ['Balcon', 'Suite parentale', 'Cellier']},
                {'name': 'Appartement T3 Premium', 'unit_type': 'apartment', 'surface_min': 108, 'surface_max': 122, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 2, 'price_from': 2300000, 'price_to': 2650000, 'total_count': 18, 'available_count': 10, 'features': ['Terrasse', 'Suite parentale', 'Deux SDB', 'Parking']},
                {'name': 'Appartement T4', 'unit_type': 'apartment', 'surface_min': 128, 'surface_max': 155, 'rooms': 4, 'bedrooms': 3, 'bathrooms': 2, 'price_from': 2750000, 'price_to': 3250000, 'total_count': 16, 'available_count': 7, 'features': ['Double exposition', 'Terrasse', 'Parking titré', 'Climatisation']},
            ],
        },
        {
            'reference': 'PRG-MAR-001', 'name': 'Palmeraie Signature Villas',
            'description': 'Collection exclusive de villas contemporaines dans la Palmeraie, avec jardins privatifs, piscine et finitions haut de gamme.',
            'program_type': 'residential', 'address': 'Circuit de la Palmeraie',
            'city': 'Marrakech', 'neighborhood': 'Palmeraie', 'latitude': 31.6719, 'longitude': -7.9617,
            'delivery_date': datetime(2027, 9, 30).date(), 'construction_status': 'planning',
            'amenities': ['Piscine privée', 'Jardin privatif', 'Résidence sécurisée', 'Club house', 'Service de gestion locative'],
            'cover_image_url': 'https://picsum.photos/seed/palmeraie-signature/1200/800', 'views_count': 960, 'contacts_count': 27,
            'units': [
                {'name': 'Villa Atlas', 'unit_type': 'villa', 'surface_min': 210, 'surface_max': 210, 'rooms': 5, 'bedrooms': 4, 'bathrooms': 4, 'price_from': 4850000, 'price_to': 4850000, 'total_count': 12, 'available_count': 8, 'features': ['Piscine', 'Terrain de 500 m²', 'Rooftop']},
                {'name': 'Villa Ocre', 'unit_type': 'villa', 'surface_min': 285, 'surface_max': 310, 'rooms': 6, 'bedrooms': 5, 'bathrooms': 5, 'price_from': 6800000, 'price_to': 7900000, 'total_count': 8, 'available_count': 5, 'features': ['Piscine chauffée', 'Hammam', 'Maison de gardien']},
            ],
        },
        {
            'reference': 'PRG-CAS-002', 'name': 'Nexus Sidi Maârouf',
            'description': 'Un projet mixte réunissant bureaux modulables, commerces de proximité et services au sein du nouveau pôle d’affaires de Sidi Maârouf.',
            'program_type': 'mixed', 'address': 'Boulevard Al Qods',
            'city': 'Casablanca', 'neighborhood': 'Sidi Maarouf', 'latitude': 33.5394, 'longitude': -7.6320,
            'delivery_date': datetime(2026, 10, 31).date(), 'construction_status': 'under_construction',
            'amenities': ['Accueil', 'Parking visiteurs', 'Fibre optique', 'Sécurité', 'Espaces de restauration'],
            'cover_image_url': 'https://picsum.photos/seed/nexus-sidi-maarouf/1200/800', 'views_count': 710, 'contacts_count': 19,
            'units': [
                {'name': 'Bureau modulable', 'unit_type': 'office', 'surface_min': 54, 'surface_max': 118, 'rooms': 2, 'bedrooms': 0, 'bathrooms': 1, 'price_from': 980000, 'price_to': 2180000, 'total_count': 36, 'available_count': 20, 'features': ['Faux plafond', 'Climatisation centralisée', 'Fibre']},
                {'name': 'Local commercial', 'unit_type': 'commercial', 'surface_min': 72, 'surface_max': 145, 'rooms': 1, 'bedrooms': 0, 'bathrooms': 1, 'price_from': 1650000, 'price_to': 3400000, 'total_count': 10, 'available_count': 4, 'features': ['Vitrine', 'Hauteur sous plafond', 'Terrasse possible']},
            ],
        },
        {
            'reference': 'PRG-TAN-001', 'name': 'Cap Malabata',
            'description': 'Résidence livrée à quelques minutes de la corniche de Tanger, offrant des appartements lumineux avec vues dégagées et prestations prêtes à vivre.',
            'program_type': 'residential', 'address': 'Route de Malabata',
            'city': 'Tanger', 'neighborhood': 'Malabata', 'latitude': 35.7703, 'longitude': -5.7761,
            'delivery_date': datetime(2026, 3, 31).date(), 'construction_status': 'delivered',
            'amenities': ['Piscine', 'Ascenseur', 'Parking titré', 'Gardiennage', 'Proche plage'],
            'cover_image_url': 'https://picsum.photos/seed/cap-malabata/1200/800', 'views_count': 1540, 'contacts_count': 52,
            'units': [
                {'name': 'Studio Mer', 'unit_type': 'apartment', 'surface_min': 40, 'surface_max': 48, 'rooms': 1, 'bedrooms': 0, 'bathrooms': 1, 'price_from': 720000, 'price_to': 850000, 'total_count': 10, 'available_count': 3, 'features': ['Balcon', 'Vue mer', 'Kitchenette']},
                {'name': 'Appartement T2 Vue Partielle', 'unit_type': 'apartment', 'surface_min': 58, 'surface_max': 70, 'rooms': 2, 'bedrooms': 1, 'bathrooms': 1, 'price_from': 920000, 'price_to': 1180000, 'total_count': 14, 'available_count': 4, 'features': ['Balcon', 'Vue mer partielle', 'Cuisine équipée']},
                {'name': 'Appartement T2 Vue Mer', 'unit_type': 'apartment', 'surface_min': 72, 'surface_max': 85, 'rooms': 2, 'bedrooms': 1, 'bathrooms': 1, 'price_from': 1150000, 'price_to': 1420000, 'total_count': 10, 'available_count': 2, 'features': ['Balcon', 'Vue mer', 'Suite parentale', 'Climatisation']},
                {'name': 'Appartement T3 Standard', 'unit_type': 'apartment', 'surface_min': 92, 'surface_max': 108, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 1, 'price_from': 1480000, 'price_to': 1750000, 'total_count': 16, 'available_count': 5, 'features': ['Balcon', 'Suite parentale', 'Parking titré']},
                {'name': 'Appartement T3 Vue Mer', 'unit_type': 'apartment', 'surface_min': 108, 'surface_max': 132, 'rooms': 3, 'bedrooms': 2, 'bathrooms': 2, 'price_from': 1820000, 'price_to': 2350000, 'total_count': 12, 'available_count': 3, 'features': ['Terrasse', 'Suite parentale', 'Vue mer', 'Parking titré']},
            ],
        },
    ]

    programs = []
    for data in programs_data:
        existing_program = Program.query.filter_by(reference=data['reference']).first()
        if existing_program:
            if skip_existing:
                print(f"  Skipped existing program: {existing_program.name}")
                continue
            raise ValueError(f"A program with reference {data['reference']} already exists")

        units = data.pop('units')
        agency = agency_by_city.get(data['city'])
        if not agency:
            print(f"  Skipped {data['name']}: no agency found in {data['city']}")
            continue
        created_by = user_by_agency.get(agency.id)
        program = Program(
            **data,
            slug=data['name'].lower().replace(' ', '-').replace('â', 'a').replace('é', 'e'),
            agency_id=agency.id,
            created_by_id=created_by.id if created_by else None,
            status='active',
            published_at=datetime.utcnow() - timedelta(days=random.randint(7, 90)),
        )
        program.total_units = sum(unit['total_count'] for unit in units)
        program.available_units = sum(unit['available_count'] for unit in units)
        program.min_price = min(unit['price_from'] for unit in units)
        program.max_price = max(unit['price_to'] for unit in units)
        db.session.add(program)
        db.session.flush()

        program_units = []
        for unit_data in units:
            unit = ProgramUnit(program_id=program.id, **unit_data)
            db.session.add(unit)
            db.session.flush()  # Get unit ID
            program_units.append(unit)

            # Add images for this unit type
            image_types = {
                'floor_plan': 'Plan d\'étage',
                'bedroom': 'Chambre',
                'living_room': 'Séjour',
                'kitchen': 'Cuisine',
                'bathroom': 'Salle de bains',
            }
            for idx, (img_type, caption) in enumerate(image_types.items()):
                db.session.add(ProgramUnitImage(
                    unit_id=unit.id,
                    url=f'https://picsum.photos/seed/{program.slug}-{unit.id}-{img_type}/800/600',
                    caption=caption,
                    image_type=img_type,
                    position=idx,
                ))

        # Add program images
        for position, (caption, image_type) in enumerate([
            ('Vue extérieure', 'exterior'), ('Espaces de vie', 'interior'), ('Prestations de la résidence', 'amenity'),
        ]):
            db.session.add(ProgramImage(
                program_id=program.id,
                url=f'https://picsum.photos/seed/{program.slug}-{position}/1200/800',
                caption=caption,
                image_type=image_type,
                position=position,
            ))
        programs.append(program)

    db.session.commit()
    print(f"  Created {len(programs)} programs with their units and images")
    return programs


def generate_description(prop_type, trans_type, surface, land_surface, rooms, bedrooms, neighborhood, city, features):
    """Generate a realistic property description."""
    action = 'À vendre' if trans_type == 'sale' else 'À louer'

    type_names = {
        'apartment': 'appartement',
        'house': 'maison',
        'villa': 'villa',
        'land': 'terrain',
        'commercial': 'local commercial',
        'office': 'bureau'
    }

    type_name = type_names.get(prop_type, 'bien')

    parts = [f'{action} : {type_name}']

    if rooms:
        parts.append(f'de {rooms} pièces')
    if surface:
        parts.append(f'd\'une superficie de {surface} m²')
    if land_surface and prop_type in ['land', 'villa', 'house']:
        parts.append(f'sur un terrain de {land_surface} m²')

    parts.append(f'situé(e) dans le quartier {neighborhood} à {city}.')

    descriptions = [
        'Ce bien dispose de prestations de qualité et offre un cadre de vie agréable.',
        'Idéalement situé(e), proche de toutes commodités.',
        'Belle luminosité et volumes généreux.',
        'Parfait état, prêt à habiter.',
        'Opportunité à saisir rapidement.',
        'Bien rare sur le marché.'
    ]

    full_desc = ' '.join(parts) + '\n\n' + random.choice(descriptions)

    if features:
        full_desc += '\n\nPoints forts : ' + ', '.join(features[:5]) + '.'

    return full_desc


def seed_leads(properties, users):
    """Create test leads."""
    print("Creating leads...")
    leads = []

    lead_sources = ['contact_form', 'phone_reveal', 'callback_request']
    lead_statuses = ['new', 'new', 'new', 'contacted', 'qualified', 'converted', 'lost']

    active_properties = [p for p in properties if p.status == 'active']

    # Generate 50-100 leads
    num_leads = random.randint(50, 100)

    names = [
        ('Amine', 'Benali'), ('Zineb', 'Tahiri'), ('Yassine', 'Fikri'),
        ('Sanaa', 'Moussaoui'), ('Mehdi', 'Belhaj'), ('Houda', 'Naciri'),
        ('Othmane', 'Fassi'), ('Meryem', 'Guedira'), ('Soufiane', 'Amrani'),
        ('Lamia', 'Kabbaj'), ('Adil', 'Lazrak'), ('Hind', 'Senhaji'),
        ('Khalid', 'Benkiran'), ('Salwa', 'Ouazzani'), ('Reda', 'Benkirane')
    ]

    for _ in range(num_leads):
        prop = random.choice(active_properties)
        first_name, last_name = random.choice(names)
        status = random.choice(lead_statuses)

        lead = Lead(
            name=f'{first_name} {last_name}',
            email=f'{first_name.lower()}.{last_name.lower()}{random.randint(1, 99)}@{random.choice(["gmail.com", "outlook.com", "yahoo.fr", "hotmail.com"])}',
            phone=f'+212 6{random.randint(10, 99)} {random.randint(100, 999)} {random.randint(100, 999)}',
            message=random.choice([
                f'Bonjour, je suis intéressé(e) par votre bien "{prop.title}". Pouvez-vous me contacter ?',
                f'Je souhaiterais organiser une visite pour le bien référence {prop.reference}.',
                f'Bonjour, est-ce que ce bien est toujours disponible ?',
                f'Je recherche un bien similaire dans le quartier {prop.neighborhood}. Avez-vous d\'autres propositions ?',
                f'Pouvez-vous m\'envoyer plus de photos et le plan du bien ?',
                None
            ]),
            source=random.choice(lead_sources),
            status=status,
            property_id=prop.id,
            agency_id=prop.agency_id,
            owner_id=prop.owner_id if not prop.agency_id else None,
            is_charged=random.choice([True, False]) if status in ['contacted', 'qualified', 'converted'] else False,
            charge_amount=random.choice([50, 100, 150]) if status == 'converted' else None,
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 60)),
            contacted_at=datetime.utcnow() - timedelta(days=random.randint(1, 30)) if status not in ['new'] else None,
            converted_at=datetime.utcnow() - timedelta(days=random.randint(1, 15)) if status == 'converted' else None
        )
        db.session.add(lead)
        leads.append(lead)

    db.session.commit()
    print(f"  Created {len(leads)} leads")
    return leads


def seed_billing(agencies, users):
    """Create test payment methods and invoices."""
    print("Creating billing data...")

    payment_methods = []
    invoices = []

    # Add payment methods for agencies
    for agency in agencies:
        sub = Subscription.query.filter_by(agency_id=agency.id).first()
        if not sub:
            continue

        # Add a card payment method
        pm = PaymentMethod(
            agency_id=agency.id,
            type='card',
            card_brand=random.choice(['visa', 'mastercard']),
            card_last4=str(random.randint(1000, 9999)),
            card_exp_month=random.randint(1, 12),
            card_exp_year=random.randint(2026, 2030),
            card_holder_name=agency.name.upper()[:30],
            stripe_payment_method_id=f'pm_{uuid.uuid4().hex[:24]}',
            is_default=True
        )
        db.session.add(pm)
        db.session.flush()
        payment_methods.append(pm)

        # Create invoices for the last 3 months
        months_fr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                     'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

        for i in range(3):
            invoice_date = datetime.utcnow() - timedelta(days=30 * i)
            period_start = invoice_date.replace(day=1)

            # Calculate period end (last day of month)
            if period_start.month == 12:
                period_end = period_start.replace(year=period_start.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                period_end = period_start.replace(month=period_start.month + 1, day=1) - timedelta(days=1)

            subtotal = float(sub.amount) / 12  # Monthly amount from yearly
            tax_amount = subtotal * 0.20
            total = subtotal + tax_amount

            inv = Invoice(
                reference=f'INV-{invoice_date.year}-{str(agency.id).zfill(3)}{str(i+1).zfill(2)}',
                subscription_id=sub.id,
                agency_id=agency.id,
                period_start=period_start,
                period_end=period_end,
                period_label=f'{months_fr[period_start.month - 1]} {period_start.year}',
                subtotal=subtotal,
                tax_rate=20,
                tax_amount=tax_amount,
                total=total,
                currency='MAD',
                status='paid' if i > 0 else random.choice(['paid', 'pending']),
                payment_method_id=pm.id,
                paid_at=invoice_date if i > 0 else None,
                due_date=period_start + timedelta(days=30),
                stripe_invoice_id=f'in_{uuid.uuid4().hex[:24]}',
                created_at=period_start
            )
            db.session.add(inv)
            invoices.append(inv)

        print(f"  Created billing for: {agency.name}")

    # Add payment methods for some individual users
    individual_users = [u for u in users if u.user_type == 'particular'][:3]
    for user in individual_users:
        # Add PayPal for some users
        pm = PaymentMethod(
            user_id=user.id,
            type='paypal',
            paypal_email=user.email,
            is_default=True
        )
        db.session.add(pm)
        payment_methods.append(pm)
        print(f"  Created PayPal for: {user.email}")

    db.session.commit()
    print(f"  Created {len(payment_methods)} payment methods")
    print(f"  Created {len(invoices)} invoices")
    return payment_methods, invoices


def print_summary(plans, agencies, users, properties, programs, leads):
    """Print a summary of created data."""
    print("\n" + "=" * 60)
    print("SEED DATA SUMMARY")
    print("=" * 60)

    print(f"\nSubscription Plans: {len(plans)}")
    for slug, plan in plans.items():
        print(f"  - {plan.name} ({slug}): {plan.price_monthly} Đ/mois")

    print(f"\nAgencies: {len(agencies)}")
    for agency in agencies:
        sub = Subscription.query.filter_by(agency_id=agency.id).first()
        plan = SubscriptionPlan.query.get(sub.plan_id) if sub else None
        print(f"  - {agency.name} ({agency.city}) - Plan: {plan.name if plan else 'None'}")

    print(f"\nUsers: {len(users)}")
    user_types = {}
    for user in users:
        user_types[user.user_type] = user_types.get(user.user_type, 0) + 1
    for utype, count in user_types.items():
        print(f"  - {utype}: {count}")

    print(f"\nProperties: {len(properties)}")
    by_city = {}
    by_type = {}
    by_status = {}
    for prop in properties:
        by_city[prop.city] = by_city.get(prop.city, 0) + 1
        by_type[prop.property_type] = by_type.get(prop.property_type, 0) + 1
        by_status[prop.status] = by_status.get(prop.status, 0) + 1

    print("  By city:")
    for city, count in sorted(by_city.items(), key=lambda x: -x[1]):
        print(f"    - {city}: {count}")
    print("  By type:")
    for ptype, count in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"    - {ptype}: {count}")
    print("  By status:")
    for status, count in sorted(by_status.items(), key=lambda x: -x[1]):
        print(f"    - {status}: {count}")

    print(f"\nPrograms: {len(programs)}")
    for program in programs:
        print(f"  - {program.name} ({program.city}): {program.available_units}/{program.total_units} units available")

    print(f"\nLeads: {len(leads)}")
    lead_statuses = {}
    for lead in leads:
        lead_statuses[lead.status] = lead_statuses.get(lead.status, 0) + 1
    for status, count in sorted(lead_statuses.items(), key=lambda x: -x[1]):
        print(f"  - {status}: {count}")

    print("\n" + "=" * 60)
    print("TEST ACCOUNTS")
    print("=" * 60)
    print("\nAdmin:")
    print("  Email: admin@semsarout.ma")
    print("  Password: admin123")
    print("\nDemo (Particulier):")
    print("  Email: demo@semsarout.ma")
    print("  Password: demo1234")
    print("\nAgency Users:")
    for i, agency in enumerate(agencies):
        print(f"  Email: agent{i+1}@{agency.slug}.ma")
        print(f"  Password: password123")
        print(f"  Agency: {agency.name}")
    print("\nParticular Users (all):")
    print("  Password: user1234")
    print("=" * 60)


def main():
    with app.app_context():
        print("\n" + "=" * 60)
        print("SEMSAROUT - DATABASE SEEDING")
        print("=" * 60 + "\n")

        # Clear and reseed
        clear_data()

        plans = seed_plans()
        agencies = seed_agencies(plans)
        users = seed_users(agencies)
        properties = seed_properties(users, agencies)
        programs = seed_programs(users, agencies)
        leads = seed_leads(properties, users)
        billing = seed_billing(agencies, users)

        print_summary(plans, agencies, users, properties, programs, leads)

        print("\nDone! Database seeded successfully.")


if __name__ == '__main__':
    main()
