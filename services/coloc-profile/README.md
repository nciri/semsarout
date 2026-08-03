# coloc-profile — profils chercheurs M3a-L3achrane

Port du service `profile` du dépôt initial (conventions mesh). Port :8522.
Profil + questionnaire lifestyle (référentiel `semsar_common.coloc_referential`)
+ favoris. Créé automatiquement à l'inscription (consumer `user.*`, tenant
m3a-l3achrane). Émet `coloc.profile_updated` (consommé par matching).

    psql "$ADMIN" -f db/schema.sql
    uvicorn app.main:app --port 8522
    python -m app.relay ; python -m app.worker
