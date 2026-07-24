"""Checklists juridiques par défaut, générées à la création d'un dossier."""

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
    "Pièces d'identité des parties",
    "Justificatifs de revenus",
    "Rédaction du bail",
    "État des lieux d'entrée",
    "Dépôt de garantie encaissé",
    "Signature du bail",
    "Enregistrement du bail",
]


def default_tasks(case_type: str) -> list[str]:
    return _RENTAL if case_type == "rental" else _SALE
