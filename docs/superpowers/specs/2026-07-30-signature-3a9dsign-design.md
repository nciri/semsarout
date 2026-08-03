# Spec — Signature électronique 3a9dSign (EDL + décompte + bail + mandat) — service `rental`

> Statut : conception validée (brainstorming 2026-07-30). Phase C du chantier état des lieux, **élargie
> par décision utilisateur à TOUS les documents locatifs** (EDL, décompte de caution, bail, mandat).
> Un seul spec/plan. Construit une **brique de signature réutilisable** appliquée aux 4 types de document.
> Contrat API 3a9dSign découvert et prouvé en live — détails dans
> `scratchpad/3a9dsign-contract.md`.

## 1. Contexte & problème

La gestion locative produit des PDF (EDL entrée/sortie — Phase A ; décompte de caution — Phase B ;
et à créer : bail, mandat) mais la **signature électronique** est un stub : l'EDL a un `mark-signed`
manuel (Phase A), le bail/mandat portent un `signed_at` posé à la main. Le propriétaire du projet
dispose de sa propre plateforme e-sign **3a9dSign** (API live `http://localhost:18000`, base
`/api/v1`). Objectif : brancher une **vraie signature** (locataire + gestionnaire, séquentielle) sur
les documents locatifs, récupérer le **PDF signé**, et marquer le document `signé`.

## 2. Décisions validées (brainstorming)

1. **Périmètre** : les **4 documents** — EDL (entrée/sortie), **décompte de caution**, **bail**,
   **mandat**. Bail et mandat n'ayant pas de générateur PDF, on les crée ici.
2. **Signataires** : **locataire + gestionnaire**, routage **séquentiel** (`routing_mode:"sequential"`).
   (Le bailleur pourra être ajouté plus tard sans changer la brique.)
3. **Complétion** : **polling** de `GET /api/v1/envelopes/{id}` via l'**ordonnanceur existant**.
   Le webhook `envelope.completed` (HMAC-SHA256) n'est pas retenu comme mécanisme principal :
   l'enregistrement d'un endpoint webhook exige un **JWT de dashboard humain** (impossible avec la
   clé API machine). Une route webhook pourra être ajoutée plus tard si l'utilisateur enregistre
   l'endpoint à la main.
4. **Brique réutilisable** : une entité `SignatureRequest` **générique** (`doc_type` ∈
   inventory|settlement|lease|mandate) découple la machinerie de signature de chaque document.
5. **Secrets** : `SIGN_API_URL` + `SIGN_API_KEY` en **variables d'environnement** (`services/rental/.env`
   gitignoré + `.env.example` documente les noms). **Jamais** en dur ni committées.

## 3. Contrat 3a9dSign (résumé prouvé en live)

- **Auth** : `X-API-Key: <ak_...>` en en-tête direct (pas d'échange OAuth).
- **Flux d'une signature** (server-to-server) :
  1. `POST /api/v1/envelopes` `{title, routing_mode:"sequential", external_reference, metadata}` → `{id, status:"draft", sandbox}`.
  2. `POST /api/v1/envelopes/{id}/documents` — **multipart** `file=<pdf>` → `{document_id, page_count, page_sizes}`.
  3. `POST /api/v1/envelopes/{id}/recipients` — **un appel par destinataire** `{email, name, role:"signer", routing_order, auth_method}` → `{recipient_id, ...}` (+ éventuel token/URL de signature).
  4. `POST /api/v1/envelopes/{id}/fields` — placer un champ de signature par destinataire `{document_id, recipient_id, page, x, y, width, height}` (**requis avant `send`**).
  5. `POST /api/v1/envelopes/{id}/send` `{confirm:true}` → `status:"sent"`. En **sandbox, aucun email réel** n'est envoyé (StubNotifier) → on surface les liens de signature dans notre UI.
  6. `GET /api/v1/envelopes/{id}` → `status` : `draft→sent→in_progress→completed|declined|expired|voided`.
  7. `GET /api/v1/envelopes/{id}/documents/{document_id}/download` → **URL présignée** `{url, expires_in}` (pas les octets bruts) ; sert le PDF **signé** une fois `completed`.
- Lien de signature (frontend 3a9dSign) : `{web_base_url}/{locale}/sign/{token}` ; `Idempotency-Key` accepté à la création d'enveloppe ; en-tête `API-Version` sur chaque réponse.

## 4. Architecture

- Tout est ajouté au service **`rental`** (schéma/rôle `rental`, port 8518). Nouveau module client
  `signing.py`, entité `SignatureRequest`, endpoints back-office « envoyer en signature » + statut,
  générateurs PDF bail/mandat, et un endpoint interne de **polling** appelé par l'ordonnanceur.
- Réutilise : `pdf.py` (reportlab), `storage` (S3 MinIO, PDF signés), `enqueue` (événements →
  notification pour les emails « signé »), gating `_gate` + cloisonnement `agency_id`, endpoints
  internes à `x-internal-token`.

## 5. Module client `signing.py` (rental)

Un client httpx minimal vers 3a9dSign, configuré par `SIGN_API_URL` (défaut `http://localhost:18000/api/v1`)
et `SIGN_API_KEY` (env). En-tête `X-API-Key`. Fonctions :
`create_envelope(title, external_reference) → env_id` ; `add_document(env_id, filename, pdf_bytes) → document_id`
(multipart) ; `add_recipient(env_id, email, name, routing_order) → recipient_id` ; `place_signature_field(env_id, document_id, recipient_id, order) → None`
(placement déterministe : dernière page, coordonnées fixes décalées par `order`) ; `send(env_id) → None` ;
`get_status(env_id) → str` ; `download_url(env_id, document_id) → url` ; helper `fetch_signed_pdf(env_id, document_id) → bytes`
(résout l'URL présignée puis GET les octets). Si `SIGN_API_KEY` absent → `signing_enabled()` = False
(les endpoints renvoient 400 « signature non configurée » proprement, pas de crash).

## 6. Entité `SignatureRequest` (schéma `rental`)

```
id, doc_type('inventory'|'settlement'|'lease'|'mandate'), doc_ref_id(id local), agency_id(idx),
envelope_id(str, UUID 3a9dSign), document_id(str), status('pending'|'sent'|'in_progress'|'completed'|'declined'|'voided'|'expired'),
signed_pdf_key(S3, après complétion), signers(JSON: [{name,email,order,signing_url?}]),
error(str, nullable), created_at, updated_at
UNIQUE(doc_type, doc_ref_id)   -- une demande de signature par document
```

## 7. Cycle de vie & polling

1. **Envoi** (back-office) : le document doit être « finalisé » (EDL/décompte) ou exister (bail/mandat).
   L'endpoint « request-signature » : résout les emails (locataire via crm, gestionnaire via
   l'identité de l'agent), génère/récupère le PDF, crée l'enveloppe (create→document→recipients×2→
   fields×2→send), stocke `SignatureRequest{status:"sent", envelope_id, document_id, signers}`.
2. **Polling** : l'ordonnanceur appelle périodiquement `POST /internal/signatures/poll`
   (`x-internal-token`). Pour chaque `SignatureRequest` en `sent`/`in_progress` : `get_status`. Si
   `completed` → `fetch_signed_pdf` → stocker en S3 (`signed_pdf_key`) → marquer le document local
   `signé` (voir §8) → `status:"completed"` → `enqueue` l'événement « signé » adéquat. Si
   `declined`/`voided`/`expired` → répercuter le statut (pas d'email).
3. **Consultation** (back-office) : statut de la `SignatureRequest` + liens de signature (utile en
   sandbox où aucun email n'est envoyé) + téléchargement du PDF signé quand `completed`.

## 8. Effets « signé » par document

- **inventory** : `Inventory.status='signed'`, `signed_at`, `pdf_key`←PDF signé (ou `signed_pdf_key`).
  Émet `rental.inventory.signed`. Remplace le `mark-signed` manuel (conservé comme repli si signature
  non configurée).
- **settlement** : ajouter `DepositSettlement.signed_at` + `signed_pdf_key`. Émet `rental.settlement.signed`.
- **lease** : `Lease.signed_at` (existe) + `signed_pdf_key`. Émet `rental.lease.signed` (événement
  existant → email bail signé). Le PDF de bail est **généré ici** (§9).
- **mandate** : `Mandate.signed_at` (existe) + `signed_pdf_key`. Émet `rental.mandate.signed`
  (événement existant → email mandat signé). PDF **généré ici** (§9).

> Les événements `rental.lease.signed`/`rental.mandate.signed` existent déjà (emails « bail/mandat
> signé »). Nouveaux : `rental.inventory.signed`, `rental.settlement.signed` → emails à ajouter
> (notification), au locataire, avec le PDF signé joint (patron pièce jointe existant).

## 9. Générateurs PDF bail & mandat (nouveaux)

- `render_lease_pdf(lease, mandate, tenant_name, landlord_name, property_title)` : parties (bailleur/
  locataire), bien, loyer/charges/dépôt, jour d'échéance, dates début/fin, référence. reportlab
  (patron `render_receipt_pdf`).
- `render_mandate_pdf(mandate, landlord_name, property_title)` : parties, bien, type de mandat,
  `fee_percent`, dates, référence.
Ces PDF servent de document à signer et sont stockés/servis comme les autres (endpoints `.pdf`
back-office + rendu à la volée).

## 10. API (`rental`)

### 10.1 Back-office (`require rental`, cloisonné `agency_id`)
- `POST /backoffice/gestion-locative/{doc_type}s/{id}/request-signature` — crée l'enveloppe & envoie
  (doc_type ∈ inventories|settlements|leases|mandates). Refuse si non finalisé (EDL/décompte) ou si
  signature déjà demandée (409/400) ou non configurée (400).
- `GET /backoffice/gestion-locative/signatures/{doc_type}/{id}` — statut de la `SignatureRequest`
  (+ signers/liens + `has_signed_pdf`).
- `GET /backoffice/gestion-locative/signatures/{sig_id}/signed.pdf` — télécharge le PDF signé (404 si
  pas encore `completed`).
- PDF bail/mandat : `GET /…/leases/{id}.pdf`, `GET /…/mandates/{id}.pdf` (à la volée).

### 10.2 Interne (`x-internal-token`)
- `POST /internal/signatures/poll` — traite les demandes en cours (appelé par l'ordonnanceur).

## 11. Événements & emails (notification)

- Nouveaux événements rental : `rental.inventory.signed`, `rental.settlement.signed`.
- notification : handlers + gabarits `inventory_signed.html`, `settlement_signed.html` (au locataire,
  PDF signé joint via endpoint interne `signed.pdf` à jeton — nouveau `/internal/signatures/{id}/signed.pdf`).
  `rental.lease.signed`/`rental.mandate.signed` : emails existants (contenu inchangé), désormais
  déclenchés par la complétion e-sign.

## 12. Sécurité

- `SIGN_API_KEY` en env, jamais logguée. Polling & webhook (si ajouté) à `x-internal-token`.
- Cloisonnement `agency_id` sur request-signature/statut/PDF signé (la `SignatureRequest` porte
  `agency_id`). Un document d'une autre agence → 404.
- `external_reference` de l'enveloppe = `rental:{doc_type}:{id}:{agency_id}` (traçabilité, pas de PII).
- PDF signé stocké en clé serveur S3 `signatures/{sig_id}/signed.pdf`.
- Idempotence : `UNIQUE(doc_type, doc_ref_id)` empêche les enveloppes en double ; `Idempotency-Key`
  = la clé serveur sur la création d'enveloppe.

## 13. Configuration

`services/rental/.env` (+ `.env.example`) : `SIGN_API_URL=http://localhost:18000/api/v1`,
`SIGN_API_KEY=<clé>`. L'ordonnanceur (`scripts/dev-mesh-up.sh`) appelle `/internal/signatures/poll`
périodiquement (ajout à la boucle scheduler existante). `SIGN_API_KEY` non committée.

## 14. UI back-office (React, kit)

- **InventoryEditor** / **SettlementEditor** : quand finalisé, bouton « Envoyer en signature »
  (remplace « mark-signed » sur l'EDL) → affiche le statut (en attente/envoyé/signé), les liens de
  signature (sandbox), et « Télécharger le PDF signé » quand `completed`.
- **Bail / Mandat** (LeaseDetail / MandateDetail) : bouton « PDF » (nouveau) + « Envoyer en
  signature » + statut + PDF signé.
- Composant réutilisable `SignaturePanel({docType, id})` (react-query : statut + actions) partagé par
  les 4 écrans. Charte : kit + tokens, `react-icons/fi`, `Đh`, 403 → `GatedNotice`.

## 15. Phasage (tâches du plan)

Un seul plan, exécuté en continu, en tâches logiques : (A) config + `signing.py` + `SignatureRequest`
+ polling interne ; (B) EDL request-signature + effet signé + événement + email ; (C) décompte
request-signature + effet + email ; (D) PDF bail + mandat + leurs request-signature + effets
(emails existants) ; (E) UI `SignaturePanel` branché sur les 4 écrans + PDF bail/mandat ; (F) docs.

## 16. Tests (avant « terminé »)

- `signing.py` : création enveloppe→document→recipients→fields→send contre l'API **sandbox** live
  (clé de test) ; `get_status` ; `fetch_signed_pdf`. Gating « non configuré ».
- request-signature : gating + cloisonnement agence ; refus si non finalisé / déjà demandé.
- polling : `completed` → PDF signé stocké + document marqué signé + événement émis ; statuts
  d'échec répercutés.
- E2E (sandbox) : envoyer un EDL en signature → signer via `/signing/{token}` (les 2 destinataires)
  → polling → EDL `signed` + PDF signé récupéré + email `rental.inventory.signed`.
- PDF bail/mandat : rendus cohérents.

## 17. Fichiers touchés (indicatif)

- `services/rental/app/{signing.py(new),models.py,events.py,main.py,pdf.py,scheduler.py}`,
  `services/rental/.env.example`, `scripts/dev-mesh-up.sh` (poll scheduler).
- `services/notification/app/{handlers.py,worker.py}` + gabarits `inventory_signed.html`,
  `settlement_signed.html`.
- `frontend/src/services/rentalService.js`, `components/backoffice/SignaturePanel.jsx(new)`,
  `pages/backoffice/rental/{InventoryEditor,SettlementEditor,LeaseDetail,MandateDetail}.jsx`,
  `App.jsx`.
- `docs/emails/catalogue-emails.md`, `docs/architecture-v2-status.md`, design spec §12.
