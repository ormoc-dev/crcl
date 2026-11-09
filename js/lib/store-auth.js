const SESSION_KEY = 'crc-store-unlocked'
const STORE_PASSWORD = 'crcormoc2026'

export function isStoreUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export function unlockStore(password) {
  if (password !== STORE_PASSWORD) return false
  sessionStorage.setItem(SESSION_KEY, '1')
  return true
}

export function lockStore() {
  sessionStorage.removeItem(SESSION_KEY)
}
