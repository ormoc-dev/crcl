import { getCachedSettings, getStorePassword } from './app-settings.js'

const SESSION_KEY = 'crc-store-unlocked'

export function isStoreUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === '1'
}

export async function unlockStore(password) {
  const entered = String(password || '')
  let expected = ''

  try {
    expected = await getStorePassword()
  } catch {
    expected = getCachedSettings().store_password || ''
  }

  if (!expected || entered !== expected) return false
  sessionStorage.setItem(SESSION_KEY, '1')
  return true
}

export function lockStore() {
  sessionStorage.removeItem(SESSION_KEY)
}
