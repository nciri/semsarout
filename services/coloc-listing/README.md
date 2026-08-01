# coloc-listing — annonces de colocation M3a-L3achrane

Port du service `listing` du dépôt initial m3a-l3achrane, adapté aux conventions
du mesh (sync SQLAlchemy, libs semsar_*, erreurs legacy). Port :8521.

Cycle de vie : BROUILLON → EN_MODERATION → PUBLIEE (modération superadmin),
9 statuts, transitions strictes (app/state_machine.py). À l'approbation,
`coloc.listing_published` part en outbox → index OpenSearch `coloc_listings`
(worker du service search).

Démarrage :
    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8521
    python -m app.relay          # outbox → RabbitMQ
Seed de démo (dev) : python -m app.seed_demo
