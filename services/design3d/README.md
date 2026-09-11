# design3d — conception intérieure (SemsarOut)

Service mono-tenant SemsarOut (conventions du mesh : sync SQLAlchemy, libs
semsar_*, erreurs legacy `{'error': msg}`, outbox transactionnel). Port :8526.

Projets de conception intérieure : plans 2D en mètres (brique 1), puis scènes
3D et rendus (briques 2-3).

Démarrage :
    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8526
