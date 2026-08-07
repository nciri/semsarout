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

// Contrats & paiements (super-admin) : domaine non disponible pour la colocation m3a à ce
// jour. Les services `contract`/`payment` du monorepo sont cloisonnés par agence immobilière
// (agency_id, transactions de vente/location classique — cf. services/contract/app/models.py,
// services/payment/app/models.py) et n'ont aucune notion de tenant colocation ni de bail m3a ;
// `/api/v1/backoffice/contracts` est déjà pris par le back-office agence legacy (frontend/),
// donc pas de réutilisation possible sans collision. Retourne un état vide honnête plutôt que
// d'inventer des données — la vue affiche un message clair (voir ContractsView).
export async function getBackofficeContracts() {
  if (isMocked('backoffice')) return delay({ items: [], available: false })
  return { items: [], available: false }
}

// Signalements (super-admin) : `trust-safety` (services/trust-safety/app/models.py) ne porte
// que la modération de comptes (`ModerationStatus` : suspend/delete par user/agency) et son
// journal d'audit (`AdminAction`) — aucun modèle de signalement/litige communautaire (pas de
// `Report`, pas de motif, pas de statut traité/classé). Le "signalement" côté app m3a
// (`src/data/securityCenter.js`) n'est lui-même qu'un écran de libellés, sans soumission réelle
// vers un backend. Aucun endpoint à réutiliser, aucun risque de collision avec le monolithe
// legacy (`frontend/`) : état vide honnête plutôt que d'inventer une file de signalements.
export async function getBackofficeReports() {
  if (isMocked('backoffice')) return delay({ items: [], available: false })
  return { items: [], available: false }
}
