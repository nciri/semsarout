# partner — portail partenaires/affiliés M3a-L3achrane

Service mono-tenant m3a-l3achrane (conventions du mesh : sync SQLAlchemy, libs
semsar_*, erreurs legacy `{'error': msg}`, outbox transactionnel). Port :8525.

Démarrage :
    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8525
