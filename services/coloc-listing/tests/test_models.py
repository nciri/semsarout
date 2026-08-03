from decimal import Decimal

from app.models import ColocProperty, CurrentRoommates, HouseRule, Listing, ListingMedia


def _listing(db):
    prop = ColocProperty(owner_id=7, city="Casablanca", neighborhood="Gauthier",
                         property_type="APPARTEMENT", area_m2=90,
                         amenities={"wifi": True, "machine_a_laver": True})
    db.add(prop); db.flush()
    listing = Listing(property_id=prop.id, owner_id=7, title="Chambre lumineuse à Gauthier",
                      description="Belle chambre.", bed_type="CHAMBRE_INDIVIDUELLE",
                      rent=Decimal("2200.00"), housing_gender="FEMININ", furnished=True, capacity=3)
    db.add(listing); db.flush()
    db.add(HouseRule(listing_id=listing.id, code="fumeur", value="Non-fumeur"))
    db.add(ListingMedia(listing_id=listing.id, url="/uploads/photos/demo1.jpg",
                        position=0, media_type="CHAMBRE"))
    db.add(CurrentRoommates(listing_id=listing.id, total=2, women=2, men=0))
    db.commit(); db.refresh(listing)
    return listing


def test_defaults_and_to_dict(db_session):
    listing = _listing(db_session)
    assert listing.status == "BROUILLON"
    assert listing.currency == "MAD"
    d = listing.to_dict()
    assert d["title"] == "Chambre lumineuse à Gauthier"
    assert d["city"] == "Casablanca"
    assert d["rent"] == 2200.0
    assert d["media"] == [{"url": "/uploads/photos/demo1.jpg", "position": 0, "media_type": "CHAMBRE"}]
    assert d["house_rules"] == [{"code": "fumeur", "value": "Non-fumeur"}]
    assert d["roommates"] == {"total": 2, "women": 2, "men": 0}
    # Confidentialité : jamais d'adresse ni de coordonnées dans les sorties.
    assert "address" not in d and "latitude" not in d and "longitude" not in d
