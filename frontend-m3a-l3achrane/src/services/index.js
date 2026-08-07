import api from './api.js'
import { listings, currentProfile, partners, threads } from '../data/index.js'
import { lifestyleLabel, mapListingDetail, mapListingHit, mapProfile, mapSearchFilters } from './mappers.js'

// Mapping importance front (Questionnaire.jsx) <-> backend (coloc-profile référentiel).
const IMPORTANCE_TO_BACKEND = { neutral: 'INDIFFERENT', preference: 'PREFERENCE', decisive: 'DECISIF' }

// Bascule mock/live PAR DOMAINE : VITE_USE_MOCK=true force tout en mock (dev hors-ligne) ;
// sinon, seuls les domaines encore sans backend restent mockés (retirés au fil des plans C/D).
const ALL_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const MOCK_DOMAINS = new Set(
  (import.meta.env.VITE_MOCK_DOMAINS ?? 'partners,messages').split(','),
)
const isMocked = (domain) => ALL_MOCK || MOCK_DOMAINS.has(domain)
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120)) // mimic async

export async function listListings(filters = {}) {
  if (isMocked('listings')) {
    let out = listings
    if (filters.ville) out = out.filter((l) => l.ville === filters.ville)
    return delay(out)
  }
  const { data } = await api.get('/listings', { params: mapSearchFilters(filters) })
  return (data.items ?? []).map(mapListingHit)
}

export async function getListing(id) {
  if (isMocked('listings')) return delay(listings.find((l) => String(l.id) === String(id)) || null)
  const { data } = await api.get(`/listings/${id}`)
  return mapListingDetail(data)
}

export async function getCurrentProfile() {
  if (isMocked('profile')) return delay(currentProfile)
  const { data } = await api.get('/me/profile')
  return mapProfile(data)
}

// answers: { [cle]: option }, importance: { [cle]: 'neutral'|'preference'|'decisive' }
// Persiste au backend (PUT /me/lifestyle) ; en mock, met à jour le profil en mémoire (round-trip de session).
export async function saveLifestyle(answers, importance) {
  if (isMocked('profile')) {
    currentProfile.lifestyleAnswers = { ...answers }
    currentProfile.lifestyleImportance = { ...importance }
    currentProfile.lifestyle = Object.values(answers).map(lifestyleLabel)
    return delay(currentProfile)
  }
  const payload = {
    answers: Object.entries(answers).map(([question_code, value]) => ({
      question_code,
      value,
      importance: IMPORTANCE_TO_BACKEND[importance[question_code]] ?? IMPORTANCE_TO_BACKEND.preference,
    })),
  }
  const { data } = await api.put('/me/lifestyle', payload)
  return mapProfile({ lifestyle: data })
}

export async function listPartners() {
  if (isMocked('partners')) return delay(partners)
  const { data } = await api.get('/partners')
  return data
}

export async function listThreads() {
  if (isMocked('messages')) return delay(threads)
  const { data } = await api.get('/messages/threads')
  return data
}

// Vue d'ensemble back-office (super-admin) : KPIs consolidés (users/listings/profiles), fan-out
// BFF `/api/v1/backoffice/overview`. Chaque sous-clé peut être `null` si le service source est
// indisponible (dégradation propre côté gateway) — le front affiche alors « — » pour ce KPI.
export async function getBackofficeOverview() {
  if (isMocked('backoffice')) {
    return delay({
      users: { total_users: 8412, signups_last_30d: 210, suspended_users: 12, deleted_pending_users: 3 },
      listings: { total_listings: 1284, published_listings: 1108, in_moderation_listings: 41, new_listings_30d: 96 },
      profiles: { total_profiles: 9021, verified_profiles: 8412, profiles_with_lifestyle: 7340 },
    })
  }
  const { data } = await api.get('/backoffice/overview')
  return data
}

// File de vérification KYC (super-admin) : candidatures en attente (CIN/étudiant/employeur),
// fan-out BFF `/api/v1/backoffice/verifications` → identity `/internal/kyc/queue`.
export async function getBackofficeVerifications() {
  if (isMocked('backoffice')) {
    return delay({
      items: [
        { id: 1, user_id: 101, status: 'pending', cin_last4: '4821', full_name: 'Youssef Benali',
          email: 'youssef.benali@example.ma', created_at: '2026-08-06T09:18:00+00:00' },
        { id: 2, user_id: 102, status: 'pending', cin_last4: '9207', full_name: 'Imane Mrabet',
          email: 'imane.mrabet@example.ma', created_at: '2026-08-06T08:10:00+00:00' },
      ],
    })
  }
  const { data } = await api.get('/backoffice/verifications')
  return data
}

export async function verifyBackofficeVerification(kycId) {
  if (isMocked('backoffice')) return delay({ id: kycId, status: 'verified' })
  const { data } = await api.post(`/backoffice/verifications/${kycId}/verify`)
  return data
}

export async function rejectBackofficeVerification(kycId) {
  if (isMocked('backoffice')) return delay({ id: kycId, status: 'rejected' })
  const { data } = await api.post(`/backoffice/verifications/${kycId}/reject`)
  return data
}

// File des annonces à modérer (super-admin), fan-out BFF `/api/v1/backoffice/listings` →
// coloc-listing `/internal/listings/queue` (statut EN_MODERATION par défaut).
export async function getBackofficeListings() {
  if (isMocked('backoffice')) {
    return delay({
      items: [
        { id: 'l-4482', title: 'Chambre lumineuse — Maârif, proche BD Zerktouni', city: 'Casablanca',
          rent: 2400, currency: 'MAD', owner_id: 3021, status: 'EN_MODERATION',
          created_at: '2026-08-06T09:18:00+00:00' },
        { id: 'l-4479', title: 'Colocation 3 chambres — Agdal', city: 'Rabat', rent: 1900,
          currency: 'MAD', owner_id: 3087, status: 'EN_MODERATION',
          created_at: '2026-08-06T08:10:00+00:00' },
        { id: 'l-4471', title: 'Appartement partagé — Gueliz, 2e étage', city: 'Marrakech',
          rent: 2800, currency: 'MAD', owner_id: 3114, status: 'EN_MODERATION',
          created_at: '2026-08-05T17:42:00+00:00' },
      ],
    })
  }
  const { data } = await api.get('/backoffice/listings')
  return data
}

// Actions de modération — routes du proxy générique du service coloc-listing (garde
// superadmin déjà appliquée côté service, cf. POST /listings/{id}/(approve|reject)).
export async function approveBackofficeListing(listingId) {
  if (isMocked('backoffice')) return delay({ id: listingId, status: 'PUBLIEE' })
  const { data } = await api.post(`/listings/${listingId}/approve`)
  return data
}

export async function rejectBackofficeListing(listingId) {
  if (isMocked('backoffice')) return delay({ id: listingId, status: 'REJETEE' })
  const { data } = await api.post(`/listings/${listingId}/reject`)
  return data
}

// Comptes utilisateurs du tenant m3a (super-admin), réutilise l'endpoint composite existant
// `GET /api/v1/admin/accounts` (analytics, filtré `type=user`) avec le paramètre `tenant`
// (opt-in, n'affecte pas la console super-admin semsarout qui l'omet).
export async function getBackofficeUsers() {
  if (isMocked('backoffice')) {
    return delay({
      items: [
        { id: 101, name: 'Sara Candidat', email: 'candidat@m3a.ma', status: 'active',
          account_role: 'buyer', user_type: 'particular', is_verified: true,
          created_at: '2026-07-12T09:00:00+00:00', last_login: '2026-08-05T14:22:00+00:00' },
        { id: 102, name: 'Karim Bailleur', email: 'bailleur@m3a.ma', status: 'active',
          account_role: 'agent', user_type: 'professional', is_verified: true,
          created_at: '2026-06-04T09:00:00+00:00', last_login: '2026-08-06T08:10:00+00:00' },
        { id: 103, name: 'Imane Mrabet', email: 'i.mrabet@ocpgroup.ma', status: 'active',
          account_role: 'buyer', user_type: 'particular', is_verified: false,
          created_at: '2026-07-28T09:00:00+00:00', last_login: null },
        { id: 104, name: 'Sofia Fassi', email: 'sofia.fassi@outlook.com', status: 'suspended',
          account_role: 'agent', user_type: 'professional', is_verified: true,
          created_at: '2026-03-19T09:00:00+00:00', last_login: '2026-07-02T11:05:00+00:00' },
      ],
      total: 4,
    })
  }
  const { data } = await api.get('/admin/accounts', { params: { type: 'user', tenant: 'm3a-l3achrane' } })
  return data
}

export async function suspendBackofficeUser(userId) {
  if (isMocked('backoffice')) return delay({ user: { id: userId, is_suspended: true } })
  const { data } = await api.post(`/backoffice/users/${userId}/suspend`)
  return data
}

export async function reactivateBackofficeUser(userId) {
  if (isMocked('backoffice')) return delay({ user: { id: userId, is_suspended: false } })
  const { data } = await api.post(`/backoffice/users/${userId}/unsuspend`)
  return data
}

// Baux & paiements (super-admin) : domaine colocation m3a propre (services/coloc-listing,
// modèles ColocLease/ColocPayment), distinct du back-office agence legacy (contract/payment,
// cloisonnés agency_id) — d'où la route dédiée `/api/v1/backoffice/leases` plutôt que
// `/api/v1/backoffice/contracts` (déjà prise par le legacy). CADRAGE : les statuts de
// paiement (pending/escrowed/released/refunded) modélisent des ÉTATS de séquestre —
// aucun prestataire de paiement (PSP) n'est intégré, aucun mouvement d'argent réel.
export async function getBackofficeLeases() {
  if (isMocked('backoffice')) {
    return delay({
      items: [
        { id: 'lease-1', listing_id: 'l-4482', tenant_user_id: 42, owner_id: 3021,
          rent_amount: 2400, deposit_amount: 2400, status: 'active',
          start_date: '2026-07-25', end_date: null, created_at: '2026-07-25T09:00:00+00:00',
          payments: [
            { id: 'pay-1', type: 'deposit', amount: 2400, period: null, status: 'escrowed' },
            { id: 'pay-2', type: 'rent', amount: 2400, period: '2026-08', status: 'escrowed' },
          ] },
        { id: 'lease-2', listing_id: 'l-4479', tenant_user_id: 58, owner_id: 3087,
          rent_amount: 1900, deposit_amount: 1900, status: 'pending',
          start_date: '2026-08-10', end_date: null, created_at: '2026-08-05T11:30:00+00:00',
          payments: [
            { id: 'pay-3', type: 'deposit', amount: 1900, period: null, status: 'pending' },
            { id: 'pay-4', type: 'rent', amount: 1900, period: '2026-08', status: 'pending' },
          ] },
      ],
    })
  }
  const { data } = await api.get('/backoffice/leases')
  return data
}

// Bail du locataire courant (+ ses paiements) — écran Paiement/séquestre (utilisateur
// authentifié). `null` si l'utilisateur n'a aucun bail.
export async function getMyLease() {
  if (isMocked('backoffice')) {
    return delay({
      id: 'lease-mock', listing_id: 'l-mock', tenant_user_id: 1, owner_id: 2,
      rent_amount: 2400, deposit_amount: 2400, status: 'active',
      start_date: '2026-08-01', end_date: null, created_at: '2026-07-20T09:00:00+00:00',
      payments: [
        { id: 'pay-mock-1', type: 'deposit', amount: 2400, period: null, status: 'escrowed' },
        { id: 'pay-mock-2', type: 'rent', amount: 2400, period: '2026-08', status: 'pending' },
      ],
    })
  }
  const { data } = await api.get('/me/lease')
  return data
}

// Actions de séquestre (owner/admin, gardées côté service coloc-listing) — état only,
// aucun traitement de paiement réel.
export async function escrowLeasePayment(leaseId, paymentId) {
  if (isMocked('backoffice')) return delay({ id: leaseId })
  const { data } = await api.post(`/leases/${leaseId}/payments/${paymentId}/escrow`)
  return data
}

export async function releaseLeasePayment(leaseId, paymentId) {
  if (isMocked('backoffice')) return delay({ id: leaseId })
  const { data } = await api.post(`/leases/${leaseId}/payments/${paymentId}/release`)
  return data
}

export async function refundLeasePayment(leaseId, paymentId) {
  if (isMocked('backoffice')) return delay({ id: leaseId })
  const { data } = await api.post(`/leases/${leaseId}/payments/${paymentId}/refund`)
  return data
}

// Signalements (super-admin) : domaine `trust-safety` (services/trust-safety/app/models.py,
// modèle `Report`), fan-out BFF `GET /api/v1/backoffice/reports` → trust-safety
// `/internal/reports` (statut `open` par défaut, filtrable via `?status=`).
export async function getBackofficeReports() {
  if (isMocked('backoffice')) {
    return delay({
      items: [
        { id: 1, tenant: 'm3a-l3achrane', reporter_id: 3021, target_type: 'listing',
          target_id: 'l-4482', reason: 'spam', description: 'Annonce publiée en double.',
          status: 'open', created_at: '2026-08-06T09:18:00+00:00', resolved_at: null,
          resolver_id: null },
        { id: 2, tenant: 'm3a-l3achrane', reporter_id: 3087, target_type: 'profile',
          target_id: '102', reason: 'harassment', description: null, status: 'open',
          created_at: '2026-08-06T08:10:00+00:00', resolved_at: null, resolver_id: null },
      ],
    })
  }
  const { data } = await api.get('/backoffice/reports')
  return data
}

// Actions de traitement d'un signalement — proxy générique du service trust-safety (garde
// superadmin déjà appliquée côté service, cf. POST /admin/reports/{id}/(resolve|dismiss)).
export async function resolveReport(reportId) {
  if (isMocked('backoffice')) return delay({ id: reportId, status: 'resolved' })
  const { data } = await api.post(`/admin/reports/${reportId}/resolve`)
  return data
}

export async function dismissReport(reportId) {
  if (isMocked('backoffice')) return delay({ id: reportId, status: 'dismissed' })
  const { data } = await api.post(`/admin/reports/${reportId}/dismiss`)
  return data
}

// Création d'un signalement (utilisateur authentifié) — `POST /api/v1/reports` → trust-safety
// `POST /reports` (reporter_id + tenant injectés depuis l'identité par le BFF).
export async function createReport({ target_type, target_id, reason, description }) {
  if (isMocked('backoffice')) {
    return delay({ id: Date.now(), target_type, target_id, reason, description, status: 'open' })
  }
  const { data } = await api.post('/reports', { target_type, target_id, reason, description })
  return data
}

// Pondération active du scoring matching (super-admin, lecture + édition), fan-out BFF
// `GET/PUT /api/v1/backoffice/matching-weights` → service matching `/internal/weights`
// (table `matching_weights`, versionnée — cf. services/matching/app/models.py).
export async function getBackofficeMatchingWeights() {
  if (isMocked('backoffice')) return delay({ version: 'default-v1', budget: 0.4, lifestyle: 0.6 })
  const { data } = await api.get('/backoffice/matching-weights')
  return data
}

export async function updateBackofficeMatchingWeights(budget, lifestyle) {
  if (isMocked('backoffice')) {
    return delay({ version: `mock-${Date.now()}`, budget, lifestyle })
  }
  const { data } = await api.put('/backoffice/matching-weights', { budget, lifestyle })
  return data
}

// Référentiel lifestyle m3a (super-admin, LECTURE SEULE) : fan-out BFF
// `GET /api/v1/backoffice/lifestyle-referential` → coloc-profile `/internal/lifestyle-referential`
// (module Python statique `semsar_common.coloc_referential`, pas une table — pas d'édition
// possible tant qu'il n'est pas migré en base).
export async function getBackofficeLifestyleReferential() {
  if (isMocked('backoffice')) {
    return delay({
      questions: {
        coucher: ['avant22', '22h-minuit', 'apres-minuit'],
        travail: ['jour', 'decale', 'teletravail'],
        weekend: ['maison', 'sorti', 'ca-depend'],
        menage: ['quotidien', '2-3-semaine', 'hebdomadaire'],
        vaisselle: ['immediat', 'jour-meme', 'beaucoup'],
        tabac: ['non-fumeur', 'balcon', 'interieur'],
        alcool: ['jamais', 'occasionnel', 'regulier'],
        invites: ['rarement', 'mensuel', 'souvent'],
        bruit: ['casque', 'modere', 'sans-contrainte'],
        cuisine: ['separee', 'parfois', 'ensemble'],
        charges: ['chacun', 'commune', 'a-definir'],
        social: ['amis', 'voisinage', 'peu-importe'],
        langue: ['darija', 'francais', 'indifferent'],
      },
      importance_levels: ['DECISIF', 'INDIFFERENT', 'PREFERENCE'],
    })
  }
  const { data } = await api.get('/backoffice/lifestyle-referential')
  return data
}

// Rôles & permissions (super-admin) : CRUD complet — réutilise le proxy générique existant
// `/api/v1/backoffice/roles*` (routé vers identity, `services/identity/app/rbac.py`, déjà
// servi au back-office legacy `frontend/`). Le BFF (`gateway/app/main.py`) relaie ces routes
// telles quelles ; la garde (superadmin / droit de gérer les rôles, rôles système protégés,
// anti-escalation des permissions) vit côté identity.
let _mockRoles = [
  { id: 1, name: 'Super-admin', description: 'Accès complet à la plateforme', level: 0,
    is_system: true, users_count: 2, permissions: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  { id: 2, name: 'Modération', description: 'Vérifications, annonces, comptes', level: 1,
    is_system: false, users_count: 3, permissions: [{ id: 1 }, { id: 2 }] },
  { id: 3, name: 'Support', description: 'Lecture seule, assistance utilisateurs', level: 2,
    is_system: false, users_count: 4, permissions: [{ id: 1 }] },
]

export async function getBackofficeRoles() {
  if (isMocked('backoffice')) return delay({ roles: _mockRoles })
  const { data } = await api.get('/backoffice/roles')
  return data
}

export async function createRole({ name, description, color, level }) {
  if (isMocked('backoffice')) {
    const role = { id: Math.max(0, ..._mockRoles.map((r) => r.id)) + 1, name, description,
      color, level: level ?? 100, is_system: false, users_count: 0, permissions: [] }
    _mockRoles = [..._mockRoles, role]
    return delay(role)
  }
  const { data } = await api.post('/backoffice/roles', { name, description, color, level })
  return data
}

export async function updateRole(roleId, { name, description, color, level }) {
  if (isMocked('backoffice')) {
    const patch = { name, description, color, level }
    _mockRoles = _mockRoles.map((r) => (r.id === roleId ? { ...r, ...patch } : r))
    return delay(_mockRoles.find((r) => r.id === roleId))
  }
  const { data } = await api.put(`/backoffice/roles/${roleId}`, { name, description, color, level })
  return data
}

export async function deleteRole(roleId) {
  if (isMocked('backoffice')) {
    _mockRoles = _mockRoles.filter((r) => r.id !== roleId)
    return delay({ message: 'Role deleted' })
  }
  const { data } = await api.delete(`/backoffice/roles/${roleId}`)
  return data
}
