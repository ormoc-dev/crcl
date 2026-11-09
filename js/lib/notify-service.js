import {
  ensureNotifyPermission,
  notificationPermission,
  showAppNotification,
  wasNotifyAsked,
} from './app-notify.js'

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

export function notificationsEnabled() {
  return localStorage.getItem(ENABLED_KEY) !== '0'
}

export function setNotificationsEnabled(on) {
  localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
}

export async function enableNotifications() {
  const perm = await ensureNotifyPermission()
  if (perm === 'granted') setNotificationsEnabled(true)
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
    if (msg?.type !== 'crc-notify-action') return
    goHash(msg.data?.url || '#/')
  })
}

export function startNotifyService() {
  bindServiceWorkerActions()

  // Soft prompt once if never asked (still requires gesture on some browsers)
  if (
    notificationsEnabled() &&
    notificationPermission() === 'default' &&
    !wasNotifyAsked()
  ) {
    // Wait for a user gesture via Settings; don't spam the permission dialog.
  }
}

function canNotify() {
  return notificationsEnabled() && notificationPermission() === 'granted'
}

export async function notifyNewLyrics(items = []) {
  if (!canNotify() || !items.length) return false

  if (items.length === 1) {
    const song = items[0]
    return showAppNotification({
      title: 'New choir lyric',
      body: song.title || 'A new song was added',
      tag: `crc-lyric-${song.id}`,
      kind: 'lyric',
      url: song.id ? `#/lyrics/${encodeURIComponent(song.id)}` : '#/',
      data: { lyricId: song.id },
    })
  }

  return showAppNotification({
    title: 'New choir lyrics',
    body: `${items.length} new songs were added`,
    tag: 'crc-lyrics-batch',
    kind: 'lyric',
    url: '#/',
  })
}

export async function notifyScheduleChanges(items = []) {
  if (!canNotify() || !items.length) return false

  if (items.length === 1) {
    const row = items[0]
    const kindLabel = row.type === 'practice' ? 'Practice' : 'Service'
    const body = [row.day, row.title, row.time].filter(Boolean).join(' · ')
    return showAppNotification({
      title: `Choir ${kindLabel} update`,
      body: body || 'Schedule was updated',
      tag: `crc-schedule-${row.id}`,
      kind: 'schedule',
      url: '#/schedule',
      data: { scheduleId: row.id },
    })
  }

  return showAppNotification({
    title: 'Choir schedule updated',
    body: `${items.length} schedule items changed`,
    tag: 'crc-schedule-batch',
    kind: 'schedule',
    url: '#/schedule',
  })
}

/**
 * Compare pulled remote data with the last known snapshot and notify on changes.
 * First successful snapshot is silent (baseline).
 */
export async function detectAndNotifySyncChanges({ lyrics = [], schedule = [] } = {}) {
  const prevLyricIds = new Set(readJson(PREV_LYRICS_KEY, []))
  const prevSchedSigs = new Set(readJson(PREV_SCHED_KEY, []))

  const nextLyricIds = lyrics.map((row) => row.id).filter(Boolean)
  const nextSchedSigs = schedule
    .map((row) => `${row.id}|${row.updated_at || ''}|${row.time || ''}|${row.title || ''}`)
    .filter(Boolean)

  const hasLyricBaseline = prevLyricIds.size > 0
  const hasSchedBaseline = prevSchedSigs.size > 0

  if (hasLyricBaseline) {
    const added = lyrics.filter((row) => row.id && !prevLyricIds.has(row.id))
    if (added.length) await notifyNewLyrics(added)
  }

  if (hasSchedBaseline) {
    const changed = schedule.filter((row) => {
      if (!row.id) return false
      const sig = `${row.id}|${row.updated_at || ''}|${row.time || ''}|${row.title || ''}`
      return !prevSchedSigs.has(sig)
    })
    if (changed.length) await notifyScheduleChanges(changed)
  }

  writeJson(PREV_LYRICS_KEY, nextLyricIds)
  writeJson(PREV_SCHED_KEY, nextSchedSigs)
}

export { notificationPermission, notificationsSupported } from './app-notify.js'
