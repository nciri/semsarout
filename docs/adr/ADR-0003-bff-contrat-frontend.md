# ADR-0003 — BFF : préservation du contrat `/api/v1` (frontend intact)

- **Statut :** accepté

## Décision

Le **frontend React n'est pas modifié**. Un **Gateway/BFF** (FastAPI) devient le point d'entrée
de l'API et **réexpose `/api/v1` à l'identique** (mêmes chemins, mêmes formes de réponse, mêmes
codes). En Phase 0, le BFF **proxifie** simplement le monolithe Flask ; au fil du strangler, il
routera route par route vers les nouveaux services et **agrègera** les lectures transverses.

## Garanties de non-régression

- **Tests de contrat** : comparaison BFF ↔ monolithe sur un jeu de routes clés.
- **Snapshots OpenAPI** de `/api/v1` versionnés ; tout changement de forme est un échec CI.
- Endpoints d'auth inchangés (`/auth/login`, `/auth/refresh`) ; le passage à JWT RS256 est
  transparent pour le front (il stocke/renvoie le token, sans changement d'écran).

## Conséquences

- Le front peut continuer à pointer `/api/v1` (via Vite proxy en dev, Traefik en prod) sans
  aucune modification d'écran.
- Le BFF est l'unique endroit où le contrat est garanti ; les services internes peuvent évoluer
  librement derrière lui.
