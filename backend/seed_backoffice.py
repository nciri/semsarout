"""
Seed script for backoffice test data.
Run with: python seed_backoffice.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
import random
from app import create_app, db
from app.models import (
    User, Agency, Property, Lead,
    Role, Permission, Client, ClientInteraction,
    Visit, CalendarEvent, Transaction, Offer, TransactionDocument,
    ActivityLog
)

app = create_app()

# Test data
FIRST_NAMES = ['Mohammed', 'Fatima', 'Ahmed', 'Khadija', 'Youssef', 'Aicha', 'Omar', 'Salma', 'Hassan', 'Nadia', 'Karim', 'Layla', 'Rachid', 'Samira', 'Mehdi']
LAST_NAMES = ['Alaoui', 'Bennani', 'Tazi', 'Fassi', 'Berrada', 'Chraibi', 'Sqalli', 'Benjelloun', 'Kettani', 'Lahlou', 'Chaoui', 'Amrani', 'Belhaj', 'Idrissi', 'Ziani']
CITIES = ['Casablanca', 'Rabat', 'Marrakech', 'Tanger', 'Fès', 'Agadir', 'Meknès', 'Kénitra']
NEIGHBORHOODS = {
    'Casablanca': ['Maarif', 'Anfa', 'Bourgogne', 'Gauthier', 'Racine', 'Californie', 'Ain Diab', 'Sidi Maarouf'],
    'Rabat': ['Agdal', 'Hassan', 'Souissi', 'Hay Riad', 'Océan', 'Les Orangers'],
    'Marrakech': ['Guéliz', 'Hivernage', 'Palmeraie', 'Médina', 'Targa'],
    'Tanger': ['Malabata', 'Iberia', 'Centre Ville', 'Marshan', 'Cap Spartel'],
    'Fès': ['Ville Nouvelle', 'Médina', 'Saiss', 'Narjiss'],
    'Agadir': ['Centre Ville', 'Founty', 'Charaf', 'Hay Mohammadi'],
    'Meknès': ['Hamria', 'Ville Nouvelle', 'Médina'],
    'Kénitra': ['Centre Ville', 'Bir Rami', 'Mimosas']
}
PROPERTY_TYPES = ['apartment', 'house', 'villa', 'land', 'commercial', 'office']
PROPERTY_TITLES = [
    "Appartement moderne avec vue mer",
    "Villa de luxe avec piscine",
    "Maison traditionnelle rénovée",
    "Penthouse avec terrasse panoramique",
    "Duplex spacieux en centre-ville",
    "Studio meublé proche commodités",
    "Appartement familial 4 chambres",
    "Riad authentique dans la médina",
    "Loft industriel rénové",
    "Villa contemporaine avec jardin"
]


def create_roles_and_permissions():
    """Create default roles and permissions."""
    print("Creating roles and permissions...")

    # Permissions
    modules = ['dashboard', 'properties', 'clients', 'leads', 'visits', 'transactions', 'team', 'stats', 'settings']
    actions = ['view', 'create', 'edit', 'delete']

    permissions = []
    for module in modules:
        for action in actions:
            perm = Permission.query.filter_by(slug=f"{module}.{action}").first()
            if not perm:
                perm = Permission(
                    name=f"{action.capitalize()} {module}",
                    slug=f"{module}.{action}",
                    module=module,
                    description=f"Permission to {action} {module}"
                )
                db.session.add(perm)
                permissions.append(perm)

    db.session.commit()
    all_permissions = Permission.query.all()

    # Roles
    roles_config = [
        {'name': 'Administrateur', 'slug': 'admin', 'level': 100, 'permissions': all_permissions},
        {'name': 'Manager', 'slug': 'manager', 'level': 80, 'permissions': [p for p in all_permissions if p.slug not in ['settings.delete', 'team.delete']]},
        {'name': 'Agent', 'slug': 'agent', 'level': 50, 'permissions': [p for p in all_permissions if p.module in ['dashboard', 'properties', 'clients', 'leads', 'visits', 'transactions'] and p.slug.endswith('.view') or p.slug.endswith('.create') or p.slug.endswith('.edit')]},
        {'name': 'Marketing', 'slug': 'marketing', 'level': 40, 'permissions': [p for p in all_permissions if p.module in ['dashboard', 'leads', 'stats']]},
        {'name': 'Comptable', 'slug': 'accountant', 'level': 30, 'permissions': [p for p in all_permissions if p.module in ['dashboard', 'transactions', 'stats']]},
        {'name': 'Lecture seule', 'slug': 'readonly', 'level': 10, 'permissions': [p for p in all_permissions if p.slug.endswith('.view')]}
    ]

    created_roles = {}
    for rc in roles_config:
        role = Role.query.filter_by(slug=rc['slug']).first()
        if not role:
            role = Role(
                name=rc['name'],
                slug=rc['slug'],
                level=rc['level'],
                is_system=True
            )
            role.permissions = rc['permissions']
            db.session.add(role)
        created_roles[rc['slug']] = role

    db.session.commit()
    print(f"  Created {len(roles_config)} roles")
    return created_roles


def create_agency():
    """Create or get the test agency."""
    print("Creating agency...")
    agency = Agency.query.first()
    if not agency:
        agency = Agency(
            name="SemsarOut Immobilier",
            slug="semsarout",
            email="contact@semsarout.ma",
            phone="+212 522 123 456",
            address="123 Boulevard Mohammed V",
            city="Casablanca",
            description="Agence immobilière de référence au Maroc",
            is_verified=True,
            is_active=True
        )
        db.session.add(agency)
        db.session.commit()
    print(f"  Agency: {agency.name}")
    return agency


def create_users(agency, roles):
    """Create test users."""
    print("Creating users...")

    users_data = [
        {'first_name': 'Admin', 'last_name': 'System', 'email': 'admin@semsarout.ma', 'role': 'admin'},
        {'first_name': 'Karim', 'last_name': 'Alaoui', 'email': 'karim@semsarout.ma', 'role': 'manager'},
        {'first_name': 'Fatima', 'last_name': 'Bennani', 'email': 'fatima@semsarout.ma', 'role': 'agent'},
        {'first_name': 'Ahmed', 'last_name': 'Tazi', 'email': 'ahmed@semsarout.ma', 'role': 'agent'},
        {'first_name': 'Salma', 'last_name': 'Fassi', 'email': 'salma@semsarout.ma', 'role': 'agent'},
        {'first_name': 'Omar', 'last_name': 'Berrada', 'email': 'omar@semsarout.ma', 'role': 'agent'},
        {'first_name': 'Nadia', 'last_name': 'Chraibi', 'email': 'nadia@semsarout.ma', 'role': 'marketing'},
        {'first_name': 'Hassan', 'last_name': 'Sqalli', 'email': 'hassan@semsarout.ma', 'role': 'accountant'},
    ]

    created_users = []
    for ud in users_data:
        user = User.query.filter_by(email=ud['email']).first()
        if not user:
            user = User(
                first_name=ud['first_name'],
                last_name=ud['last_name'],
                email=ud['email'],
                phone=f"+212 6{random.randint(10000000, 99999999)}",
                agency_id=agency.id,
                is_active=True
            )
            user.set_password('password123')
            if ud['role'] in roles:
                user.roles.append(roles[ud['role']])
            db.session.add(user)
        created_users.append(user)

    db.session.commit()
    print(f"  Created {len(users_data)} users")
    return created_users


def create_clients(agency, users):
    """Create test clients."""
    print("Creating clients...")

    agents = [u for u in users if any(r.slug == 'agent' for r in u.roles)]

    clients_data = []
    for i in range(30):
        city = random.choice(CITIES)
        client_type = random.choice(['buyer', 'seller', 'landlord', 'tenant', 'investor'])

        clients_data.append({
            'first_name': random.choice(FIRST_NAMES),
            'last_name': random.choice(LAST_NAMES),
            'email': f"client{i+1}@email.com",
            'phone': f"+212 6{random.randint(10000000, 99999999)}",
            'client_type': client_type,
            'status': random.choice(['active', 'active', 'active', 'prospect', 'inactive']),
            'source': random.choice(['website', 'referral', 'direct', 'social', 'advertising']),
            'city': city,
            'budget_min': random.randint(50, 200) * 10000 if client_type in ['buyer', 'tenant', 'investor'] else None,
            'budget_max': random.randint(200, 500) * 10000 if client_type in ['buyer', 'tenant', 'investor'] else None,
            'search_criteria': {
                'property_types': random.sample(PROPERTY_TYPES, k=random.randint(1, 3)),
                'locations': [city]
            } if client_type in ['buyer', 'tenant', 'investor'] else None,
            'tags': random.sample(['VIP', 'Urgent', 'Investisseur', 'Premier achat', 'Expatrié', 'Retraité'], k=random.randint(0, 2)),
            'notes': f"Client {client_type} intéressé par {city}",
            'assigned_to_id': random.choice(agents).id if agents else None,
            'agency_id': agency.id
        })

    created_clients = []
    for cd in clients_data:
        client = Client(
            first_name=cd['first_name'],
            last_name=cd['last_name'],
            email=cd['email'],
            phone=cd['phone'],
            client_type=cd['client_type'],
            status=cd['status'],
            source=cd['source'],
            city=cd['city'],
            budget_min=cd['budget_min'],
            budget_max=cd['budget_max'],
            search_criteria=cd['search_criteria'],
            tags=cd['tags'],
            notes=cd['notes'],
            assigned_to_id=cd['assigned_to_id'],
            agency_id=cd['agency_id'],
            gdpr_consent=True
        )
        db.session.add(client)
        created_clients.append(client)

    db.session.commit()

    # Add some interactions
    for client in random.sample(created_clients, 15):
        for _ in range(random.randint(1, 4)):
            interaction = ClientInteraction(
                client_id=client.id,
                interaction_type=random.choice(['call', 'email', 'visit', 'meeting', 'whatsapp']),
                subject=random.choice(['Premier contact', 'Suivi', 'Proposition de bien', 'Négociation', 'Questions']),
                content=f"Interaction avec {client.first_name}. Discussion concernant les critères de recherche.",
                direction=random.choice(['inbound', 'outbound']) if random.random() > 0.3 else None,
                created_by_id=client.assigned_to_id,
                created_at=datetime.utcnow() - timedelta(days=random.randint(1, 60))
            )
            db.session.add(interaction)

    db.session.commit()
    print(f"  Created {len(clients_data)} clients with interactions")
    return created_clients


def create_properties(agency, users):
    """Create test properties."""
    print("Creating properties...")

    agents = [u for u in users if any(r.slug == 'agent' for r in u.roles)]

    properties_data = []
    for i in range(25):
        city = random.choice(CITIES)
        neighborhood = random.choice(NEIGHBORHOODS.get(city, ['Centre']))
        prop_type = random.choice(PROPERTY_TYPES)
        listing_type = random.choice(['sale', 'sale', 'sale', 'rent'])

        if listing_type == 'sale':
            price = random.randint(50, 800) * 10000
        else:
            price = random.randint(3, 25) * 1000

        properties_data.append({
            'reference': f"PROP-{datetime.utcnow().strftime('%Y%m')}-{i+1:04d}",
            'title': f"{random.choice(PROPERTY_TITLES)} - {neighborhood}",
            'description': f"Magnifique {prop_type} situé dans le quartier prisé de {neighborhood}. Proche de toutes commodités.",
            'property_type': prop_type,
            'transaction_type': listing_type,
            'price': price,
            'surface': random.randint(40, 400),
            'rooms': random.randint(2, 8),
            'bedrooms': random.randint(1, 5),
            'bathrooms': random.randint(1, 3),
            'city': city,
            'neighborhood': neighborhood,
            'address': f"{random.randint(1, 200)} Rue {random.choice(LAST_NAMES)}",
            'latitude': 33.5 + random.uniform(-0.5, 0.5),
            'longitude': -7.6 + random.uniform(-0.5, 0.5),
            'features': random.sample(['Parking', 'Ascenseur', 'Terrasse', 'Piscine', 'Jardin', 'Climatisation', 'Sécurité', 'Meublé'], k=random.randint(2, 5)),
            'status': random.choice(['active', 'active', 'active', 'pending', 'sold', 'rented']),
            'owner_id': random.choice(agents).id if agents else users[0].id,
            'agency_id': agency.id,
            'views_count': random.randint(10, 500)
        })

    created_properties = []
    for pd in properties_data:
        prop = Property.query.filter_by(reference=pd['reference']).first()
        if not prop:
            prop = Property(
                reference=pd['reference'],
                title=pd['title'],
                description=pd['description'],
                property_type=pd['property_type'],
                transaction_type=pd['transaction_type'],
                price=pd['price'],
                surface=pd['surface'],
                rooms=pd['rooms'],
                bedrooms=pd['bedrooms'],
                bathrooms=pd['bathrooms'],
                city=pd['city'],
                neighborhood=pd['neighborhood'],
                address=pd['address'],
                latitude=pd['latitude'],
                longitude=pd['longitude'],
                features=pd['features'],
                status=pd['status'],
                owner_id=pd['owner_id'],
                agency_id=pd['agency_id'],
                views_count=pd['views_count']
            )
            db.session.add(prop)
        created_properties.append(prop)

    db.session.commit()
    print(f"  Created {len(properties_data)} properties")
    return created_properties


def create_leads(agency, properties):
    """Create test leads."""
    print("Creating leads...")

    leads_data = []
    for i in range(20):
        prop = random.choice(properties) if properties else None
        leads_data.append({
            'name': f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            'email': f"lead{i+1}@email.com",
            'phone': f"+212 6{random.randint(10000000, 99999999)}",
            'source': random.choice(['contact_form', 'phone_reveal', 'callback_request', 'website']),
            'status': random.choice(['new', 'new', 'contacted', 'qualified', 'converted', 'lost']),
            'message': "Je suis intéressé par ce bien. Merci de me contacter.",
            'property_id': prop.id if prop else None,
            'agency_id': agency.id,
            'created_at': datetime.utcnow() - timedelta(days=random.randint(1, 30))
        })

    for ld in leads_data:
        lead = Lead(
            name=ld['name'],
            email=ld['email'],
            phone=ld['phone'],
            source=ld['source'],
            status=ld['status'],
            message=ld['message'],
            property_id=ld['property_id'],
            agency_id=ld['agency_id'],
            created_at=ld['created_at']
        )
        db.session.add(lead)

    db.session.commit()
    print(f"  Created {len(leads_data)} leads")


def create_visits(agency, users, clients, properties):
    """Create test visits."""
    print("Creating visits...")

    agents = [u for u in users if any(r.slug == 'agent' for r in u.roles)]
    active_properties = [p for p in properties if p.status == 'active']

    visits_data = []
    for i in range(30):
        scheduled_at = datetime.utcnow() + timedelta(days=random.randint(-15, 15), hours=random.randint(9, 18))
        status = 'scheduled'
        if scheduled_at < datetime.utcnow():
            status = random.choice(['completed', 'completed', 'cancelled', 'no_show'])
        elif random.random() > 0.5:
            status = 'confirmed'

        client = random.choice(clients) if clients else None
        prop = random.choice(active_properties) if active_properties else None

        visits_data.append({
            'property_id': prop.id if prop else None,
            'client_id': client.id if client else None,
            'visitor_name': client.full_name if client else f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            'visitor_email': client.email if client else f"visitor{i}@email.com",
            'visitor_phone': client.phone if client else f"+212 6{random.randint(10000000, 99999999)}",
            'agent_id': random.choice(agents).id if agents else users[0].id,
            'scheduled_at': scheduled_at,
            'duration_minutes': random.choice([30, 45, 60]),
            'visit_type': random.choice(['in_person', 'video_call']),
            'status': status,
            'notes': "Visite planifiée via le site web",
            'agency_id': agency.id
        })

    for vd in visits_data:
        visit = Visit(
            property_id=vd['property_id'],
            client_id=vd['client_id'],
            visitor_name=vd['visitor_name'],
            visitor_email=vd['visitor_email'],
            visitor_phone=vd['visitor_phone'],
            agent_id=vd['agent_id'],
            scheduled_at=vd['scheduled_at'],
            duration_minutes=vd['duration_minutes'],
            visit_type=vd['visit_type'],
            status=vd['status'],
            notes=vd['notes'],
            agency_id=vd['agency_id']
        )
        if vd['status'] == 'confirmed':
            visit.confirmed_at = datetime.utcnow() - timedelta(days=1)
        elif vd['status'] == 'completed':
            visit.completed_at = vd['scheduled_at'] + timedelta(minutes=vd['duration_minutes'])
            visit.report = "Visite effectuée. Le client a montré un intérêt pour le bien."
            visit.client_feedback = random.choice(['very_interested', 'interested', 'neutral', 'not_interested'])
        elif vd['status'] == 'cancelled':
            visit.cancelled_at = vd['scheduled_at'] - timedelta(hours=2)
            visit.cancellation_reason = "Report demandé par le client"

        db.session.add(visit)

    db.session.commit()
    print(f"  Created {len(visits_data)} visits")


def create_transactions(agency, users, clients, properties):
    """Create test transactions."""
    print("Creating transactions...")

    agents = [u for u in users if any(r.slug == 'agent' for r in u.roles)]
    buyer_clients = [c for c in clients if c.client_type in ['buyer', 'investor']]
    seller_clients = [c for c in clients if c.client_type == 'seller']

    sale_stages = ['contact', 'visit', 'offer', 'negotiation', 'compromise', 'final_act']
    rent_stages = ['contact', 'visit', 'application', 'verification', 'lease', 'move_in']

    transactions_data = []
    for i in range(20):
        prop = random.choice(properties) if properties else None
        tx_type = 'sale' if prop and prop.transaction_type == 'sale' else random.choice(['sale', 'rent'])
        stages = sale_stages if tx_type == 'sale' else rent_stages
        stage_idx = random.randint(0, len(stages) - 1)
        stage = stages[stage_idx]

        status = 'active'
        if stage_idx == len(stages) - 1 and random.random() > 0.3:
            status = 'won'
        elif random.random() > 0.85:
            status = 'lost'

        asking_price = float(prop.price) if prop else random.randint(100, 500) * 10000

        transactions_data.append({
            'reference': f"TX-{datetime.utcnow().strftime('%Y%m')}-{i+1:04d}",
            'property_id': prop.id if prop else None,
            'client_id': random.choice(buyer_clients).id if buyer_clients else (clients[0].id if clients else None),
            'seller_id': random.choice(seller_clients).id if seller_clients else None,
            'agent_id': random.choice(agents).id if agents else users[0].id,
            'transaction_type': tx_type,
            'stage': stage,
            'stage_order': stage_idx,
            'asking_price': asking_price,
            'offer_price': asking_price * random.uniform(0.9, 1.0) if stage_idx >= 2 else None,
            'final_price': asking_price * random.uniform(0.92, 0.98) if status == 'won' else None,
            'commission_rate': random.choice([2.5, 3.0, 3.5, 4.0]),
            'status': status,
            'priority': random.choice(['low', 'medium', 'medium', 'high', 'urgent']),
            'probability': min(100, (stage_idx + 1) * 15 + random.randint(0, 20)),
            'expected_closing_date': datetime.utcnow() + timedelta(days=random.randint(30, 120)),
            'notes': f"Transaction en cours - étape {stage}",
            'agency_id': agency.id
        })

    created_transactions = []
    for td in transactions_data:
        existing_tx = Transaction.query.filter_by(reference=td['reference']).first()
        if existing_tx:
            created_transactions.append(existing_tx)
            continue

        tx = Transaction(
            reference=td['reference'],
            property_id=td['property_id'],
            client_id=td['client_id'],
            seller_id=td['seller_id'],
            agent_id=td['agent_id'],
            transaction_type=td['transaction_type'],
            stage=td['stage'],
            stage_order=td['stage_order'],
            asking_price=td['asking_price'],
            offer_price=td['offer_price'],
            final_price=td['final_price'],
            commission_rate=td['commission_rate'],
            status=td['status'],
            priority=td['priority'],
            probability=td['probability'],
            expected_closing_date=td['expected_closing_date'],
            notes=td['notes'],
            agency_id=td['agency_id']
        )

        if td['status'] == 'won':
            tx.closed_at = datetime.utcnow() - timedelta(days=random.randint(1, 30))
            tx.commission_amount = td['final_price'] * td['commission_rate'] / 100
        elif td['status'] == 'lost':
            tx.closed_at = datetime.utcnow() - timedelta(days=random.randint(1, 30))
            tx.lost_reason = random.choice(['Prix trop élevé', 'Client a trouvé ailleurs', 'Financement refusé', 'Changement de projet'])

        db.session.add(tx)
        created_transactions.append(tx)

    db.session.commit()

    # Add some offers to transactions
    for tx in [t for t in created_transactions if t.stage_order >= 2]:
        num_offers = random.randint(1, 3)
        for j in range(num_offers):
            offer = Offer(
                transaction_id=tx.id,
                amount=float(tx.asking_price) * random.uniform(0.85, 1.0),
                conditions="Sous réserve d'obtention du financement" if random.random() > 0.5 else None,
                offer_type='initial' if j == 0 else 'counter',
                from_party='buyer' if j % 2 == 0 else 'seller',
                status='pending' if j == num_offers - 1 else random.choice(['accepted', 'rejected']),
                created_at=datetime.utcnow() - timedelta(days=random.randint(1, 30))
            )
            if offer.status != 'pending':
                offer.responded_at = offer.created_at + timedelta(days=random.randint(1, 3))
            db.session.add(offer)

    db.session.commit()
    print(f"  Created {len(transactions_data)} transactions with offers")
    return created_transactions


def create_calendar_events(agency, users):
    """Create test calendar events."""
    print("Creating calendar events...")

    events_data = []
    for i in range(15):
        user = random.choice(users)
        start = datetime.utcnow() + timedelta(days=random.randint(-7, 14), hours=random.randint(9, 17))

        events_data.append({
            'title': random.choice([
                'Réunion équipe', 'Signature compromis', 'RDV notaire',
                'Formation', 'Prospection', 'Conférence', 'Déjeuner client'
            ]),
            'description': "Événement planifié",
            'event_type': random.choice(['meeting', 'task', 'reminder', 'other']),
            'start_at': start,
            'end_at': start + timedelta(hours=random.randint(1, 3)),
            'all_day': random.random() > 0.9,
            'location': f"{random.choice(CITIES)}" if random.random() > 0.5 else None,
            'color': random.choice(['blue', 'green', 'red', 'yellow', 'purple']),
            'user_id': user.id,
            'agency_id': agency.id
        })

    for ed in events_data:
        event = CalendarEvent(
            title=ed['title'],
            description=ed['description'],
            event_type=ed['event_type'],
            start_at=ed['start_at'],
            end_at=ed['end_at'],
            all_day=ed['all_day'],
            location=ed['location'],
            color=ed['color'],
            user_id=ed['user_id'],
            agency_id=ed['agency_id']
        )
        db.session.add(event)

    db.session.commit()
    print(f"  Created {len(events_data)} calendar events")


def create_activity_logs(agency, users):
    """Create some activity logs."""
    print("Creating activity logs...")

    actions = [
        ('create', 'property', 'Création d\'un bien'),
        ('update', 'property', 'Modification d\'un bien'),
        ('create', 'client', 'Ajout d\'un client'),
        ('update', 'transaction', 'Mise à jour transaction'),
        ('stage_change', 'transaction', 'Changement d\'étape'),
        ('create', 'visit', 'Visite planifiée'),
        ('update', 'visit', 'Visite confirmée'),
    ]

    for i in range(50):
        action, entity, desc = random.choice(actions)
        user = random.choice(users)

        log = ActivityLog(
            user_id=user.id,
            action=action,
            entity_type=entity,
            entity_id=random.randint(1, 20),
            extra_data={'description': desc},
            agency_id=agency.id,
            ip_address=f"192.168.1.{random.randint(1, 255)}",
            created_at=datetime.utcnow() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        )
        db.session.add(log)

    db.session.commit()
    print(f"  Created 50 activity logs")


def seed_all():
    """Run all seed functions."""
    with app.app_context():
        print("\n" + "="*50)
        print("SEEDING BACKOFFICE DATA")
        print("="*50 + "\n")

        # Create data in order
        roles = create_roles_and_permissions()
        agency = create_agency()
        users = create_users(agency, roles)
        clients = create_clients(agency, users)
        properties = create_properties(agency, users)
        create_leads(agency, properties)
        create_visits(agency, users, clients, properties)
        create_transactions(agency, users, clients, properties)
        create_calendar_events(agency, users)
        create_activity_logs(agency, users)

        print("\n" + "="*50)
        print("SEEDING COMPLETE!")
        print("="*50)
        print("\nTest accounts created:")
        print("  - admin@semsarout.ma (Admin)")
        print("  - karim@semsarout.ma (Manager)")
        print("  - fatima@semsarout.ma (Agent)")
        print("  - ahmed@semsarout.ma (Agent)")
        print("  - salma@semsarout.ma (Agent)")
        print("  - omar@semsarout.ma (Agent)")
        print("  - nadia@semsarout.ma (Marketing)")
        print("  - hassan@semsarout.ma (Comptable)")
        print("\nPassword for all accounts: password123")
        print("="*50 + "\n")


if __name__ == '__main__':
    seed_all()
