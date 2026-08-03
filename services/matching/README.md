# matching — compatibilité M3a-L3achrane

Port du service matching du dépôt initial : scoring déterministe pur
(contraintes dures + budget 0.4/lifestyle 0.6 + explications ≤ 4, AUCUN LLM).
Étage vectoriel (pgvector, ≤15 %) NON porté (hors périmètre spec §10).
Calcul PARESSEUX : score calculé à la première demande (API interne appelée
par le BFF), mis en cache dans match_scores, invalidé par événements
(worker : coloc.profile_updated, coloc.listing_published/status_changed).

```bash
psql "$ADMIN" -f db/schema.sql
uvicorn app.main:app --port 8523
python -m app.worker
```
