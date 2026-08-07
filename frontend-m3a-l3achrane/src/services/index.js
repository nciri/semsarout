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
