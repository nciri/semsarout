// Mock data for the partner portal sub-screens (Lot E). No backend exists yet for these
// domains — everything here is static demo data, consumed directly by the surfaces/partner/*
// screens without going through the services/api layer (no network call to fake).

// Champs et valeurs de statut alignés sur services/partner/app/models.py (Affilie.to_dict)
// et AFFILIE_STATUSES (services/partner/app/schemas.py) pour que le mode mock reflète
// fidèlement le contrat de l'API réelle.
export const affiliates = [
  { id: 1, full_name: 'Université Mohammed V', email: 'contact@um5.ac.ma', external_ref: 'UM5-RABAT', status: 'ACTIVE' },
  { id: 2, full_name: 'ENSA Casablanca', email: 'contact@ensa-casa.ac.ma', external_ref: 'ENSA-CASA', status: 'ACTIVE' },
  { id: 3, full_name: 'OCP Group', email: 'rh@ocpgroup.ma', external_ref: 'OCP-KHOURIBGA', status: 'ACTIVE' },
  { id: 4, full_name: 'Université Hassan II', email: 'contact@uh2c.ac.ma', external_ref: 'UH2C-CASA', status: 'INACTIVE' },
  { id: 5, full_name: 'École Centrale Casablanca', email: 'contact@centrale-casablanca.ma', external_ref: 'ECC-CASA', status: 'PENDING' },
]

// Champs et valeurs alignés sur services/partner/app/models.py (Verification.to_dict) :
// affilie_id référence `affiliates` ci-dessus, doc_type ∈ DOC_TYPES (Verifications.jsx),
// status ∈ PENDING/APPROVED/REJECTED.
export const verificationRequests = [
  { id: 1, affilie_id: 1, doc_type: 'CARTE_ETUDIANT', status: 'PENDING', submitted_at: '2026-08-05T09:00:00+00:00' },
  { id: 2, affilie_id: 2, doc_type: 'CIN', status: 'PENDING', submitted_at: '2026-08-05T10:30:00+00:00' },
  { id: 3, affilie_id: 3, doc_type: 'ATTESTATION_EMPLOYEUR', status: 'APPROVED', submitted_at: '2026-08-03T08:15:00+00:00' },
  { id: 4, affilie_id: 4, doc_type: 'CARTE_ETUDIANT', status: 'REJECTED', submitted_at: '2026-08-02T14:00:00+00:00' },
  { id: 5, affilie_id: 5, doc_type: 'CIN', status: 'APPROVED', submitted_at: '2026-08-01T11:45:00+00:00' },
]

// Champs et valeurs de statut alignés sur services/partner/app/schemas.py (RESERVATION_STATUSES)
// pour que le mode mock reflète fidèlement le contrat de l'API réelle.
export const reservedOffers = [
  { id: 1, listing_id: 'LST-1042', affilie_id: 1, label: 'Studio meublé — Agdal', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RESERVED' },
  { id: 2, listing_id: 'LST-2087', affilie_id: 2, label: 'Colocation 3 chambres — Maarif', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RESERVED' },
  { id: 3, listing_id: 'LST-3310', affilie_id: 3, label: 'Chambre chez l’habitant — Hay Riad', start_date: '2026-10-01', end_date: '2027-03-31', status: 'CONVERTED' },
  { id: 4, listing_id: 'LST-4118', affilie_id: 4, label: 'Appartement 2 pièces — Bourgogne', start_date: '2026-09-01', end_date: '2027-06-30', status: 'RELEASED' },
]

// Champs et valeurs de statut alignés sur GRANT_STATUSES (services/partner/app/schemas.py).
export const grants = [
  { id: 1, program: 'Bourse logement — Rectorat Rabat', affilie_id: 1, amount: 1500, status: 'PAID' },
  { id: 2, program: 'Aide sociale ENSA', affilie_id: 2, amount: 900, status: 'PLANNED' },
  { id: 3, program: 'Fonds solidarité OCP', affilie_id: 3, amount: 2000, status: 'CANCELLED' },
  { id: 4, program: 'Bourse logement — Rectorat Rabat', affilie_id: 1, amount: 1500, status: 'PAID' },
]

// No demo invoices — this shows the empty state rather than fabricating billing history.
export const invoices = []

// Champs alignés sur services/partner/app/models.py (ApiKey.to_dict) — `prefix` seul est
// exposé après création (jamais key_hash), `revoked_at` porte l'état actif/révoquée.
export const apiKeys = [
  { id: 1, label: 'Clé de production', prefix: 'sk_live_a1b2', last_used_at: '2026-08-04T09:00:00+00:00', created_at: '2026-03-12T00:00:00+00:00', revoked_at: null },
  { id: 2, label: 'Clé de test', prefix: 'sk_test_c3d4', last_used_at: null, created_at: '2026-01-20T00:00:00+00:00', revoked_at: null },
]

// Champs alignés sur services/partner/app/models.py (Webhook.to_dict) — `events` utilise les
// valeurs techniques WEBHOOK_EVENT_TYPES (ApiWebhooks.jsx), jamais traduites.
export const webhooks = [
  { id: 1, url: 'https://partenaire-univ.example.ma/hooks/verifications', events: ['partner.verification_decided'], active: true, created_at: '2026-08-01T09:00:00+00:00' },
  { id: 2, url: 'https://ocp-rh.example.ma/hooks/subventions', events: ['partner.grant_paid'], active: true, created_at: '2026-07-15T09:00:00+00:00' },
  { id: 3, url: 'https://ensa-scolarite.example.ma/hooks/offres', events: ['partner.reservation_created', 'partner.reservation_released'], active: false, created_at: '2026-06-20T09:00:00+00:00' },
]
