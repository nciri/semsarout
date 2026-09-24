"""Seed DEV — profils de colocation des comptes de démonstration m3a-l3achrane.

    PYTHONPATH=services/coloc-profile \
    DATABASE_URL=postgresql+psycopg://coloc_profile:coloc_profile@localhost:5432/semsar_dev \
    M3A_CANDIDAT_USER_ID=49 M3A_BAILLEUR_USER_ID=50 \
        python3 -m app.seed_demo

Sans profils, le compteur « profils vérifiés » du back-office reste à zéro et le matching n'a
rien à comparer. Les identifiants viennent de l'environnement : ils sont créés par
`services/identity/app/seed_m3a_demo.py`, qui n'émet aucun événement — aucun autre service ne
peut donc les deviner. Idempotent : un profil déjà présent n'est pas réécrit.

Réservé au DEV.
"""
import os
from datetime import date

from .db import SessionLocal, init_db
from .models import LifestyleAnswer, Profile

PROFILES = [
    {
        "env": "M3A_CANDIDAT_USER_ID",
        "display_name": "Sara C.",
        "gender": "FEMME",
        "city": "Casablanca",
        "bio": "Étudiante en école de commerce, calme en semaine, cuisine le week-end.",
        "budget": (1800, 2600),
        "move_in": date(2026, 10, 1),
        "verified": True,
        "answers": {"coucher": "avant22", "travail": "jour", "menage": "2-3-semaine",
                    "vaisselle": "immediat"},
    },
    {
        "env": "M3A_BAILLEUR_USER_ID",
        "display_name": "Karim B.",
        "gender": "HOMME",
        "city": "Casablanca",
        "bio": "Bailleur de deux colocations à Maârif, disponible en soirée.",
        "budget": (2000, 3200),
        "move_in": date(2026, 11, 1),
        "verified": True,
        "answers": {"coucher": "22h-minuit", "travail": "teletravail", "menage": "hebdomadaire"},
    },
]


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        created = []
        for spec in PROFILES:
            raw = os.environ.get(spec["env"])
            if not raw or not raw.isdigit():
                print(f"{spec['env']} absent : profil « {spec['display_name']} » ignoré.")
                continue
            user_id = int(raw)
            if db.query(Profile).filter(Profile.user_id == user_id).first() is not None:
                continue

            low, high = spec["budget"]
            profile = Profile(user_id=user_id, display_name=spec["display_name"],
                              is_verified=spec["verified"], gender=spec["gender"],
                              city=spec["city"], bio=spec["bio"],
                              budget_min=low, budget_max=high, move_in_date=spec["move_in"])
            db.add(profile)
            db.flush()
            for code, value in spec["answers"].items():
                db.add(LifestyleAnswer(profile_id=profile.id, question_code=code, value=value,
                                       importance="PREFERENCE"))
            created.append(spec["display_name"])
        db.commit()
        print(f"Profils créés : {created or '—'}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
