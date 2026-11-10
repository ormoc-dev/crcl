import { config } from '../config.js'
import { getSupabase } from './supabase.js'

const CACHE_KEY = 'crc-app-settings-cache'

const DEFAULTS = {
  app_pin: '2026',
  store_password: 'crcormoc2026',
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...(parsed || {}) }
  } catch {
    return { ...DEFAULTS }
  }
}

function writeCache(settings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function getCachedSettings() {
  return readCache()
}

/** Pull PIN + store password from Supabase (falls back to local cache). */
export async function refreshAppSettings() {
  const cached = readCache()

  if (!config.supabaseUrl || !config.supabaseAnonKey || !navigator.onLine) {
    return cached
  }

  const supabase = getSupabase()
  if (!supabase) return cached

  try {
    const { data, error } = await supabase.from('app_settings').select('key,value')
    if (error) {
      if (/app_settings|schema cache|does not exist/i.test(error.message || '')) {
        console.warn('Run supabase/app-settings.sql to enable cloud PIN/password.')
      } else {
        console.warn('app_settings fetch failed:', error.message || error)
      }
      return cached
    }

    const next = { ...DEFAULTS }
    for (const row of data || []) {
      if (row?.key && typeof row.value === 'string' && row.value.trim()) {
        next[row.key] = row.value.trim()
      }
    }
    writeCache(next)
    return next
  } catch (err) {
    console.warn('app_settings refresh failed:', err?.message || err)
    return cached
  }
}

export async function getAppPin() {
  const settings = await refreshAppSettings()
  return String(settings.app_pin || DEFAULTS.app_pin).trim()
}

export async function getStorePassword() {
  const settings = await refreshAppSettings()
  return String(settings.store_password || DEFAULTS.store_password).trim()
}

/** Update the 4-digit app PIN in Supabase + local cache (Manage Choir only). */
export async function updateAppPin(newPin) {
  const value = String(newPin || '').trim()
  if (!/^\d{4}$/.test(value)) {
    throw new Error('PIN must be exactly 4 digits.')
  }

  if (config.supabaseUrl && config.supabaseAnonKey && navigator.onLine) {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase is not ready.')

    const { error } = await supabase.from('app_settings').upsert(
      {
        key: 'app_pin',
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    )

    if (error) {
      throw new Error(error.message || 'Could not save PIN to cloud.')
    }
  } else if (!navigator.onLine) {
    throw new Error('Go online to save the new PIN for all devices.')
  }

  const cached = readCache()
  writeCache({ ...cached, app_pin: value })

  try {
    localStorage.setItem('crc-app-pin-local', value)
  } catch {
    /* ignore */
  }

  return value
}
