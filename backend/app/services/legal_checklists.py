"""Default legal checklists per transaction type."""

LEGAL_CHECKLISTS = {
    'sale': [
        'Vérification du titre foncier',
        'Certificat de propriété récent',
        'Quitus fiscal / taxes à jour',
        'Compromis de vente signé',
        'Dépôt du dossier chez le notaire',
        'Levée des conditions suspensives',
        "Signature de l'acte définitif",
        'Enregistrement & conservation foncière',
    ],
    'rental': [
        'Vérification de la propriété',
        "État des lieux d'entrée",
        'Contrat de bail signé',
        'Dépôt de garantie encaissé',
        'Enregistrement du bail',
    ],
}


def default_tasks(case_type):
    return list(LEGAL_CHECKLISTS.get(case_type, LEGAL_CHECKLISTS['sale']))
