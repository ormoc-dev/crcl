import {
  ensureNotifyPermission,
  notificationPermission,
  showAppNotification,
  wasNotifyAsked,
} from './app-notify.js'
import { showAppToast } from '../components/app-toast.js'

const PREV_LYRICS_KEY = 'crc-prev-lyric-ids'
const PREV_SCHED_KEY = 'crc-prev-schedule-sigs'
const ENABLED_KEY = 'crc-notify-enabled'

let swBound = false

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function scheduleSig(row) {
  return `${row.id}|${row.updated_at || ''}|${row.time || ''}|${row.title || ''}|${row.day || ''}|${row.type || ''}`
}

export function notificationsEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== '0'
}

export function setNotificationsEnabled(on) {
  localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
}

export async function enableNotifications() {
  const perm = await ensureNotifyPermission()
  if (perm === 'granted') {
    setNotificationsEnabled(true)
    try {
      const { ensurePushSubscription } = await import('./push-service.js')
      const push = await ensurePushSubscription()
      if (!push.ok && push.reason === 'no-vapid') {
        console.warn('Push VAPID public key missing — closed-app alerts need setup.')
      }
      if (!push.ok && push.reason === 'migration') {
        console.warn('Run supabase/push-subscriptions.sql for closed-app alerts.')
      }
    } catch (err) {
      console.warn('Push subscribe skipped:', err?.message || err)
    }
  }
  return perm
}

function goHash(url) {
  if (!url) {
    location.hash = '#/'
    return
  }
  const raw = String(url)
  if (raw.startsWith('#')) {
    location.hash = raw
    return
  }
  if (raw.startsWith('/')) {
    location.hash = `#${raw}`
    return
  }
  location.hash = '#/'
}

function bindServiceWorkerActions() {
  if (swBound || !('serviceWorker' in navigator)) return
  swBound = true

  navigator.serviceWorker.addEventListener('message', (event) => {
    const msg = event.data
    if (msg?.type === 'crc-push-resubscribe') {
      import('./push-service.js')
        .then((mod) => mod.ensurePushSubscription())
        .catch(() => {})
      return
    }
    if (msg?.type !== 'crc-notify-action') return
    goHash(msg.data?.url || '#/')
  })
}

export function startNotifyService() {
  bindServiceWorkerActions()

  // Re-register closed-app push if permission already granted
  if (notificationsEnabled() && notificationPermission() === 'granted') {
    import('./push-service.js')
      .then((mod) => mod.ensurePushSubscription())
      .catch(() => {})
  }

  // Soft in-app tip once: enable OS alerts for new lyrics / schedule
  window.setTimeout(() => {
    try {
      if (localStorage.getItem('crc-notify-tip-seen') === '1') return
      if (!notificationsEnabled()) return
      if (notificationPermission() !== 'default') return
      if (wasNotifyAsked()) return

      localStorage.setItem('crc-notify-tip-seen', '1')
      showAppToast({
        title: 'Turn on alerts?',
        body: 'Get notified when new lyrics or schedule are posted — even if the app is closed. Open Settings → Notifications.',
        url: '#/settings',
        kind: 'info',
        durationMs: 7000,
      })
    } catch {
      /* ignore */
    }
  }, 2500)
}

function canOsNotify() {
  return notificationsEnabled() && notificationPermission() === 'granted'
}

function announceInApp({ title, body, url, kind }) {
  showAppToast({ title, body, url, kind })
  window.dispatchEvent(
    new CustomEvent('crc-notify', {
      detail: { title, body, url, kind },
    }),
  )
}

export async function notifyNewLyrics(items = []) {
  if (!items.length) return false

  let title
  let body
  let url
  let tag

  if (items.length === 1) {
    const song = items[0]
    title = 'New choir lyric'
    body = song.title || 'A new song was added'
    url = song.id ? `#/lyrics/${encodeURIComponent(song.id)}` : '#/'
    tag = `crc-lyric-${song.id}`
  } else {
    title = 'New choir lyrics'
    body = `${items.length} new songs were added`
    url = '#/'
    tag = 'crc-lyrics-batch'
  }

  announceInApp({ title, body, url, kind: 'lyric' })

  if (!canOsNotify()) return true
  return showAppNotification({
    title,
    body,
    tag,
    kind: 'lyric',
    url,
    data: items.length === 1 ? { lyricId: items[0].id } : {},
  })
}

export async function notifyScheduleChanges(items = []) {
  if (!items.length) return false

  let title
  let body
  let tag

  if (items.length === 1) {
    const row = items[0]
    const kindLabel = row.type === 'practice' ? 'Practice' : 'Service'
    title = `New choir ${kindLabel.toLowerCase()}`
    body = [row.day, row.title, row.time].filter(Boolean).join(' · ') || 'Schedule was updated'
    tag = `crc-schedule-${row.id}`
  } else {
    title = 'Choir schedule updated'
    body = `${items.length} schedule items changed`
    tag = 'crc-schedule-batch'
  }

  const url = '#/schedule'
  announceInApp({ title, body, url, kind: 'schedule' })

  if (!canOsNotify()) return true
  return showAppNotification({
    title,
    body,
    tag,
    kind: 'schedule',
    url,
    data: items.length === 1 ? { scheduleId: items[0].id } : {},
  })
}

/**
 * Compare pulled remote data with the last known snapshot and notify on changes.
 * First successful snapshot is silent (baseline).
 * `knownLyricIds` / `knownSchedSigs` = what this device already had (avoids self-notify).
 */
export async function detectAndNotifySyncChanges({
  lyrics = [],
  schedule = [],
  knownLyricIds = [],
  knownSchedSigs = [],
} = {}) {
  const prevLyricIds = new Set([
    ...readJson(PREV_LYRICS_KEY, []),
    ...knownLyricIds.filter(Boolean),
  ])
  const prevSchedSigs = new Set([
    ...readJson(PREV_SCHED_KEY, []),
    ...knownSchedSigs.filter(Boolean),
  ])

  const nextLyricIds = lyrics.map((row) => row.id).filter(Boolean)
  const nextSchedSigs = schedule.map(scheduleSig).filter((sig) => sig && !sig.startsWith('|'))

  const hasLyricBaseline = prevLyricIds.size > 0
  const hasSchedBaseline = prevSchedSigs.size > 0

  if (hasLyricBaseline) {
    const added = lyrics.filter((row) => row.id && !prevLyricIds.has(row.id))
    if (added.length) await notifyNewLyrics(added)
  }

  if (hasSchedBaseline) {
    const changed = schedule.filter((row) => {
      if (!row.id) return false
      return !prevSchedSigs.has(scheduleSig(row))
    })
    if (changed.length) await notifyScheduleChanges(changed)
  }

  writeJson(PREV_LYRICS_KEY, nextLyricIds)
  writeJson(PREV_SCHED_KEY, nextSchedSigs)
}

export { notificationPermission, notificationsSupported } from './app-notify.js'
