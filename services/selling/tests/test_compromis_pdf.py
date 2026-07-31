from app import compromis_pdf


def test_render_returns_pdf_bytes():
    data = {
        "parties": {"vendeur": {"nom": "A", "cin": "X1", "adresse": "Rabat"},
                    "acheteur": {"nom": "B", "cin": "Y2", "adresse": "Casa"}},
        "bien": {"titre_foncier": "12/3456", "consistance": "Appartement", "superficie": "90 m²",
                 "situation": "Casablanca", "origine_propriete": "acquisition 2015"},
        "prix": {"montant": 900000, "arrhes": 90000, "echeancier": "solde à l'acte"},
        "conditions_suspensives": ["obtention de prêt", "mainlevée d'hypothèque"],
        "situation_hypothecaire": "certificat de propriété du 2026-07-01",
        "reiteration": {"delai_jours": 60, "acte": "notaire"},
        "frais_fiscalite": {"tpi": "à la charge du vendeur", "enregistrement": "acheteur",
                            "conservation_fonciere": "acheteur"},
        "clause_penale": "10% du prix", "election_domicile": "au cabinet du notaire",
        "droit_applicable": "droit marocain",
    }
    out = compromis_pdf.render(data)
    assert out[:4] == b"%PDF"
    assert len(out) > 1000
