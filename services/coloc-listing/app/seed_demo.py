"""Seed de démo dev — 8 annonces publiées (via la couche modèle + outbox).
    PYTHONPATH=services/coloc-listing DATABASE_URL=postgresql+psycopg://coloc_listing:coloc_listing@localhost:5432/semsar_dev \
        RABBITMQ_URL=... EVENTS_EXCHANGE=semsar.events SERVICE_NAME=coloc-listing python3 -m app.seed_demo
Idempotent : ne fait rien si des listings existent déjà.
"""
from datetime import date, timedelta
from decimal import Decimal

from semsar_events import enqueue

from . import events
from .db import SessionLocal, init_db
from .models import (
    ColocLease, ColocPayment, ColocProperty, CurrentRoommates, HouseRule, Listing,
    ListingMedia, _now,
)

DEMO = [
    ("Chambre lumineuse à Gauthier", "Casablanca", "Gauthier", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("2200.00"), True, 3, [("tabac", "non-fumeur"), ("menage", "quotidien")]),
    ("Chambre dans villa avec jardin", "Casablanca", "Californie", "VILLA",
     "CHAMBRE_INDIVIDUELLE", "MIXTE_FAMILIAL", Decimal("2800.00"), True, 4, [("cuisine", "ensemble")]),
    ("Studio meublé proche fac", "Rabat", "Agdal", "STUDIO",
     "STUDIO_ENTIER", "FEMININ", Decimal("3200.00"), True, 1, [("tabac", "non-fumeur")]),
    ("Chambre étudiante à Agdal", "Rabat", "Agdal", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "MASCULIN", Decimal("1800.00"), False, 3, [("invites", "rarement")]),
    ("Colocation moderne à Hay Riad", "Rabat", "Hay Riad", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("2500.00"), True, 2, [("tabac", "non-fumeur"), ("coucher", "avant22")]),
    ("Chambre en résidence étudiante", "Marrakech", "Guéliz", "RESIDENCE_ETUDIANTE",
     "CHAMBRE_INDIVIDUELLE", "FEMININ", Decimal("1500.00"), True, 6, [("invites", "rarement"), ("menage", "quotidien")]),
    ("Chambre partagée centre-ville", "Marrakech", "Médina", "MAISON",
     "CHAMBRE_PARTAGEE", "MASCULIN", Decimal("950.00"), False, 4, [("invites", "souvent")]),
    ("Grande chambre à Maârif", "Casablanca", "Maârif", "APPARTEMENT",
     "CHAMBRE_INDIVIDUELLE", "MASCULIN", Decimal("2400.00"), True, 3, [("tabac", "non-fumeur")]),
]

_OWNER_ID = 1  # compte de démo
_TENANT_USER_ID = 2  # locataire de démo (Contrats & paiements / écran Paiement)


def _search_doc(listing: Listing) -> dict:
    from .main import _search_doc as doc  # même document que l'API

    return doc(listing)


def _seed_leases(db, seeded_listings: list[Listing]) -> None:
    """Baux de démo plausibles — cadre séquestre (états), aucun mouvement d'argent réel.
    Bail 0 : actif, caution en séquestre, loyer du mois courant en séquestre (pour
    l'écran Paiement/séquestre du locataire de démo). Bail 1 : encore pending (avant
    tout séquestre) — illustre les deux statuts dans la vue back-office."""
    if not seeded_listings:
        return
    today = date.today()
    scenarios = [
        (seeded_listings[0], "active", "escrowed", "escrowed"),
        (seeded_listings[1] if len(seeded_listings) > 1 else seeded_listings[0],
         "pending", "pending", "pending"),
    ]
    for listing, lease_status, deposit_status, rent_status in scenarios:
        lease = ColocLease(
            listing_id=listing.id, tenant_user_id=_TENANT_USER_ID, owner_id=listing.owner_id,
            rent_amount=listing.rent, deposit_amount=listing.deposit or listing.rent,
            start_date=today - timedelta(days=10), status=lease_status,
        )
        db.add(lease); db.flush()
        deposit = ColocPayment(lease_id=lease.id, type="deposit",
                               amount=listing.deposit or listing.rent, status=deposit_status)
        rent = ColocPayment(lease_id=lease.id, type="rent", amount=listing.rent,
                            period=today.strftime("%Y-%m"), status=rent_status)
        db.add(deposit); db.add(rent)
        db.flush()
        enqueue(db, "coloc_listing", lease.id, events.LEASE_CREATED,
                {"lease_id": lease.id, "listing_id": listing.id, "owner_id": listing.owner_id,
                 "tenant_user_id": _TENANT_USER_ID})


def seed() -> int:
    init_db()
    db = SessionLocal()
    try:
        if db.query(Listing).count() > 0:
            print("Seed ignoré : des annonces existent déjà.")
            return 0
        now = _now()
        seeded_listings = []
        for i, (title, city, hood, ptype, bed, gender, rent, furnished, cap, rules) in enumerate(DEMO):
            # Non-mixité par défaut (contrainte dure du domaine) : le seed la respecte
            # aussi — tout MIXTE_FAMILIAL résiduel des données de démo devient FEMININ.
            gender = "FEMININ" if gender == "MIXTE_FAMILIAL" else gender
            prop = ColocProperty(owner_id=_OWNER_ID, city=city, neighborhood=hood,
                                 property_type=ptype, area_m2=60 + 10 * i,
                                 amenities={"wifi": True, "machine_a_laver": i % 2 == 0})
            db.add(prop); db.flush()
            listing = Listing(
                property_id=prop.id, owner_id=_OWNER_ID, title=title,
                description=f"{title} — colocation vérifiée M3a-L3achrane.",
                bed_type=bed, rent=rent, housing_gender=gender, furnished=furnished,
                capacity=cap, available_from=date.today() + timedelta(days=15 + i),
                status="PUBLIEE", published_at=now, expires_at=now + timedelta(days=60),
            )
            db.add(listing); db.flush()
            for pos in range(2):
                db.add(ListingMedia(listing_id=listing.id, position=pos, media_type="CHAMBRE",
                                    url=f"/uploads/photos/coloc-demo-{i}-{pos}.jpg"))
            for code, value in rules:
                db.add(HouseRule(listing_id=listing.id, code=code, value=value))
            db.add(CurrentRoommates(listing_id=listing.id, total=cap - 1,
                                    women=cap - 1 if gender == "FEMININ" else 0,
                                    men=cap - 1 if gender == "MASCULIN" else 0))
            db.flush()
            db.refresh(listing)
            enqueue(db, "coloc_listing", listing.id, events.LISTING_PUBLISHED,
                    _search_doc(listing))
            seeded_listings.append(listing)

        _seed_leases(db, seeded_listings)

        db.commit()
        print(f"Seed : {len(DEMO)} annonces publiées (outbox alimentée).")
        return len(DEMO)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
