import { SESSION_KEY, STORAGE_KEY } from '../../src/backend/LocalBackend'

export { SESSION_KEY, STORAGE_KEY }

export class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  clear() {
    this.values.clear()
  }
}

let sessionStorage: MemoryStorage

export const installLocalStorage = (): MemoryStorage => {
  const nextStorage = new MemoryStorage()
  const nextSessionStorage = new MemoryStorage()

  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: nextStorage, sessionStorage: nextSessionStorage },
    configurable: true,
    writable: true,
  })

  sessionStorage = nextSessionStorage
  return nextStorage
}

export const getSessionStorage = (): MemoryStorage => sessionStorage

export const setActiveUser = (userId: string) => {
  sessionStorage.setItem(SESSION_KEY, userId)
}
