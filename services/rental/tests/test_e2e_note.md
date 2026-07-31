# E2E Procédure : Boucle Bail Particulier → Gate Commission

## Scénario : 2 bails, 1er gratuit, 2e bloqué (402 → paiement CMI) → déverrouillé

### Prérequis
1. Avoir un jeton `SIGN_API_KEY=3a9dSign` configuré dans `services/rental/.env` (ou via l'env du mesh).
2. Lancer le mesh complet :
   ```bash
   bash scripts/dev-mesh-up.sh
   ```
   Vérifier les 3 services critiques :
   ```bash
   curl -s localhost:8518/health  # rental
   curl -s localhost:8519/health  # commission
   curl -s localhost:8507/health  # payment
   ```

### Setup Initial
1. Créer un propriétaire particulier (uid=P). S'authentifier avec son jeton.
2. Créer 2 candidatures **acceptées** pour le même propriétaire P (e.g., candidat C1, C2).
   - Chaque candidature aura un objet `Application` avec `status=accepted`.

### Scenario Pas à Pas

#### **Étape 1 : Bail #1 — Signature gratuite (1re offerte)**

1. **Créer la demande de signature** :
   ```bash
   POST /api/v1/gestion-locative/owner/leases
   Authorization: Bearer <jwt_P>
   {
       "application_id": <app1_id>,
       "lease_document_url": "https://example.com/lease1.pdf"
   }
   ```
   Réponse : `201` avec `lease_id=L1`.

2. **Vérifier l'état initial de la gate** :
   ```bash
   POST http://localhost:8518/internal/gate
   (appelé directement par rental, pas via BFF)
   {
       "deal_type": "rental",
       "account_id": <P>,
       "purpose": "commission"
   }
   ```
   Réponse : `{"state": "OPEN", "billable": false}` (1re offerte).

3. **Signer le bail** :
   ```bash
   POST /api/v1/gestion-locative/owner/leases/<L1>/request-signature
   Authorization: Bearer <jwt_P>
   ```
   Réaction du service rental :
   - Appel interne à `commission_client.gate()`.
   - Gate retourne `state="OPEN", billable=false` → contrat autorisé.
   - Créer un objet `SignatureRequest` et l'envoyer à la signature API.
   - Publier `rental.lease.signed(lease_id=L1, account_id=P)`.

4. **Vérifier la signature** (polling) :
   ```bash
   GET /api/v1/gestion-locative/owner/leases/<L1>/signature-status
   Authorization: Bearer <jwt_P>
   ```
   Réponse : `{"status": "signed", "lease_id": "L1", ...}`.

5. **Vérifier le compteur commission** (backoffice) :
   ```bash
   GET /api/v1/backoffice/commission/counters/<P>
   Authorization: Bearer <jwt_superadmin>
   ```
   Réponse : `{"concluded_count": 1, "account_id": <P>}`.

---

#### **Étape 2 : Bail #2 — Blocage de la gate (402 Payment Required)**

1. **Créer la demande de signature** :
   ```bash
   POST /api/v1/gestion-locative/owner/leases
   Authorization: Bearer <jwt_P>
   {
       "application_id": <app2_id>,
       "lease_document_url": "https://example.com/lease2.pdf"
   }
   ```
   Réponse : `201` avec `lease_id=L2`.

2. **Tenter la signature (gate BLOQUÉE)** :
   ```bash
   POST /api/v1/gestion-locative/owner/leases/<L2>/request-signature
   Authorization: Bearer <jwt_P>
   ```
   Réaction du service rental :
   - Appel interne à `commission_client.gate()`.
   - Gate retourne `state="BLOCKED", billable=true, pay_url="https://...", invoice_ref="INV-..."`.
   - **Répondre 402 (Payment Required)** au client avec payload :
     ```json
     {
         "status": "blocked",
         "reason": "payment_required",
         "pay_url": "https://...",
         "invoice_ref": "INV-...",
         "lease_id": "L2"
     }
     ```
   - Ne PAS publier `rental.lease.signed`.

3. **Vérifier le compteur (inchangé)** :
   ```bash
   GET /api/v1/backoffice/commission/counters/<P>
   ```
   Réponse : `{"concluded_count": 1}` (toujours 1, L2 n'a pas signé).

---

#### **Étape 3 : Paiement CMI → Webhooks → Déblocage**

1. **Naviguer vers le lien CMI (interactif)** :
   - Cliquer sur `pay_url` renvoyée en 402.
   - Déboguer / simuler le webhook de succès CMI vers `payment` service.

2. **Événement `payment.completed`** (reçu par rental via RabbitMQ) :
   - Événement : `{"type": "payment.completed", "purpose": "commission", "account_id": <P>, "invoice_ref": "INV-..."}`
   - Le `commission` service a publié cet événement après la réconciliation du paiement.
   - Le `rental` service, s'il écoute ce type, peut l'ignorer ou le logguer.

3. **Vérifier l'état de la gate après paiement** :
   ```bash
   POST http://localhost:8518/internal/gate
   {
       "deal_type": "rental",
       "account_id": <P>,
       "purpose": "commission"
   }
   ```
   Réponse : `{"state": "OPEN", "billable": true}` (paiement reconnu, deuxième affaire billable).

---

#### **Étape 4 : Bail #2 — Signature après paiement (OUVERTE)**

1. **Retenter la signature** :
   ```bash
   POST /api/v1/gestion-locative/owner/leases/<L2>/request-signature
   Authorization: Bearer <jwt_P>
   ```
   Réaction du service rental :
   - Appel interne à `commission_client.gate()`.
   - Gate retourne `state="OPEN", billable=true` → contrat autorisé.
   - Créer un `SignatureRequest` pour L2.
   - Publier `rental.lease.signed(lease_id=L2, account_id=P)`.
   - **Répondre 200 OK** au client.

2. **Vérifier la signature** :
   ```bash
   GET /api/v1/gestion-locative/owner/leases/<L2>/signature-status
   Authorization: Bearer <jwt_P>
   ```
   Réponse : `{"status": "signed", "lease_id": "L2", ...}`.

3. **Vérifier le compteur final** :
   ```bash
   GET /api/v1/backoffice/commission/counters/<P>
   Authorization: Bearer <jwt_superadmin>
   ```
   **Résultat attendu** : `{"concluded_count": 2, "account_id": <P>}`.

---

## Vérification Finale

### Statuts attendus
- Bail L1 : `status=signed`, compteur incrément après signature.
- Bail L2 : `status=blocked` (402) après 1ère tentative, puis `status=signed` après paiement et 2e tentative.
- Compteur commission pour P : `1` après L1, `2` après L2.

### Logs à checker
```bash
# Rental service logs
tail -f /tmp/semsar-mesh/rental.log

# Commission service logs
tail -f /tmp/semsar-mesh/commission.log

# Payment service logs
tail -f /tmp/semsar-mesh/payment.log
```

### Points de non-retour (fail-closed)
- Si la gate est down (ou retourne erreur 5xx), rental doit répondre **503 Service Unavailable** au client, PAS faire de retry implicite.
- Le vide du bail (annulation par le client) reste une opération distincte, pas lié au paiement.

---

## Notes d'implémentation

- **Idempotence** : Si le client retente `/request-signature` sans changer le `lease_id`, retourner le même `pay_url` (pas créer deux invoices).
- **État transactionnel** : La publication de `rental.lease.signed` doit être **atomique** avec la validation de la gate.
- **Temps de paiement** : Aucune limite temps stricte ; le webhook CMI est asynchrone. Le client repoll le statut ou reçoit une notification (futur).
