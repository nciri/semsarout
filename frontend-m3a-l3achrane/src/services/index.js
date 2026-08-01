import api from './api.js'
import { listings, currentProfile, partners, threads } from '../data/index.js'

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 120)) // mimic async

export async function listListings(filters = {}) {
  if (USE_MOCK) {
    let out = listings
    if (filters.ville) out = out.filter((l) => l.ville === filters.ville)
    return delay(out)
  }
  const { data } = await api.get('/listings', { params: filters })
  return data
}

export async function getListing(id) {
  if (USE_MOCK) return delay(listings.find((l) => String(l.id) === String(id)) || null)
  const { data } = await api.get(`/listings/${id}`)
  return data
}

export async function getCurrentProfile() {
  if (USE_MOCK) return delay(currentProfile)
  const { data } = await api.get('/me/profile')
  return data
}

export async function listPartners() {
  if (USE_MOCK) return delay(partners)
  const { data } = await api.get('/partners')
  return data
}

export async function listThreads() {
  if (USE_MOCK) return delay(threads)
  const { data } = await api.get('/messages/threads')
  return data
}
