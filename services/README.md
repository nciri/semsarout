# services/ — les 18 services de la cible v2

Chaque service : **FastAPI**, **1 schéma + 1 rôle PostgreSQL** dédiés (ADR-0002), **outbox**
transactionnel, publie/consomme des événements sur `semsar.events`, expose `/health` et `/metrics`.

Gabarit : `services/_template/` (à cloner vers `services/<nom>`).

| # | Service | Domaine (modèles monolithe) |
|---|---------|------------------------------|
| 1 | identity | user · role · team · invitation (+ KYC/CIN) |
| 2 | agency | agency |
| 3 | listing | property · program (+ médias) |
| 4 | geo | market (réf. prix quartier · PostGIS) |
| 5 | search | projection OpenSearch |
| 6 | crm | client · lead · visit · transaction |
| 7 | messaging | conversations · RDV |
| 8 | notification | email · SMS/WhatsApp · alertes |
| 9 | buyer | buyer · estimations · favoris |
| 10 | contract | contract (+ e-signature · WORM) |
| 11 | legal | legal (notaires · dossiers) |
| 12 | billing | subscription · factures |
| 13 | payment | paiements · séquestre CMI |
| 14 | marketplace | shop (produits · panier · commandes) |
| 15 | directory | artisan (+ interventions) |
| 16 | trust-safety | modération · suspension · impersonation |
| 17 | analytics | agrégats (projection) |
| 18 | integrations | staymanager · ingestion partenaires (HMAC) |

**Ordre d'extraction (strangler, cf. §8 du doc cible)** : identity → notification →
contract + legal → billing + payment → puis domaines cœur → décommissionnement du monolithe.

Tant qu'un service n'est pas extrait, le **BFF** proxifie la route correspondante vers le
monolithe Flask : le frontend ne voit aucune différence.
