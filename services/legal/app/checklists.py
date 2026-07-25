"""Checklists juridiques par défaut, générées à la création d'un dossier.

Miroir exact de `backend/app/services/legal_checklists.py` (parité création).
"""

_SALE = [
    "Vérification du titre foncier",
    "Certificat de propriété récent",
    "Quitus fiscal / taxes à jour",
    "Compromis de vente signé",
    "Dépôt du dossier chez le notaire",
    "Levée des conditions suspensives",
    "Signature de l'acte définitif",
    "Enregistrement & conservation foncière",
]

_RENTAL = [
    "Vérification de la propriété",
    "État des lieux d'entrée",
    "Contrat de bail signé",
    "Dépôt de garantie encaissé",
    "Enregistrement du bail",
]


def default_tasks(case_type: str) -> list[str]:
    return list(_RENTAL if case_type == "rental" else _SALE)
