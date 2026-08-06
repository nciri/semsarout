"""Seed DEV — comptes de test du tenant **m3a-l3achrane** (un par rôle/persona).

À lancer contre la base du service identity (le tenant doit exister : appliquer
`services/identity/db/add_tenant.sql` une fois au préalable). Exemple :

    PYTHONPATH=services/identity \
    DATABASE_URL=postgresql+psycopg://identity:identity@localhost:5432/semsar \
        python3 -m app.seed_m3a_demo

Idempotent : ré-exécuter met à jour le mot de passe / rôle des comptes existants
(clé logique = (tenant, email)). Réservé au DEV — mots de passe volontairement simples.

Note : les comptes sont créés directement dans `user_ro` (suffisant pour le login,
qui lit identity). Aucun événement `user.created` n'est émis ici — les projections
des autres services ne verront donc pas ces comptes ; pour un compte « complet »,
passer par l'inscription de l'app.
"""
from datetime import datetime

from werkzeug.security import generate_password_hash

from .db import SessionLocal, init_db
from .models import RoleRO, UserRO

TENANT = "m3a-l3achrane"
PASSWORD = "Test1234!"  # DEV uniquement

# Un compte par rôle de l'application. user_type ∈ {particular, professional, admin},
# account_role ∈ {buyer, agent, admin} (valeurs canoniques, cf. modèle User).
ACCOUNTS = [
    {
        "email": "candidat@m3a.ma", "first_name": "Sara", "last_name": "Candidat",
        "user_type": "particular", "account_role": "buyer",
        "role_label": "Candidat / chercheur de colocation (surface /espace)",
    },
    {
        "email": "bailleur@m3a.ma", "first_name": "Karim", "last_name": "Bailleur",
        "user_type": "professional", "account_role": "agent",
        "role_label": "Bailleur / annonceur de colocations",
    },
    {
        "email": "partenaire@m3a.ma", "first_name": "Nadia", "last_name": "Partenaire",
        "user_type": "professional", "account_role": "agent",
        "role_label": "Partenaire institutionnel (surface /partenaire)",
    },
    {
        "email": "admin@m3a.ma", "first_name": "Youssef", "last_name": "Admin",
        "user_type": "admin", "account_role": "admin", "superadmin": True,
        "role_label": "Administrateur plateforme (surface /back-office, rôle RBAC superadmin)",
    },
]


def _ensure_superadmin_role(db):
    """Retourne le rôle RBAC `superadmin`, en le créant si absent."""
    role = db.query(RoleRO).filter(RoleRO.slug == "superadmin").first()
    if role is None:
        role = RoleRO(slug="superadmin", name="Super administrateur", level=1000, is_system=True)
        db.add(role)
        db.flush()
    return role


def seed():
    init_db()
    db = SessionLocal()
    created, updated = [], []
    try:
        for acc in ACCOUNTS:
            user = (
                db.query(UserRO)
                .filter(UserRO.tenant == TENANT, UserRO.email == acc["email"])
                .first()
            )
            if user is None:
                user = UserRO(
                    tenant=TENANT,
                    email=acc["email"],
                    password_hash=generate_password_hash(PASSWORD),
                    first_name=acc["first_name"],
                    last_name=acc["last_name"],
                    user_type=acc["user_type"],
                    account_role=acc["account_role"],
                    is_active=True,
                    is_verified=True,
                    created_at=datetime.utcnow(),
                )
                db.add(user)
                created.append(acc["email"])
            else:
                # Reset : mot de passe + rôle applicatif (comptes de test reproductibles).
                user.password_hash = generate_password_hash(PASSWORD)
                user.user_type = acc["user_type"]
                user.account_role = acc["account_role"]
                user.is_active = True
                user.is_verified = True
                updated.append(acc["email"])

            if acc.get("superadmin"):
                db.flush()  # garantir user.id
                role = _ensure_superadmin_role(db)
                if role not in user.roles:
                    user.roles.append(role)

        db.commit()
    finally:
        db.close()

    print(f"\nTenant : {TENANT}")
    print(f"Créés  : {created or '—'}")
    print(f"MàJ    : {updated or '—'}")
    print(f"\nMot de passe (tous) : {PASSWORD}\n")
    for acc in ACCOUNTS:
        print(f"  • {acc['email']:<20} — {acc['role_label']}")
    print()


if __name__ == "__main__":
    seed()
