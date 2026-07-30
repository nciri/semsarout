# Spec — État des lieux (EDL) & décompte de caution (service `rental`)

> Statut : conception validée (brainstorming 2026-07-30). Nouveau sous-domaine de la gestion
> locative. Implémentation **phasée** (A/B/C, voir §12). Fait suite à la Vague 3 (mandats, baux,
> quittancement, CRG, candidatures) — réutilise les patrons `rental` existants.

## 1. Contexte & problème

La gestion locative gère baux, quittancement et dépôt de garantie (`Lease.deposit_amount`,
route `POST /leases/{id}/deposit-return`, email `rental.deposit.returned`), mais **pas l'état des
lieux** — le document contradictoire qui constate l'état du bien à l'**entrée** et à la **sortie**,
et qui **justifie les retenues sur la caution**. Le catalogue le note 🔴 (« États des lieux
entrée/sortie + copie signée »). Sans EDL, la restitution du dépôt est un simple montant saisi à la
main, sans traçabilité ni justification.

Objectif : un **formulaire d'état des lieux structuré** (entrée + sortie), une **comparaison**
entrée↔sortie, et un **décompte de sortie** qui calcule la retenue sur caution — y compris le cas
où les **dégâts dépassent la caution** (solde à réclamer) — pour **finaliser le dossier**.

## 2. Décisions validées (brainstorming)

1. **Structure du formulaire** : **par pièces + éléments**. Chaque pièce (Séjour, Cuisine…)
   contient des éléments (Murs, Sol, Plafond, Équipements…) avec un **état** (bon | moyen |
   mauvais), un commentaire et des **photos**. Permet la comparaison entrée↔sortie élément par élément.
2. **Décompte de caution** : **lignes de retenue chiffrées + solde auto**. Le gestionnaire ajoute
   des lignes (libellé + montant). Le système calcule : `caution restituée = max(0, caution −
   total retenues)` et, si `total > caution`, un **solde à réclamer = total − caution**.
3. **Cas dégâts > caution** : le solde à réclamer est **calculé, tracé et notifié** (email/PDF au
   locataire). Le **recouvrement effectif** (relance, mise en demeure, juridique) est **hors
   périmètre** — seulement consigné.
4. **Signature** : le statut `signed` est **modélisé** et un **PDF** est généré ; l'intégration
   réelle **3a9dSign** (app e-sign du propriétaire du projet) se branchera quand la config sera
   fournie (même approche que le service `contract`, stub ADR-0005). Marquage « signé » manuel en
   attendant.
5. **Photos** : upload objet **S3** par élément (même patron que les pièces de candidature —
   `semsar_storage`, corps binaire brut, clés serveur non traversables).
6. Le **décompte pilote la restitution du dépôt** : finaliser le décompte alimente
   `Lease.deposit_return_amount` / `deposit_returned_at` et émet l'email de décompte de sortie.

## 3. Architecture

- Domaine ajouté au service **`rental`** existant (schéma/rôle `rental`, port 8518). Pas de nouveau
  service.
- Patrons standard : outbox + relay + worker (`semsar_events`), endpoints internes à
  `x-internal-token`, gating `_gate` (feature `rental`) côté back-office, cloisonnement `agency_id`.
- Stockage photos & PDF : `semsar_storage` (MinIO/S3), déjà câblé dans `rental` (`storage.py`,
  bucket `RENTAL_DOCS_BUCKET`).
- Emails : via le service `notification` (nouveaux gabarits + bindings), même design SemsarOut.
  PDF : `reportlab` (patron `pdf.py` quittance/CRG).

## 4. Modèle de données (schéma `rental`)

### 4.1 `Inventory` — un état des lieux
```
id, lease_id(idx), agency_id(idx), type('entree'|'sortie'),
status('draft'|'finalized'|'signed'), general_notes,
conducted_at, conducted_by_id, finalized_at, signed_at, pdf_key,
created_at, updated_at
UNIQUE(lease_id, type)   -- un EDL d'entrée + un de sortie par bail
```

### 4.2 `InventoryRoom` — une pièce
```
id, inventory_id(idx), name, position(int), created_at
```

### 4.3 `InventoryItem` — un élément d'une pièce
```
id, room_id(idx), label, condition('bon'|'moyen'|'mauvais'), comment, position(int), created_at
```

### 4.4 `InventoryPhoto` — une photo d'un élément
```
id, item_id(idx), file_key(S3), filename, content_type, created_at
```

### 4.5 `DepositSettlement` — le décompte de sortie (un par bail)
```
id, lease_id(idx), agency_id(idx),
deposit_amount(Numeric),               -- snapshot de la caution au moment du décompte
total_deductions(Numeric),             -- somme des lignes
refunded_amount(Numeric),              -- max(0, deposit - total)
balance_due(Numeric),                  -- max(0, total - deposit)  (solde à réclamer)
status('draft'|'finalized'), finalized_at, sent_at, created_at, updated_at
UNIQUE(lease_id)                       -- un décompte par bail
```

### 4.6 `DeductionLine` — une ligne de retenue
```
id, settlement_id(idx), label, amount(Numeric), item_id(nullable, rattachement à un élément dégradé), created_at
```

### 4.7 Constante — pièces/éléments par défaut
Un jeu par défaut (constante backend) pour pré-remplir un EDL vierge : pièces usuelles (Entrée,
Séjour, Cuisine, Chambre(s), Salle de bain, WC) × éléments usuels (Murs, Sol, Plafond, Fenêtres,
Porte, Électricité, Plomberie, Équipements). Le gestionnaire ajoute/retire pièces & éléments librement.

## 5. Cycle de vie

**Inventory** : `draft` (remplissage) → `finalized` (verrouillé, PDF généré) → `signed` (via
3a9dSign, Phase C ; marquable manuellement en attendant).
**DepositSettlement** : `draft` (saisie des retenues) → `finalized` (calcul figé, dépôt restitué,
email envoyé).

Parcours type : bail signé → **EDL entrée** (draft→finalized) → … location … → **EDL sortie**
(draft→finalized) → **vue comparaison** → **décompte** (lignes de retenue → finalize) → restitution
du dépôt + email de décompte de sortie → dossier clôturé.

## 6. Calcul du décompte

À la finalisation du décompte :
- `total_deductions = Σ lignes.amount`
- `refunded_amount = max(0, deposit_amount − total_deductions)`
- `balance_due = max(0, total_deductions − deposit_amount)`
- Effets : `Lease.deposit_return_amount = refunded_amount`, `Lease.deposit_returned_at = now()` ;
  émission `rental.deposit.settled` → email **décompte de sortie** (retenues détaillées, restitué,
  solde) au locataire + PDF. Si `balance_due > 0`, l'email/PDF indique le montant réclamé au-delà de
  la caution (mention recouvrement à venir — hors système).

> Distinction avec `rental.deposit.returned` (restitution simple existante) : le décompte est le
> chemin « justifié » (avec retenues) ; la route `deposit-return` simple reste pour une restitution
> intégrale sans retenue. Le décompte finalisé pose `deposit_returned_at` → les deux chemins sont
> exclusifs (garde anti-doublon).

## 7. Événements

Émis par `rental` : `rental.inventory.finalized` (optionnel, notif interne), `rental.deposit.settled`
(décompte finalisé → email locataire).
Consommés par `notification` : `rental.deposit.settled` → email décompte de sortie.

## 8. API (`rental`)

### 8.1 Back-office (`require rental`, cloisonné `agency_id`)
- EDL : `POST /backoffice/gestion-locative/leases/{id}/inventories {type}` (crée un EDL, optionnellement pré-rempli du jeu par défaut) ; `GET /…/inventories/{invId}` (détail : pièces/éléments/photos) ; `GET /…/leases/{id}/inventories` (liste entrée/sortie) ; `PATCH /…/inventories/{invId}` (notes) ; `POST /…/inventories/{invId}/finalize` (verrouille + PDF) ; `POST /…/inventories/{invId}/mark-signed` (Phase C : marquage manuel).
- Pièces/éléments/photos : `POST /…/inventories/{invId}/rooms`, `PATCH/DELETE /…/rooms/{roomId}`, `POST /…/rooms/{roomId}/items`, `PATCH/DELETE /…/items/{itemId}`, `POST /…/items/{itemId}/photos` (upload S3), `GET /…/photos/{photoId}` (download), `DELETE /…/photos/{photoId}`.
- Comparaison : `GET /…/leases/{id}/inventories/compare` (renvoie, par pièce/élément, l'état entrée vs sortie).
- PDF : `GET /…/inventories/{invId}.pdf`.
- Décompte : `GET/POST /…/leases/{id}/settlement` (crée/lit le décompte) ; `POST /…/settlements/{sId}/lines` + `DELETE /…/lines/{lineId}` ; `POST /…/settlements/{sId}/finalize` (calcul + restitution dépôt + événement) ; `GET /…/settlements/{sId}.pdf`.

### 8.2 Interne (`x-internal-token`)
- `GET /internal/settlements/{sId}.pdf` (pour la pièce jointe email, patron quittance).

## 9. Emails / PDF

- **EDL** (entrée/sortie) : PDF `reportlab` (pièces → éléments → état/commentaire ; miniatures photos si faisable, sinon liste).
- **Décompte de sortie** : email `notification` (nouveau gabarit `deposit_settlement.html`, icône `clipboard-list`/`scale`) au locataire — récap caution / total retenues / restitué / solde à réclamer — + PDF joint (patron pièces jointes déjà en place). Solde > 0 → mention explicite.

## 10. UI back-office (React, kit `components/backoffice/ui.jsx`)

Depuis le **détail du bail** (`LeaseDetail`), section **« États des lieux »** :
- Boutons « EDL d'entrée » / « EDL de sortie » (créer si absent, sinon ouvrir).
- **Éditeur d'EDL** : liste de pièces (ajout/suppression), par pièce une liste d'éléments (libellé,
  sélecteur d'état bon/moyen/mauvais, commentaire, upload/aperçu photos), notes générales,
  « Finaliser » + lien PDF.
- **Vue comparaison** entrée↔sortie (deux colonnes, dégradations mises en évidence).
- **Décompte de sortie** : lignes de retenue (libellé + montant, rattachables à un élément), calcul
  live (caution / total / restitué / solde), « Finaliser le décompte » → restitution + email.
Respecte la charte (kit, tokens, `Đh`, `react-icons/fi`, react-query, `GatedNotice` 403).

## 11. Sécurité

- Cloisonnement `agency_id` sur tout (EDL/pièces/éléments/photos/décompte) ; l'EDL d'un bail
  n'est accessible qu'à l'agence du bail. Endpoints internes à jeton.
- Photos : clés S3 serveur `inventories/{invId}/{uuid}` (pas de chemin client → pas de traversal),
  taille plafonnée (10 Mo), `nosniff`, download contrôlé (agence du bail).
- Un EDL/décompte **finalisé** est verrouillé (plus d'édition des pièces/lignes).

## 12. Phasage (plans séparés)

- **Phase A — Domaine EDL** : entités Inventory/Room/Item/Photo + jeu par défaut + endpoints
  back-office de remplissage (pièces/éléments/photos S3) + PDF EDL + UI éditeur (dans LeaseDetail).
- **Phase B — Décompte & comparaison** : `DepositSettlement`/`DeductionLine` + calcul + finalisation
  (restitution dépôt + `rental.deposit.settled` + email décompte + PDF joint) + vue comparaison
  entrée↔sortie + UI décompte.
- **Phase C — Signature 3a9dSign** : intégration réelle (invitation, statut par signataire, retour
  signé, `mark-signed` remplacé par le flux e-sign) — quand la config 3a9dSign est fournie.

Chaque phase : lint + typecheck + tests + build verts, E2E email (Phase B), un commit par changement.

## 13. Tests (avant « terminé », par phase)

- API : CRUD EDL/pièces/éléments/photos, gating + cloisonnement agence, verrouillage au finalize.
- Photos : upload S3 (clé serveur, plafond, nosniff) + download contrôlé.
- Comparaison : renvoie l'état entrée vs sortie par élément.
- Décompte : calcul `refunded_amount`/`balance_due` (dont cas `total > caution`), finalisation
  pose la restitution du dépôt (anti-doublon avec `deposit-return`), E2E email de décompte de sortie.
- PDF : EDL + décompte (montants cohérents).

## 14. Fichiers touchés (indicatif)

- `services/rental/app/models.py` (Inventory/Room/Item/Photo/DepositSettlement/DeductionLine),
  `events.py`, `main.py` (endpoints), `pdf.py` (EDL + décompte), constante pièces/éléments.
- `services/notification/app/{handlers.py,worker.py}` + gabarit `deposit_settlement.html` + icône.
- `frontend/src/services/rentalService.js` (méthodes EDL/décompte), `pages/backoffice/rental/`
  (éditeur EDL, comparaison, décompte) + `LeaseDetail.jsx` (section EDL).
- `docs/emails/catalogue-emails.md` (§3 : EDL → livré), `docs/architecture-v2-status.md`.
