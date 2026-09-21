"""Seed DEV — jeu de comptes du tenant **semsar** (un par rôle/persona).

    PYTHONPATH=services/identity \
    DATABASE_URL=postgresql+psycopg://identity:identity@localhost:5432/semsar_dev \
        python3 -m app.seed_semsar_demo

Pendant du `seed_m3a_demo` pour le tenant historique, avec une différence qui dicte
toute sa forme : **les comptes semsar portent déjà des données**. 60 annonces
(`listing.property.owner_id`), 36 leads (`crm.lead.owner_id`) et les 5 agences
(`identity.agency_ro.owner_id`) pointent vers ces identifiants. Supprimer puis recréer
les comptes orphelinerait tout cela, ou imposerait de remapper une cinquantaine de
colonnes `user_id`/`owner_id`/`agent_id` réparties sur 31 schémas — une table oubliée
étant une donnée perdue en silence.

D'où le choix : **réécrire en place, à identifiant constant**. Chaque entrée d'ACCOUNTS
est adressée par son `id`, et seuls l'email, l'identité, le rôle et le mot de passe sont
réécrits. Ce qui pend au compte reste rattaché sans qu'aucune autre table ne bouge.

Idempotent : rejouable sans effet de bord, il réaligne les comptes sur cette liste.

Réservé au DEV — le mot de passe ci-dessous est en clair et commun à tous les comptes.
Ce module ne doit jamais être exécuté contre la production.
"""
from werkzeug.security import generate_password_hash

from .db import SessionLocal, init_db
from .models import UserRO

TENANT = "semsar"
PASSWORD = "Semsarout-Dev-2026!"  # DEV uniquement

# Le superadmin (id 1) est délibérément ABSENT d'ACCOUNTS : compte d'administration de la
# plateforme, hors périmètre du seed. La garde plus bas empêche de l'y réintroduire par mégarde.
SUPERADMIN_ID = 1

# `id` fait foi, jamais l'email : c'est lui que référencent les annonces et les leads.
ACCOUNTS = [
    # Particulier vendeur — porte 4 annonces et 7 leads.
    {"id": 2, "email": "proprietaire@semsarout.com", "first_name": "Yassine",
     "last_name": "Propriétaire", "user_type": "particular", "account_role": "buyer"},

    # Agents d'agence — chacun propriétaire de son agence (agency_ro.owner_id) et de ses annonces.
    {"id": 3, "email": "agent1@semsarout.com", "first_name": "Mehdi", "last_name": "Alaoui",
     "user_type": "professional", "account_role": "agent"},
    {"id": 4, "email": "agent2@semsarout.com", "first_name": "Sanaa", "last_name": "Bennani",
     "user_type": "professional", "account_role": "agent"},
    {"id": 5, "email": "agent3@semsarout.com", "first_name": "Rachid", "last_name": "Tazi",
     "user_type": "professional", "account_role": "agent"},
    {"id": 6, "email": "agent4@semsarout.com", "first_name": "Houda", "last_name": "Idrissi",
     "user_type": "professional", "account_role": "agent"},
    {"id": 7, "email": "agent5@semsarout.com", "first_name": "Younes", "last_name": "Chakir",
     "user_type": "professional", "account_role": "agent"},

    # Acheteurs/chercheurs — portent des leads et des annonces de particuliers.
    {"id": 8, "email": "acheteur1@semsarout.com", "first_name": "Karim", "last_name": "Benjelloun",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 9, "email": "acheteur2@semsarout.com", "first_name": "Nadia", "last_name": "Chraibi",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 10, "email": "acheteur3@semsarout.com", "first_name": "Mounir", "last_name": "Squalli",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 11, "email": "acheteur4@semsarout.com", "first_name": "Leila", "last_name": "Berrada",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 12, "email": "acheteur5@semsarout.com", "first_name": "Hamza", "last_name": "Kettani",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 13, "email": "acheteur6@semsarout.com", "first_name": "Sara", "last_name": "Filali",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 14, "email": "acheteur7@semsarout.com", "first_name": "Rim", "last_name": "Bennis",
     "user_type": "particular", "account_role": "buyer"},
    {"id": 15, "email": "acheteur8@semsarout.com", "first_name": "Imane", "last_name": "Lahlou",
     "user_type": "particular", "account_role": "buyer"},

    # Équipe de l'agence 1 — leur rôle RBAC (identity.user_role_ro : manager, agent, marketing,
    # accountant) est déjà posé et n'est pas touché ici. `account_role` vaut `agent` pour tous,
    # puisque tous sont membres d'une agence ; il valait `buyer`, l'inscription ayant longtemps
    # forcé ce rôle en dur quel que soit le choix du formulaire.
    {"id": 16, "email": "manager@semsarout.com", "first_name": "Karim", "last_name": "Manager",
     "user_type": "professional", "account_role": "agent"},
    {"id": 17, "email": "agent.fatima@semsarout.com", "first_name": "Fatima", "last_name": "Zahra",
     "user_type": "professional", "account_role": "agent"},
    {"id": 18, "email": "agent.ahmed@semsarout.com", "first_name": "Ahmed", "last_name": "Ouali",
     "user_type": "professional", "account_role": "agent"},
    {"id": 19, "email": "agent.salma@semsarout.com", "first_name": "Salma", "last_name": "Rifai",
     "user_type": "professional", "account_role": "agent"},
    {"id": 20, "email": "agent.omar@semsarout.com", "first_name": "Omar", "last_name": "Sefrioui",
     "user_type": "professional", "account_role": "agent"},
    {"id": 21, "email": "marketing@semsarout.com", "first_name": "Nadia", "last_name": "Marketing",
     "user_type": "professional", "account_role": "agent"},
    {"id": 22, "email": "comptable@semsarout.com", "first_name": "Hassan", "last_name": "Comptable",
     "user_type": "professional", "account_role": "agent"},
]

# Comptes de test laissés par des sessions passées, vérifiés SANS donnée rattachée
# (0 annonce, 0 lead, 0 agence, 0 notification). Leurs rôles RBAC éventuels partent avec.
OBSOLETES = [29, 53, 54, 55, 2000001, 2000002]


def seed():
    init_db()
    db = SessionLocal()
    reecrits, absents, supprimes = [], [], []
    try:
        for acc in ACCOUNTS:
            if acc["id"] == SUPERADMIN_ID:
                continue
            user = db.get(UserRO, acc["id"])
            if user is None:
                absents.append(acc["id"])
                continue
            user.email = acc["email"]
            user.first_name = acc["first_name"]
            user.last_name = acc["last_name"]
            user.user_type = acc["user_type"]
            user.account_role = acc["account_role"]
            user.password_hash = generate_password_hash(PASSWORD)
            user.is_active = True
            reecrits.append(acc["email"])

        for uid in OBSOLETES:
            if uid == SUPERADMIN_ID:
                continue
            user = db.get(UserRO, uid)
            if user is not None:
                db.delete(user)
                supprimes.append(uid)

        db.commit()
    finally:
        db.close()

    print(f"{len(reecrits)} compte(s) réécrit(s), mot de passe commun : {PASSWORD}")
    for email in reecrits:
        print(f"  · {email}")
    if supprimes:
        print(f"{len(supprimes)} compte(s) obsolète(s) supprimé(s) : {supprimes}")
    if absents:
        print(f"⚠ {len(absents)} identifiant(s) introuvable(s), ignoré(s) : {absents}")


if __name__ == "__main__":
    seed()
