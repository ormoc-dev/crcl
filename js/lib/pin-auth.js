import { getAppPin, getCachedSettings } from './app-settings.js'

const UNLOCK_KEY = 'crc-app-unlocked'
const PIN_CACHE_KEY = 'crc-app-pin-local'

export function isAppUnlocked() {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

export function lockApp() {
  try {
    localStorage.removeItem(UNLOCK_KEY)
  } catch {
    /* ignore */
  }
}

function rememberUnlock(pin) {
  try {
    localStorage.setItem(UNLOCK_KEY, '1')
    localStorage.setItem(PIN_CACHE_KEY, String(pin))
  } catch {
    /* ignore */
  }
}

export function getRememberedPin() {
  try {
    return localStorage.getItem(PIN_CACHE_KEY) || ''
  } catch {
    return ''
  }
}

/** Validate 4-digit PIN against Supabase (or local cache). Saves unlock locally. */
export async function unlockAppWithPin(pin) {
  const value = String(pin || '').trim()
  if (!/^\d{4}$/.test(value)) {
    return { ok: false, reason: 'format' }
  }

  let expected = ''
  try {
    expected = await getAppPin()
  } catch {
    expected = getCachedSettings().app_pin || ''
  }

  if (!expected) {
    return { ok: false, reason: 'missing' }
  }

  if (value !== String(expected).trim()) {
    return { ok: false, reason: 'wrong' }
  }

  rememberUnlock(value)
  return { ok: true }
}
