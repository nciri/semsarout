"""Mise en route d'une agence : étapes déduites de l'état réel du compte.

Reprise de StayManager (`app/services/onboarding_service.py`) sans sa gamification
(mascotte, badges) : c'est une décision produit, pas une reprise technique. Ce qui est
repris, c'est le principe utile — **aucune case à cocher à la main**. Chaque étape se lit
dans les données des services propriétaires, donc elle ne peut pas mentir : une agence qui
a publié un bien ne verra jamais « publiez votre premier bien ».
"""
PUBLISHED_STATUSES = ("published", "active", "available")


def _done(properties, members, clients, visits, agency, settings, subscription) -> dict:
    published = [p for p in properties if (p.get("status") or "") in PUBLISHED_STATUSES]
    return {
        # Un profil incomplet se voit sur la fiche publique de l'agence : ville et téléphone
        # d'abord, c'est ce qu'un acquéreur cherche.
        "agency_profile": bool((agency.get("city") or "").strip()
                               and (agency.get("phone") or "").strip()),
        "first_property": bool(properties),
        "publish_property": bool(published),
        "invite_team": len(members) > 1,
        "first_client": bool(clients),
        "first_visit": bool(visits),
        "commission_settings": bool(settings.get("default_sale_commission_fee")
                                    or settings.get("default_rental_commission_rate")),
        "subscription_active": (subscription or {}).get("status") == "active",
    }


ORDER = ("agency_profile", "first_property", "publish_property", "commission_settings",
         "invite_team", "first_client", "first_visit", "subscription_active")

# Où l'agence va pour faire l'étape. Le front n'a pas à deviner ces chemins.
HREFS = {
    "agency_profile": "/backoffice/parametres",
    "first_property": "/backoffice/biens",
    "publish_property": "/backoffice/biens",
    "commission_settings": "/backoffice/parametres",
    "invite_team": "/backoffice/equipe",
    "first_client": "/backoffice/clients",
    "first_visit": "/backoffice/visites",
    "subscription_active": "/dashboard/compte/abonnement",
}


def build(*, properties, members, clients, visits, agency, settings, subscription) -> dict:
    """État de mise en route : étapes ordonnées, part faite, et ce qui reste à faire."""
    done = _done(properties, members, clients, visits, agency, settings, subscription)
    steps = [{"key": key, "done": bool(done.get(key)), "href": HREFS[key]} for key in ORDER]
    completed = sum(1 for s in steps if s["done"])
    return {"steps": steps, "completed": completed, "total": len(steps),
            "progress": round(completed / len(steps) * 100) if steps else 0,
            "complete": completed == len(steps),
            # La première étape non faite : ce qu'il faut proposer, pas une liste à trier.
            "next": next((s["key"] for s in steps if not s["done"]), None)}
