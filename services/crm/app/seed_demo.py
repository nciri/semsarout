"""Seed DEV — disponibilités des agents, sans lesquelles la prise de rendez-vous publique
ne propose aucun créneau.

    PYTHONPATH=services/crm \
    DATABASE_URL=postgresql+psycopg://crm:crm@localhost:5432/semsar_dev \
        python3 -m app.seed_demo

Les agents sont déduits de l'agenda existant (`crm.visit.agent_id`) : le seed suit les
données en place plutôt que d'inventer des identifiants. Idempotent — un agent qui a déjà
déclaré ses créneaux n'est pas touché, pour ne pas écraser une saisie manuelle.

Réservé au DEV.
"""
from .db import SessionLocal, init_db
from .models import AgentAvailability, Visit

# Semaine ouvrée type d'une agence : lundi au vendredi, 9 h – 18 h, créneaux de 30 minutes.
WEEKDAYS = range(5)
START, END, SLOT = "09:00", "18:00", 30


def run() -> None:
    init_db()
    db = SessionLocal()
    try:
        agents = {(v.agent_id, v.agency_id) for v in db.query(Visit).all()
                  if v.agent_id and v.agency_id}
        if not agents:
            print("Aucun agent dans crm.visit : rien à faire.")
            return

        created = 0
        for agent_id, agency_id in sorted(agents):
            if db.query(AgentAvailability).filter(AgentAvailability.agent_id == agent_id).count():
                continue
            for weekday in WEEKDAYS:
                db.add(AgentAvailability(agent_id=agent_id, agency_id=agency_id, weekday=weekday,
                                         start_time=START, end_time=END, slot_minutes=SLOT))
                created += 1
        db.commit()
        print(f"{len(agents)} agents, {created} créneaux ajoutés.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
