# service legal

Notaires + dossiers juridiques + checklists auto-générées. **Cloisonné par agence** (issue
du JWT — anti-IDOR). Schéma + rôle PostgreSQL dédiés (ADR-0002).

- `GET/POST/PUT/DELETE /legal/notaries` — carnet de notaires de l'agence.
- `GET/POST /legal/cases`, `GET /legal/cases/{id}` — dossiers (création → checklist auto selon le type).
- `PUT /legal/tasks/{id}` — avance une étape (cloisonnement via le dossier parent).

## Démarrer (dev)

```bash
psql "$ADMIN_DATABASE_URL" -f db/schema.sql
cp .env.example .env
pip install -e ../../libs/semsar_common -e ../../libs/semsar_auth -e .

uvicorn app.main:app --host 0.0.0.0 --port 8006   # JWT_PUBLIC_KEY requis
```

Le BFF route `/api/v1/legal/*` ici (surface additive). En cible, ce service pourra émettre
`legal.case.closed` (outbox) et archiver le dossier clôturé en **WORM** (comme `contract`).
