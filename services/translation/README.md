# service translation

Traduction FR↔AR à la volée du contenu dynamique (descriptions de biens, textes saisis
par agents…), via Azure Translator Text API v3.0 + cache Postgres (table
`translation_cache`) pour éviter de rappeler Azure sur un texte déjà traduit.

## API

- `GET /health`
- `POST /v1/translate` — `{ "texts": [str, ...], "target": "ar"|"fr", "source": "fr"|"ar"|null }`
  → `{ "translations": [ { "source": str, "translated": str, "cached": bool } ] }` (ordre
  préservé). Max 100 textes / 50 000 caractères par requête → 422 au-delà.

## Config

Voir `.env.example`. `AZURE_TRANSLATOR_KEY` est obligatoire pour appeler réellement Azure ;
en son absence, `POST /v1/translate` renvoie 503 (`Problem` RFC 9457).

## Lancer en local

```
pip install -e libs/semsar_common -e libs/semsar_auth -e libs/semsar_events
pip install -e services/translation[test]
uvicorn app.main:app --app-dir services/translation --port 8524
```

## Tests

```
cd services/translation && python -m pytest tests/ -v
```

Le client Azure est toujours mocké dans les tests (aucun réseau, aucune vraie clé).
