# service search

Projection **OpenSearch** des biens (recherche + filtres + carte). **Pas de source de
vérité** : reconstructible en rejouant les événements `listing.*` (source = PostgreSQL du
monolithe/`listing`).

- **Worker** (`app.worker`) : consomme `listing.#` → upsert/suppression dans l'index `properties`.
- **API** (`app.main`) : `GET /search/properties?q=&city=&transaction_type=&property_type=&page=&per_page=`.

## Démarrer (dev)

```bash
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_events -e ../../libs/semsar_search -e .

uvicorn app.main:app --host 0.0.0.0 --port 8003   # API de lecture
python -m app.worker                               # indexation (process séparé)
```

## Flux

Le **monolithe** émet `listing.created/updated/deleted` via son outbox (voir
`backend/app/models/outbox.py` + `backend/scripts/relay_outbox.py`). Le worker les consomme
et met l'index à jour. Le BFF route `/api/v1/search/*` vers ce service.

Reconstruction complète : vider l'index puis republier les événements (ou un backfill).
