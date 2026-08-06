const STORAGE_KEY = 'm3a-lifestyle-profile'

export function saveLifestyleProfile({ answers, importance }) {
  const profile = { answers, importance, completedAt: new Date().toISOString() }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  return profile
}

export function loadLifestyleProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function hasLifestyleProfile() {
  return loadLifestyleProfile() !== null
}
