# service agency

Domaine **agence** (source de vérité) — lecture reroutée du monolithe : `GET /agencies`,
`GET /agencies/{slug}`, `GET /my-agency` (parité, erreurs legacy). `properties_count` vient
d'une projection `listing_ro` (id, agency_id) maintenue par les événements `listing.*` (worker).
Écritures (create/update/regenerate-api-key) et `/agencies/{slug}/properties` (domaine listing)
restent au monolithe pour l'instant.
