const ASKED_KEY = 'crc-notify-asked'

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Request permission (needs a user gesture on many browsers). */
export async function ensureNotifyPermission() {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const result = await Notification.requestPermission()
    try {
      sessionStorage.setItem(ASKED_KEY, '1')
    } catch {
      /* ignore */
    }
    return result
  } catch {
    return Notification.permission
  }
}

export function appIsForeground() {
  return (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  )
}

/**
 * Show an OS notification via the service worker when possible.
 * @param {{
 *   title: string,
 *   body?: string,
 *   tag?: string,
 *   url?: string,
 *   kind?: string,
 *   force?: boolean,
 *   data?: Record<string, unknown>,
 * }} opts
 */
export async function showAppNotification(opts = {}) {
  if (!notificationsSupported()) return false
  if (Notification.permission !== 'granted') return false

  // Don't interrupt while the choir member is already looking at the app
  if (appIsForeground() && !opts.force) return false

  const icon = new URL('public/assets/icon/icon-192.png', document.baseURI).href
  const data = {
    url: opts.url || '#/',
    kind: opts.kind || 'generic',
    ...(opts.data || {}),
  }

  const payload = {
    body: String(opts.body || '').slice(0, 180),
    icon,
    badge: icon,
    tag: opts.tag || undefined,
    renotify: Boolean(opts.tag),
    data,
    vibrate: [120],
  }

  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg?.showNotification) {
      await reg.showNotification(String(opts.title || 'Christus Rex Choir'), payload)
      return true
    }
  } catch {
    /* fall through */
  }

  try {
    // Fallback when SW is unavailable
    // eslint-disable-next-line no-new
    new Notification(String(opts.title || 'Christus Rex Choir'), payload)
    return true
  } catch {
    return false
  }
}

export function markNotifyAsked() {
  try {
    sessionStorage.setItem(ASKED_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function wasNotifyAsked() {
  try {
    return sessionStorage.getItem(ASKED_KEY) === '1'
  } catch {
    return false
  }
}
