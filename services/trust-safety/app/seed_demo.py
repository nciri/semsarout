"""Seed DEV — file de signalements et scores de confiance du tenant m3a-l3achrane.

    PYTHONPATH=services/trust-safety \
    DATABASE_URL=postgresql+psycopg://trust_safety:trust_safety@localhost:5432/semsar_dev \
    M3A_CANDIDAT_USER_ID=49 M3A_BAILLEUR_USER_ID=50 \
        python3 -m app.seed_demo

Sans signalement ouvert, l'écran de modération du back-office reste vide et les actions
« résoudre / rejeter » ne sont pas testables ; sans score de confiance, le badge de l'espace
sécurité affiche toujours « non vérifié ». Les identifiants viennent de l'environnement
(comptes créés par `services/identity/app/seed_m3a_demo.py`). Idempotent.

Réservé au DEV.
"""
import os

from .db import SessionLocal, init_db
from .models import Report, TrustLevel

TENANT = "m3a-l3achrane"


def _uid(name: str) -> int | None:
    raw = os.environ.get(name)
    return int(raw) if raw and raw.isdigit() else None


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        candidat, bailleur = _uid("M3A_CANDIDAT_USER_ID"), _uid("M3A_BAILLEUR_USER_ID")
        if candidat is None or bailleur is None:
            print("M3A_CANDIDAT_USER_ID / M3A_BAILLEUR_USER_ID absents : rien à faire.")
            return

        # KYC vérifié des deux côtés, une expérience de location pour le bailleur : les deux
        # niveaux de badge sont ainsi visibles à l'écran.
        for entity_id, level, deals in ((candidat, "verified", 0),
                                        (bailleur, "verified_experience", 2)):
            if db.get(TrustLevel, {"entity_type": "user", "entity_id": entity_id}) is None:
                db.add(TrustLevel(entity_type="user", entity_id=entity_id,
                                  level=level, deal_count=deals))

        existing = db.query(Report).filter(Report.tenant == TENANT,
                                           Report.target_id == "demo-annonce-1").first()
        if existing is None:
            db.add(Report(tenant=TENANT, reporter_id=candidat, target_type="listing",
                          target_id="demo-annonce-1", reason="inappropriate",
                          description="Les photos ne correspondent pas au logement visité.",
                          status="open"))
        db.commit()
        print("Scores de confiance et signalement de démonstration en place.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
