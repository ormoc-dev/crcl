import { config } from '../config.js'
import { getSupabase } from './supabase.js'
import { ensureNotifyPermission, notificationPermission } from './app-notify.js'

const DEVICE_KEY = 'crc-push-device-id'

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

export function hasVapidPublicKey() {
  const key = String(config.vapidPublicKey || '').trim()
  return Boolean(key) && !key.includes('YOUR_')
}

export function getPushDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}`
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return `dev-${Date.now()}`
  }
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/** Subscribe this device so it can wake when the app is closed. */
export async function subscribeWebPush() {
  if (!hasVapidPublicKey()) return { ok: false, reason: 'no-vapid' }
  if (!('PushManager' in window)) return { ok: false, reason: 'unsupported' }

  const perm = await ensureNotifyPermission()
  if (perm !== 'granted') return { ok: false, reason: perm }

  const reg = await getRegistration()
  if (!reg?.pushManager) return { ok: false, reason: 'no-sw' }

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey),
    })
  }

  const json = sub.toJSON()
  const endpoint = json.endpoint
  const p256dh = json.keys?.p256dh
  const auth = json.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: 'bad-subscription' }
  }

  const supabase = getSupabase()
  if (!supabase) return { ok: false, reason: 'missing-config' }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      device_id: getPushDeviceId(),
      endpoint,
      p256dh,
      auth,
      user_agent: String(navigator.userAgent || '').slice(0, 240),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )

  if (error) {
    if (/push_subscriptions|schema cache|does not exist/i.test(error.message || '')) {
      return { ok: false, reason: 'migration' }
    }
    console.warn('Push subscribe upsert failed:', error.message || error)
    return { ok: false, reason: 'error' }
  }

  return { ok: true, endpoint }
}

export async function ensurePushSubscription() {
  if (notificationPermission() !== 'granted') return { ok: false }
  try {
    return await subscribeWebPush()
  } catch (err) {
    console.warn('Push subscribe failed:', err?.message || err)
    return { ok: false, reason: 'error' }
  }
}

/**
 * Tell every other choir device (including closed apps) about new content.
 */
export async function dispatchChoirPush({
  kind = 'generic',
  title,
  body,
  url = '#/',
  tag,
  excludeEndpoint,
} = {}) {
  if (!hasVapidPublicKey()) return { ok: false, reason: 'no-vapid' }
  const supabase = getSupabase()
  if (!supabase) return { ok: false, reason: 'missing-config' }

  try {
    const { data, error } = await supabase.functions.invoke('send-choir-push', {
      body: {
        kind,
        title,
        body,
        url,
        tag,
        excludeEndpoint: excludeEndpoint || undefined,
        excludeDeviceId: getPushDeviceId(),
      },
    })
    if (error) {
      console.warn('send-choir-push:', error.message || error)
      return { ok: false, reason: 'invoke' }
    }
    return { ok: true, ...(data || {}) }
  } catch (err) {
    console.warn('send-choir-push failed:', err?.message || err)
    return { ok: false, reason: 'error' }
  }
}
