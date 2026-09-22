import '@testing-library/jest-dom'
import { setLogger } from 'react-query'

// IndexedDB n'existe pas dans jsdom : le moteur hors-ligne de l'éditeur de
// plans (design3dLocal) en a besoin pour ses tests. `import.meta.env.MODE`
// vaut 'test' sous vitest — on n'active ce polyfill que là, jamais en prod.
if (import.meta.env.MODE === 'test') {
  await import('fake-indexeddb/auto')
}

// Node's built-in global `localStorage` (stable since ~Node 22) can shadow
// jsdom's working implementation and end up non-functional in this environment
// (setItem missing). Fall back to a minimal in-memory Storage so any test that
// touches localStorage (auth persistence, form drafts, etc.) behaves predictably.
if (typeof globalThis.localStorage?.setItem !== 'function') {
  class MemoryStorage {
    #store = new Map()
    getItem(key) { return this.#store.has(key) ? this.#store.get(key) : null }
    setItem(key, value) { this.#store.set(String(key), String(value)) }
    removeItem(key) { this.#store.delete(key) }
    clear() { this.#store.clear() }
    key(index) { return Array.from(this.#store.keys())[index] ?? null }
    get length() { return this.#store.size }
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true
  })
}

// Sans backend (CI), une requête react-query non mockée échoue souvent après la fin du test,
// pendant la fermeture du worker : son console.error arrive trop tard et Vitest compte une
// erreur « Closing rpc while onUserConsoleLog was pending ». Les tests vérifient l'écran, pas ce log.
setLogger({ log: console.log, warn: console.warn, error: () => {} })
