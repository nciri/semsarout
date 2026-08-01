# Spec de conception — P1 : Interception de la demande + moteur de commission

> **Statut :** conception validée (brainstorm 2026-07-31). Sous-projet **P1** du modèle de
> monétisation (cf. `docs/strategy/2026-07-30-modele-monetisation.md`, §10). Cœur du modèle
> économique : la plateforme intercepte la demande (candidatures location / demandes d'achat vente)
> et facture une commission forfaitaire à la conclusion, dès la 2e affaire du compte.
>
> Prochaine étape : plan d'implémentation (skill `writing-plans`).

## 1. Objectif & périmètre

Construire le **modèle complet** (location **et** vente) de l'« agence en ligne » du particulier :

1. **Interception de la demande** — toute la mise en relation demandeur ↔ propriétaire particulier
   passe par une **messagerie in-app médiée** ; le contact (téléphone/email) n'est **jamais** révélé
   en clair avant conclusion.
2. **Parcours vente grand-public** — création d'un parcours « demande d'achat → offre → acceptation →
   **compromis e-signé** » (inexistant aujourd'hui), symétrique aux candidatures location existantes.
3. **Moteur de commission** — compteur d'**affaires conclues par compte** (location + vente
   confondus), règle « **1re affaire offerte, commission dès la 2e** », **forfait configurable**
   (défaut **4 999 MAD**), **facturation gatée à la conclusion**.

**Périmètre d'application** : annonces de **particuliers** et de **promoteurs vendant en direct**
(sans agence courtière intermédiaire). Les annonces d'**agence** conservent leur comportement actuel
(contact révélé, lead CRM, **pas** de commission — elles paient l'abonnement).

**Hors périmètre P1** (renvoyés aux sous-projets suivants) : palier Promoteur dédié et `max_programs`
(P3), boosts à la carte (P4), réglages admin avancés (P5), détection fine d'usage pro / anti-fuite
active (P6). P1 pose seulement les *hooks* pour P6.

## 2. Décisions de cadrage (verrouillées au brainstorm)

| Sujet | Décision |
|---|---|
| Périmètre | Location **et** vente en un seul bloc |
| Médiation du contact | **Messagerie in-app bidirectionnelle** ; contact jamais révélé (annonces particulier/promoteur-direct) |
| Encaissement | **Blocage à la conclusion** — lien de paiement **CMI** (pas de Stripe) |
| Jalon de conclusion — location | `rental.lease.signed` (existant) |
| Jalon de conclusion — vente | **Compromis e-signé** (3a9dSign, nouveau `doc_type = "compromis"`) |
| Qui paie | Particulier **+ promoteur en direct** (pas d'agence intermédiaire) |
| Compteur | **1re affaire offerte, par compte**, location + vente confondus ; grandfathering en prod |
| Placement du moteur | **Nouveau service `services/commission`** (approche A) |
| Gate | **Synchrone** (appel HTTP interne avant la signature) |
| Défaillance du gate | **Fail-closed** (on ne finalise pas la signature si le moteur est injoignable) |
| Client e-sign | Extrait en **lib partagée `libs/semsar_signing`** (rental + selling) |
| Gabarit compromis | **Complet, adapté au marché marocain** (pas minimal) ; validation juriste requise |
| Conclusion bail particulier | **Flux bail particulier dédié** : `Lease` gagne `owner_id` ; parcours « Mon espace » pour conclure + e-signer (réutilise `Lease` + `SignatureRequest` + polling) ; `rental.lease.signed` porte l'`account_id` du propriétaire |

> **Note (trou technique levé au moment du plan)** : aujourd'hui un bail appartient à une **agence**
> (`Lease.agency_id`, flux back-office gaté `rental` : `sign_lease`, e-sign, polling). Il n'existait
> **aucun** chemin de conclusion de bail côté **particulier**. Or c'est le particulier (sans agence)
> qui doit payer la commission location. **Décision** : on construit un **flux bail particulier
> dédié** (cf. tableau ci-dessus, traité au Plan 4) — sinon « candidature → `rental.lease.signed` »
> ne couvrirait jamais le cas particulier.

## 3. Architecture d'ensemble

Microservices FastAPI, schéma + rôle Postgres dédiés (ADR-0002), pattern **outbox → relay →
RabbitMQ** (exchange `semsar.events`), consumers idempotents, projections reconstructibles. BFF
réexpose `/api/v1` à l'identique.

### 3.1 Services

| Service | Nature | Changement |
|---|---|---|
| `services/commission` | **nouveau** | Compteur d'affaires par compte, règle « 1re offerte », forfait configurable, décision de gate, émission de la demande de facturation |
| `services/selling` | **nouveau** | Parcours vente grand-public : demande d'achat → offre → acceptation → compromis e-signé |
| `libs/semsar_signing` | **nouveau** | Client 3a9dSign partagé (extrait de `rental/app/signing.py`) |
| `services/messaging` | évolution | Modèle **Conversation/Message bidirectionnel** ; amorçage de fils ; contact masqué |
| `services/rental` | évolution | Appel de **gate** avant signature du bail ; masquage contact candidat ; dépollution des events |
| `services/listing` | évolution | `reveal-phone` **403** sur annonces particulier ; `contact` → messagerie médiée |
| `services/billing` | évolution | `Invoice.invoice_type = commission` déclenché par event `commission.due` |
| `services/payment` | réutilisé | `payment_type = commission` ; lien CMI ; `payment.completed` débloque |
| `services/identity` | réutilisé | Fournit le segment (particulier / promoteur-direct / agence) |
| `services/notification` | réutilisé | Emails « nouveau message » (sans divulguer le contact) |

### 3.2 Flux nominal — location, 2e affaire

```
Candidat postule ──► rental crée candidature (TenantApplication)
       └─► messaging ouvre un fil médié (contact masqué)
Propriétaire accepte, prépare le bail ──► rental lance la e-signature
       └─► rental appelle GET commission/gate(account_id=owner, deal_type=rental)
             ├─ 1re affaire du compte ? ──► OPEN (offerte) ► signature autorisée
             └─ 2e+ ? ──► commission émet commission.due
                   ├─► billing crée Invoice(commission, 4999 MAD, unpaid)
                   ├─► payment génère lien CMI ; le front l'affiche dans le flux signature
                   └─ gate = BLOCKED tant que non payé
Paiement CMI ──► payment.completed ──► commission marque la Conclusion payée ──► gate = OPEN
       └─► rental finalise ► rental.lease.signed ──► commission incrémente le compteur
```

Côté **vente** : identique en remplaçant le bail par le **compromis e-signé** et l'event de conclusion
par `sale.compromis.signed`.

### 3.3 Le gate (synchrone, fail-closed)

`rental`/`selling` interrogent `commission` en HTTP **juste avant** de lancer la signature.
Contrat : `GET /internal/commission/gate?account_id=&deal_type=&source_ref=` →
`{ state: OPEN | BLOCKED | NOT_APPLICABLE, invoice_ref?, pay_url? }`.

- **OPEN** : signature autorisée (1re affaire offerte, ou commission déjà réglée).
- **BLOCKED** : commission due et non réglée ; `pay_url` = lien CMI à afficher.
- **NOT_APPLICABLE** : compte exonéré (agence courtière).
- **Injoignable / timeout** : traité **BLOCKED** côté appelant (**fail-closed**) — on ne finalise pas.

Le gate est **idempotent** : appelé plusieurs fois avant signature, il ne crée qu'**une** facture par
conclusion.

## 4. Interception & messagerie médiée (`services/messaging`)

### 4.1 Modèle de données

Remplace le `BuyerMessage` unidirectionnel actuel par un fil bidirectionnel.

- **`Conversation`** : `id`, `property_id`, `owner_party`, `requester_party`,
  `context_type` (`rental_application | sale_inquiry`), `context_ref_id`,
  `status` (`open | closed | archived`), `created_at`. Unicité
  `(property_id, requester_party, context_type)`.
- **`Message`** : `id`, `conversation_id`, `sender_party`, `body`, `created_at`, `read_at`.
  **Aucun champ de contact** (ni téléphone ni email) : le contenu transite, jamais les coordonnées.
- Les `*_party` sont des **identifiants opaques d'utilisateur** (uid identity), jamais l'email/tél.

**Migration** : `BuyerMessage` legacy migré **intégralement** vers `Conversation` + `Message` (script
idempotent, pas de double écriture).

### 4.2 Masquage du contact — changements concrets

1. `listing` : `POST /properties/{id}/reveal-phone` (`listing/app/main.py:652`) → **403** (ou CTA
   « Contacter via la messagerie ») pour annonces **particulier / promoteur-direct**. **Inchangé**
   pour annonces d'agence.
2. `listing` : `POST /properties/{id}/contact` (`listing/app/main.py:637`) sur annonce particulier →
   **n'émet plus** `listing.contacted` avec contact en clair ; ouvre/appond une `Conversation` médiée.
3. `rental` : `_application_dict` (`rental/app/main.py:830`) **ne renvoie plus**
   `applicant_email`/`applicant_phone` au propriétaire particulier ; le payload de
   `rental.application.received` (`rental/app/events.py`) est **dépollué** des coordonnées (retire
   `applicant_email`/`applicant_name`). Les coordonnées **restent stockées en base** rental (dossier /
   bail post-conclusion) mais **ne sont pas exposées** tant que l'affaire n'est pas conclue.

### 4.3 Amorçage des fils

- Location : sur `rental.application.received`, un worker `messaging` ouvre une `Conversation`
  `rental_application`.
- Vente : sur `sale.inquiry.created` (service `selling`), un worker ouvre une `Conversation`
  `sale_inquiry`.

### 4.4 Frontière de révélation du contact

Le contact réel n'est **jamais** exposé via l'API tant que la commission de conclusion n'est pas
réglée. Après conclusion (bail / compromis signé + commission OK), le dossier légitime (bail,
quittances, compromis) porte naturellement les coordonnées pour l'exécution du contrat.

## 5. Parcours vente grand-public (`services/selling`)

Domaine net-neuf. `buyer` reste cloisonné (favoris/recherches/estimations) ; `transactions` reste le
pipeline **agence**. La demande d'achat médiée entre particuliers est un domaine propre, symétrique à
`rental` pour la location.

### 5.1 Modèle de données

- **`PurchaseInquiry`** : `id`, `property_id`, `seller_party`, `buyer_party`,
  `status` (`open | offer_pending | accepted | compromis_pending | concluded | withdrawn | rejected`),
  `created_at`. Amorce la `Conversation` médiée.
- **`Offer`** : `id`, `inquiry_id`, `amount`, `currency` (MAD),
  `status` (`pending | accepted | rejected | countered`), `created_at`, `decided_at`. Distinct de
  l'`Offer` interne CRM de `transactions`.
- **`Compromis`** : `id`, `inquiry_id`, `accepted_offer_id`, `status` (`draft | sent | signed | voided`),
  `signed_at`, `signed_pdf_key`. S'appuie sur une `SignatureRequest` 3a9dSign avec nouveau
  `doc_type = "compromis"`.

### 5.2 Flux

```
Acheteur ─► POST /vente/purchase-inquiries        ─► emit sale.inquiry.created ─► messaging ouvre le fil
Acheteur ─► POST .../offers (montant)             ─► emit sale.offer.made
Vendeur  ─► POST .../offers/{id}/accept           ─► status accepted, emit sale.offer.accepted
Vendeur  ─► POST .../compromis (préparer signature)
      └─► selling appelle GET commission/gate(seller_party, deal_type=sale)
            ├─ 1re affaire ? OPEN ► e-signature lancée (3a9dSign)
            └─ 2e+ ? BLOCKED ► Invoice commission + lien CMI (§7)
Signatures complètes ─► sale.compromis.signed     ─► commission incrémente le compteur
```

### 5.3 Événements émis

`sale.inquiry.created`, `sale.offer.made`, `sale.offer.accepted`, **`sale.compromis.signed`**
(= l'event de conclusion vente qui manquait au domaine).

### 5.4 Client e-sign partagé

`rental/app/signing.py` est extrait en **`libs/semsar_signing`** (enveloppes / destinataires / champs
/ téléchargement PDF signé ; auth `X-API-Key`, `SIGN_API_URL` / `SIGN_API_KEY`) et réutilisé par
`rental` et `selling`. Le worker de **polling de complétion** et la production de PDF signé suivent le
pattern rental existant.

### 5.5 Gabarit de compromis (complet, marché marocain)

Composant juridique dédié. Le gabarit généré (comme le bail/mandat) doit porter **au minimum** :

- **Parties** : vendeur / acheteur, CIN, adresse, capacité.
- **Désignation du bien** : titre foncier / réquisition (**ANCFCC — Conservation Foncière**),
  consistance, superficie, situation, **origine de propriété**.
- **Prix & modalités** : prix, arrhes / acompte, échéancier de paiement.
- **Conditions suspensives** : obtention de prêt, mainlevée d'hypothèque, droit de préemption,
  quitus fiscal / certificat de non-imposition.
- **Situation hypothécaire** : certificat de propriété récent (Conservation Foncière).
- **Réitération** : délai de passage par **acte authentique** (**notaire** ou **adoul**).
- **Frais & fiscalité** : répartition des frais d'enregistrement / conservation foncière, **TPI**
  (taxe sur profit immobilier — vendeur), droits d'enregistrement.
- **Clause pénale / dédit**, élection de domicile, droit applicable, juridiction.

> ⚠️ **Dépendance / risque** : ce gabarit doit être **validé par un juriste marocain** avant mise en
> production (implication possible du service `legal`). Une **passe de recherche dédiée** (skill
> `deep-research`) sera menée en amont de l'implémentation pour ancrer le gabarit sur les normes
> réelles (droit immobilier marocain, pratiques ANCFCC / adoul / notariat).

## 6. Moteur de commission (`services/commission`)

Seul propriétaire du compteur et des règles.

### 6.1 Modèle de données

- **`DealCounter`** : `account_id`, `concluded_count`, `first_deal_free_used` (bool), `updated_at`.
  **Un compteur par compte**, location + vente confondus. Grandfathering : comptes existants démarrent
  à `concluded_count = 0` à la mise en production (aucun blocage rétroactif).
- **`Conclusion`** : `id`, `account_id`, `deal_type` (`rental | sale`), `source_event`, `source_ref`
  (bail / compromis id), `billable` (bool), `commission_amount`, `commission_id` (FK facturation),
  `concluded_at`. **Idempotent sur `source_event`** (un même `rental.lease.signed` ne compte qu'une
  fois).
- **`CommissionRule`** : config admin — `deal_type`, `flat_amount` (défaut 4999 MAD), `currency`,
  `active_from`. Versionné dans le temps ; la conclusion **fige** le montant applicable à sa date.

### 6.2 Règle de facturabilité (gate)

```
gate(account_id, deal_type):
   si account est une AGENCE courtière        ─► NOT_APPLICABLE
   si first_deal_free_used == false           ─► OPEN  (cette conclusion sera la 1re offerte)
   sinon  (commission requise) :
        si la Conclusion en cours est payée    ─► OPEN
        sinon                                   ─► BLOCKED (+ déclenche la facturation si non émise)
```

**Segmentation « qui paie »** : lue via identity. Heuristique P1 pour « promoteur en direct » →
commission due **dès qu'aucune agence courtière n'intermédie l'affaire** (le propriétaire agit en
principal), quel que soit le type de compte. À affiner en P3 (palier Promoteur).

### 6.3 Endpoints

- `GET /internal/commission/gate?account_id=&deal_type=&source_ref=` → décision de gate (appel
  synchrone rental/selling).
- `GET /backoffice/commission/counters/{account_id}` (back-office / support).
- CRUD minimal des `CommissionRule` (montant par type) — surface P1, enrichie en P5.

### 6.4 Consommation d'événements (worker)

- `rental.lease.signed` / `sale.compromis.signed` → crée/valide la `Conclusion`, incrémente
  `DealCounter`, marque `first_deal_free_used = true` si c'était la 1re.
- `payment.completed` (facture de type commission) → marque la `Conclusion.commission` payée
  (débloque le gate au prochain appel).

### 6.5 Événements émis

`commission.due` (→ billing crée l'Invoice), `commission.settled`, `commission.waived` (1re offerte).

## 7. Encaissement & blocage (billing + payment CMI)

Réutilise l'existant, **zéro Stripe**.

- **`billing`** : l'`Invoice` (`billing/app/models.py:66`) gagne un discriminant
  `invoice_type` (`subscription | commission`). Sur `commission.due`, un worker crée
  `Invoice(type=commission, amount=<forfait figé>, currency=MAD, status=unpaid, ref)` liée à
  l'`account_id` et à la `Conclusion` ; émet `billing.invoice.created` (existant). Le dunning modélisé
  (`reminder_count`) s'applique.
- **`payment`** : `POST /payments/create-intent` avec `payment_type = commission` (aujourd'hui
  `service | subscription`, `payment/app/models.py:15`) ; montant issu de la facture (pas de
  `SERVICE_PRICES`) ; renvoie le `gateway_url` CMI. Webhook confirmé → `payment.completed` (existant)
  portant la ref de facture commission.

**Boucle de déblocage :**

```
selling/rental appelle gate ──► BLOCKED + pay_url
        front affiche le lien CMI (dans le flux signature)
paiement ──► payment.completed ──► billing marque Invoice paid
        └─► commission worker marque Conclusion.commission = payée
prochain appel gate ──► OPEN ──► signature 3a9dSign lancée ──► conclusion
```

**Séquençage** : la facture est déclenchée par `commission` (au 1er gate BLOCKED d'une conclusion),
**pas** par rental/selling (qui ne font que lire le gate et afficher `pay_url`). Le compteur n'est
incrémenté qu'à l'event de **conclusion réelle** (`*.signed`), pas au paiement : payer **débloque** la
signature, la **signature** acte l'affaire et incrémente. **Ordre imposé : paiement d'abord, signature
ensuite** (cohérent avec « blocage à la conclusion »).

## 8. Gestion d'erreurs & anti-contournement

| Cas | Traitement |
|---|---|
| **Payé mais jamais signé** | La commission est un **crédit rattaché à la conclusion en cours** : signature ultérieure → consommé ; abandon → **avoir réutilisable** à la prochaine conclusion du même compte (pas de remboursement auto ; évite le jeu payer/annuler). Fenêtre d'expiration configurable. |
| **Signature refusée / annulée** (`declined/voided`) après paiement | Conclusion non actée, compteur **non** incrémenté ; paiement en avoir (idem). |
| **Gate injoignable** au moment de signer | **Fail-closed** : signature non finalisée (« vérification de facturation indisponible, réessayez »). Timeout court + retry. |
| **Double event de conclusion** (rejeu) | Idempotence sur `source_event` : `Conclusion` unique, compteur +1 une seule fois. |
| **Paiement en double** | Idempotence webhook (`payment` : HMAC + `ProcessedMessage`) ; facture `paid` une fois. |
| **Remboursement** (`payment.refunded`) | Avoir/facture repasse en dû ; conclusion déjà actée → compte marqué débiteur (relance), sans « dé-signer » le bail. |

**Anti-contournement** (cœur du risque modèle) :

1. **Contact jamais en clair** avant conclusion (§4) = premier rempart.
2. **Hooks de détection de fuite** posés pour **P6** (tél/email en clair dans un fil ; annonce retirée
   juste après une vague de candidatures) — détection active hors P1.
3. **Compteur par compte, pas par annonce** : reloger/revendre le même bien ne réinitialise rien.
4. **Grandfathering** : aucun blocage rétroactif ; compteur démarre en prod.

**Frontière assumée P1** : on ne *garantit* pas l'absence de conclusion hors plateforme (impossible) ;
on la **rend coûteuse** via l'interception et on trace ce qu'on peut. La détection fine relève de P6.

## 9. Stratégie de tests

Conforme au skill `testing-protocol` (scripts Python, succès + échec + limites, tableau récap) et au
contrat E2E existant.

**Domaine `commission` (le plus critique) :**
- Gate : 1re affaire → `OPEN` + waived ; 2e sans paiement → `BLOCKED` ; 2e payée → `OPEN` ; agence
  courtière → `NOT_APPLICABLE`.
- Idempotence : double `rental.lease.signed` → 1 `Conclusion`, compteur +1.
- Versionnement `CommissionRule` : la conclusion fige le montant à sa date.
- Avoir : payé sans signature → crédit réutilisé à la conclusion suivante.

**Intégration inter-services (E2E mesh) :**
- Location 1re affaire : candidature → fil médié (contact masqué, `reveal-phone` = 403) → accepte →
  gate `OPEN` (offerte) → `rental.lease.signed` → compteur = 1.
- Location 2e affaire : gate `BLOCKED` → `commission.due` → `billing` Invoice(commission, unpaid) →
  `payment` create-intent → `payment.completed` → gate `OPEN` → signature → compteur = 2.
- Vente : demande d'achat → offre → acceptation → gate → compromis 3a9dSign → `sale.compromis.signed`
  → compteur.
- Fail-closed : `commission` down → signature refusée.
- Anti-contournement : payload `rental.application.received` **sans** email/tél ; `_application_dict`
  propriétaire particulier **sans** coordonnées.

**Contrat E2E** (`tools/contract_test.py`, 88/88 aujourd'hui) : ajout des routes `selling`,
`commission`, du `doc_type = compromis`, et des events (`sale.*`, `commission.*`).

**Frontend** : routes concernées → 200, build prod OK, smoke test du fil de messagerie + affichage du
lien CMI dans le flux signature (skill `user-scenario-testing`).

**Gate de qualité** : lint + format + typecheck + tests + build **tous verts** avant « done »
(`make check` si exposé).

## 10. Nouveaux artefacts & récapitulatif d'impact

**Nouveaux services / libs :** `services/commission`, `services/selling`, `libs/semsar_signing`.

**Nouveaux événements :** `sale.inquiry.created`, `sale.offer.made`, `sale.offer.accepted`,
`sale.compromis.signed`, `commission.due`, `commission.settled`, `commission.waived`.

**Événements modifiés :** `rental.application.received` (retrait des coordonnées),
`listing.contacted` (non émis en clair sur annonce particulier).

**Nouveau `doc_type` 3a9dSign :** `compromis`.

**Migrations de données :** `messaging` (BuyerMessage → Conversation/Message) ; `billing`
(`invoice_type`) ; `payment` (`payment_type = commission`).

## 11. Risques & questions ouvertes (au-delà de P1)

- **Gabarit compromis** : validation juridique marocaine obligatoire avant prod (dépendance externe).
- **Frontière promoteur-direct / palier Promoteur** : heuristique P1 (« pas d'agence intermédiaire »)
  à réconcilier avec P3.
- **CMI réel** : la passerelle reste simulée ; l'intégration CMI réelle (pattern séquestre) est un
  chantier propre, transverse aux abonnements et aux commissions.
- **Conclusion hors plateforme** : mitigée, non éliminée ; détection active = P6.
- **Détail commission par type / barème par valeur** : P1 pose un forfait configurable ; barèmes fins =
  P5.
