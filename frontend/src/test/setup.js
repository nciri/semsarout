import '@testing-library/jest-dom'

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
