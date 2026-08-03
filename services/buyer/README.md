# Service `buyer`

Fonctions acheteur/chercheur extraites du monolithe (tranche #6 T1). Reproduit à l'identique
`/buyer/saved-searches*`, `/buyer/favorites*`, `/buyer/estimates*` (cf. `backend/app/api/v1/buyer.py`).

- **Port** : 8515 · **Schéma/rôle Postgres** : `buyer` (ADR-0002).
- **Routes** (reroutées par le BFF, préfixe `/api/v1` retiré) : recherches sauvegardées (CRUD),
  favoris (CRUD), estimations (CRUD). Cloisonnées par `user_id` (JWT).
- **`/buyer/messages*` reste au service `messaging`** (déjà extrait) — pas dans ce service.
- **Gate `require_buyer`** (rôle `buyer` du JWT) sur saved-searches + estimates (403
  "Cette fonctionnalité est réservée aux acheteurs/chercheurs") ; les favoris n'en ont pas.
- **Favoris** : le bien imbriqué vient de la projection locale `property_ro` (réduite : titre/prix/
  ville/type/surface/pièces/statut), maintenue par `listing.*` (`app/worker.py`). **Écart assumé** :
  le monolithe imbrique le dict complet du bien ; ici les champs d'affichage (favoris = 0 en base,
  embed non couvert par le contrat).

## Migration & lancement

```bash
psql "$ADMIN" -f services/buyer/db/schema.sql                  # rôle + schéma (une fois)
# init_db() crée les tables au démarrage, puis :
psql "$ADMIN" -f services/buyer/db/migrate_from_monolith.sql   # property_ro + données (0 ligne)
```

Lancé par `scripts/dev-mesh-up.sh` (service + worker ; `BUYER_URL` câblé au BFF).
Vérification de parité : `tools/contract_test.py --services buyer`.
