# Portail partenaire — Frontend branché (Plan 3/3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Brancher les 8 écrans du portail partenaire (`frontend-m3a-l3achrane/src/surfaces/partner/`) sur l'API réelle du service `partner` (plans 1-2) : listes chargées depuis l'API, formulaires d'ajout + actions (approuver/rejeter, libérer, révoquer, tester webhook, générer clé API show-once), reporting enrichi, i18n FR+AR. Repli mock conservé (`isMocked('partners')`) pour la démo hors backend.

**Architecture:** On ajoute des fonctions service `/partner/*` dans `services/index.js` (patron axios existant + branche mock). Chaque écran (déjà dessiné, mock) charge sa liste via `useEffect` + service, ajoute un formulaire (section/inline, DS `Input/Select/Textarea/Checkbox`) et des actions. Reporting = tuiles KPI + graphiques en SVG inline (aucune dépendance carto/charts ajoutée). 403 (user non-membre) → état « accès partenaire requis ».

**Tech Stack:** React + Vite, DS m3a (core + PartnerSection), axios (`services/api.js`, base `/api/v1`), i18n (react-i18next, namespace `partner`), `node --test` (parité i18n).

## Global Constraints

- Devise affichée `Đh` (jamais MAD/Dh). Parité i18n FR/AR obligatoire (tests `src/i18n/`). Nouveaux écrans ajoutés à `MIGRATED_FILES` de `noHardcodedText.test.mjs`.
- Champs requis : astérisque rouge (skill `form-design`), pas d'annotation « (optionnel) ».
- Repli mock : en mode `isMocked('partners')` (défaut dev), les créations/actions mettent à jour l'état local (echo) sans planter ; en mode réel, elles appellent l'API.
- Sécurité UI clés API : le brut n'est affiché QU'UNE FOIS après création (champ copiable + avertissement), jamais re-listé.
- Gate m3a : `node --test src/i18n/…` (parité) + `./node_modules/.bin/eslint … --max-warnings 0` + `./node_modules/.bin/vite build`.
- Pas de secret en dur ; pas d'attribution IA.

---

## Task 1: Couche service `/partner/*`

**Files:** Modify `frontend-m3a-l3achrane/src/services/index.js` ; Modify `src/data/partnerExtras.js`/`partners.js` (données de repli si besoin).

**Interfaces (fonctions exportées, toutes avec repli `isMocked('partners')`):**
- `getPartnerMe()` `GET /partner/me`.
- Affiliés: `listAffilies()`, `createAffilie(payload)`, `updateAffilie(id, payload)`.
- Vérifs: `listVerifications()`, `createVerification(payload)`, `approveVerification(id)`, `rejectVerification(id)`.
- Réservations: `listReservations()`, `createReservation(payload)`, `releaseReservation(id)`.
- Subventions: `listGrants()`, `createGrant(payload)`, `updateGrant(id, payload)`.
- Factures: `listInvoices()`, `createInvoice(payload)`, `updateInvoice(id, payload)`.
- Clés API: `listApiKeys()`, `createApiKey(payload)` (renvoie `{...,key}`), `revokeApiKey(id)`.
- Webhooks: `listWebhooks()`, `createWebhook(payload)`, `updateWebhook(id, payload)`, `deleteWebhook(id)`, `testWebhook(id)`.
- Reporting: `getPartnerReporting()` `GET /partner/reporting`.

- [ ] **Step 1:** Ajoute les fonctions (patron des fonctions existantes : `const { data } = await api.get('/partner/…'); return data`, mocks via `isMocked('partners')` renvoyant les données `partnerExtras`). Les créations en mock renvoient le payload + un id local (ex. `crypto.randomUUID?.() ?? String(Date.now())`).
- [ ] **Step 2:** Lint + build.
Run: `cd frontend-m3a-l3achrane && ./node_modules/.bin/eslint src --ext js,jsx --max-warnings 0 && ./node_modules/.bin/vite build`
- [ ] **Step 3: Commit** `feat(m3a): couche service API du portail partenaire`.

---

## Task 2: Affiliés + Vérifications (liste API + formulaire + actions)

**Files:** Modify `surfaces/partner/Affiliates.jsx`, `surfaces/partner/Verifications.jsx`.

- [ ] **Step 1: Affiliates.jsx** : charge la liste via `listAffilies()` (`useEffect`, états loading/error) au lieu du mock direct ; ajoute un formulaire « Ajouter un affilié » (full_name\*, email\*, external_ref) → `createAffilie` → maj de la liste ; garde le style `PartnerSection`/`PartnerTable`.
- [ ] **Step 2: Verifications.jsx** : liste via `listVerifications()` ; formulaire « Nouvelle vérification » (affilié [select des affiliés], doc_type [select]) → `createVerification` ; actions par ligne **Approuver**/**Rejeter** → `approveVerification`/`rejectVerification` → maj du statut.
- [ ] **Step 3:** Libellés via `t('partner:…')` (clés ajoutées en Task 6 ; en attendant, utilise les clés — l'i18n complète est Task 6). Lint + build.
- [ ] **Step 4: Commit** `feat(m3a-partner): affiliés & vérifications branchés (liste + ajout + actions)`.

---

## Task 3: Offres réservées + Subventions + Factures

**Files:** Modify `surfaces/partner/ReservedOffers.jsx`, `Grants.jsx`, `Billing.jsx`.

- [ ] **Step 1: ReservedOffers.jsx** (pré-réservation de logements) : liste via `listReservations()` ; formulaire « Réserver un logement » (listing_id\*, affilié [optionnel], label\*, start_date, end_date) → `createReservation` ; action **Libérer** → `releaseReservation`. Ajoute un court texte explicatif du concept (« Bloquer des logements pour vos affiliés »).
- [ ] **Step 2: Grants.jsx** : liste via `listGrants()` ; formulaire « Ajouter une subvention » (program\*, affilié [optionnel], amount\* en Đh, statut) → `createGrant` ; action de changement de statut (PATCH → PAID/CANCELLED) via `updateGrant`.
- [ ] **Step 3: Billing.jsx** : liste via `listInvoices()` ; formulaire « Ajouter une facture » (number\*, period\* AAAA-MM, amount\* Đh, statut) → `createInvoice` ; action de statut (DRAFT→SENT→PAID) via `updateInvoice`. Montants en `Đh`.
- [ ] **Step 4:** Lint + build. **Commit** `feat(m3a-partner): réservations, subventions, factures branchées (liste + ajout + actions)`.

---

## Task 4: Clés API + Webhooks (UI sécurité)

**Files:** Modify `surfaces/partner/ApiWebhooks.jsx`.

- [ ] **Step 1: Clés API** : liste via `listApiKeys()` (affiche `prefix••••`, label, dates, révoquée ou non) ; bouton « Générer une clé » (label\*) → `createApiKey` → affiche le **brut UNE SEULE FOIS** dans un encart copiable avec avertissement « copiez-la maintenant, elle ne sera plus affichée » ; action **Révoquer** → `revokeApiKey`. Le brut disparaît dès qu'on ferme l'encart / recharge.
- [ ] **Step 2: Webhooks** : liste via `listWebhooks()` (url, events, actif) ; formulaire « Ajouter un webhook » (url\* [https], events [checkboxes des types], actif) → `createWebhook` ; actions **Tester** → `testWebhook` (affiche le résultat), **Activer/Désactiver** → `updateWebhook`, **Supprimer** → `deleteWebhook`. Le `secret` renvoyé à la création s'affiche une fois (même encart show-once).
- [ ] **Step 3:** Gestion d'erreur : une URL rejetée par le backend (422 SSRF) affiche le message d'erreur. Lint + build.
- [ ] **Step 4: Commit** `feat(m3a-partner): écran clés API (show-once) + webhooks (CRUD + test)`.

---

## Task 5: Reporting enrichi + accueil + 403

**Files:** Modify `surfaces/partner/Reporting.jsx`, `PartnerPortal.jsx` ; éventuellement un helper `surfaces/partner/charts.jsx`.

- [ ] **Step 1: Reporting.jsx** : charge `getPartnerReporting()` ; affiche des **tuiles KPI** (affiliés par statut, subventions total Đh, factures encours) + un **entonnoir de vérifications** (pending/approved/rejected + taux) + un **graphique en barres SVG inline** (ex. réservations actives/libérées, ou subventions par statut). Pas de dépendance externe ; suis les principes dataviz (échelle claire, libellés, couleurs cohérentes du thème, accessible). Réutilise `PartnerKpi`/`PartnerSection`.
- [ ] **Step 2: PartnerPortal.jsx** (accueil) : branche ses chiffres d'en-tête sur `getPartnerReporting()`/`getPartnerMe()` au lieu du mock statique.
- [ ] **Step 3: État 403 / non-membre** : si un appel `/partner/*` renvoie 403 (user non membre d'un partenaire), afficher dans le layout partenaire un état « Accès partenaire requis » plutôt que des erreurs. (En démo mock, non déclenché.)
- [ ] **Step 4:** Lint + build. **Commit** `feat(m3a-partner): reporting enrichi + accueil branché + état accès requis`.

---

## Task 6: i18n FR + AR (portail partenaire)

**Files:** Modify `src/locales/fr/partner.json`, `src/locales/ar/partner.json` (ou le namespace utilisé par les écrans partner — VÉRIFIER) ; ajouter les écrans modifiés à `src/i18n/noHardcodedText.test.mjs` `MIGRATED_FILES`.

- [ ] **Step 1:** Remplace toutes les chaînes en dur introduites (Tasks 2-5) par `t('partner:…')` et ajoute les clés en FR ET AR (parité). Couvre : titres, libellés de champs, options d'enum affichées (statuts, doc_types, event types), boutons/actions, messages (succès/erreur/vide), avertissement clé API show-once, état « accès requis », libellés reporting.
- [ ] **Step 2:** Ajoute les écrans partner modifiés à `MIGRATED_FILES` (noHardcodedText).
- [ ] **Step 3: Gate final**
Run: `cd frontend-m3a-l3achrane && node --test src/i18n/keyParity.test.mjs src/i18n/noHardcodedText.test.mjs && ./node_modules/.bin/eslint src --ext js,jsx --max-warnings 0 && ./node_modules/.bin/vite build`
Expected: parité OK, lint 0/0, build OK.
- [ ] **Step 4: Commit** `i18n(m3a-partner): libellés du portail partenaire (FR/AR)`.

---

## Self-review coverage (spec → tâches)

- Couche service `/partner/*` → T1. Affiliés/vérifications → T2. Réservations/subventions/factures → T3. Clés API (show-once) + webhooks (CRUD + test) → T4. Reporting enrichi + accueil + 403 → T5. i18n FR/AR → T6.
- Valeurs d'enum techniques envoyées à l'API jamais traduites (seuls les libellés affichés). Devise `Đh`. Repli mock conservé.
