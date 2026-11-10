import {
  openDb,
  txDone,
  enqueueSync,
  SCHEDULE_STORE,
} from './lyrics-store.js'
import { parseDocuments } from './practice-docs.js'

/** Placeholder IDs that used to be auto-seeded — remove from devices once. */
const BUILTIN_SCHEDULE_IDS = new Set([
  'svc-sunday-6am',
  'svc-sunday-8am',
  'svc-special',
  'prac-saturday',
])

/** True when day is stored as YYYY-MM-DD. */
export function isScheduleDate(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(day || '').trim())
}

/** Value for <input type="date"> (blank for legacy text days). */
export function toDateInputValue(day) {
  const value = String(day || '').trim()
  return isScheduleDate(value) ? value : ''
}

/** Short label for schedule cards (e.g. SUN or legacy text). */
export function formatScheduleDayShort(day) {
  const value = String(day || '').trim()
  if (!value) return '—'
  if (!isScheduleDate(value)) return value
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
  } catch {
    return value
  }
}

/** Longer label for lists/notes (e.g. Sunday, Mar 10). */
export function formatScheduleDayLong(day) {
  const value = String(day || '').trim()
  if (!value) return '—'
  if (!isScheduleDate(value)) return value
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

/** Linked choir songs on a service (id + display fields). */
export function parseSongs(raw) {
  if (raw == null || raw === '') return []
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []

  const seen = new Set()
  return list
    .map((song) => ({
      id: String(song?.id || '').trim(),
      title: String(song?.title || 'Untitled').trim() || 'Untitled',
      artist: String(song?.artist || '').trim(),
      key: String(song?.key || '').trim(),
    }))
    .filter((song) => {
      if (!song.id || seen.has(song.id)) return false
      seen.add(song.id)
      return true
    })
}

function normalizeItem(item) {
  const type = item.type === 'practice' ? 'practice' : 'service'
  return {
    ...item,
    id: item.id || (crypto.randomUUID ? crypto.randomUUID() : `sched-${Date.now()}`),
    type,
    day: String(item.day || '').trim(),
    title: String(item.title || '').trim(),
    time: String(item.time || '').trim(),
    note: String(item.note || '').trim(),
    documents: type === 'practice' ? parseDocuments(item.documents) : [],
    songs: type === 'service' ? parseSongs(item.songs) : [],
    updated_at: item.updated_at || new Date().toISOString(),
    synced: item.synced !== false,
    deleted: Boolean(item.deleted),
  }
}

/** No built-in schedule — starts empty until Manage Choir adds items. */
export async function ensureScheduleReady() {
  await openDb()
}

export async function getAllSchedule() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEDULE_STORE, 'readonly')
    const request = tx.objectStore(SCHEDULE_STORE).getAll()
    request.onsuccess = () => {
      const rows = (request.result || []).filter((row) => !row.deleted)
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getScheduleByType(type) {
  await ensureScheduleReady()
  const rows = await getAllSchedule()
  return rows
    .filter((row) => row.type === type)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.time.localeCompare(b.time) ||
        a.title.localeCompare(b.title),
    )
}

export async function getScheduleItem(id) {
  await ensureScheduleReady()
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCHEDULE_STORE, 'readonly')
    const request = tx.objectStore(SCHEDULE_STORE).get(id)
    request.onsuccess = () => {
      const row = request.result || null
      resolve(row && !row.deleted ? row : null)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveScheduleItem(item) {
  await ensureScheduleReady()
  const payload = normalizeItem({
    ...item,
    updated_at: new Date().toISOString(),
    synced: false,
    deleted: false,
  })

  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  tx.objectStore(SCHEDULE_STORE).put(payload)
  await txDone(tx)

  await enqueueSync({
    action: 'upsert',
    kind: 'schedule',
    scheduleId: payload.id,
    payload,
  })

  return payload
}

export async function deleteScheduleItem(id) {
  await ensureScheduleReady()
  const existing = await getScheduleItem(id)
  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  tx.objectStore(SCHEDULE_STORE).delete(id)
  await txDone(tx)

  await enqueueSync({
    action: 'delete',
    kind: 'schedule',
    scheduleId: id,
    payload: existing
      ? { ...existing, deleted: true, updated_at: new Date().toISOString() }
      : { id },
  })
}

export async function replaceAllSchedule(items) {
  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  const store = tx.objectStore(SCHEDULE_STORE)
  const existing = await new Promise((resolve, reject) => {
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })

  const pendingIds = new Set(
    existing.filter((row) => row.synced === false && !row.deleted).map((row) => row.id),
  )

  for (const row of existing) {
    if (!pendingIds.has(row.id)) store.delete(row.id)
  }

  const localById = new Map(existing.map((row) => [row.id, row]))

  for (const item of items) {
    if (pendingIds.has(item.id)) continue

    // If remote omitted documents/songs (old schema), keep local values
    const local = localById.get(item.id)
    const merged = { ...item }
    if (item.documents === undefined && local) {
      merged.documents = local.documents || []
    }
    if (item.songs === undefined && local) {
      merged.songs = local.songs || []
    }

    store.put(normalizeItem({ ...merged, synced: true, deleted: false }))
  }

  await txDone(tx)
}

export async function markScheduleSynced(id) {
  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  const store = tx.objectStore(SCHEDULE_STORE)
  const current = await new Promise((resolve, reject) => {
    const request = store.get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })

  if (current) {
    store.put({ ...current, synced: true, deleted: false })
  }

  await txDone(tx)
}

/** Remove old placeholder schedule rows that were auto-seeded. */
export async function removeBuiltInScheduleSamples() {
  const existing = await getAllSchedule()
  const doomed = existing.filter((row) => BUILTIN_SCHEDULE_IDS.has(row.id))
  if (!doomed.length) return existing

  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  const store = tx.objectStore(SCHEDULE_STORE)
  for (const row of doomed) {
    store.delete(row.id)
    // Also queue cloud delete so deploy/sync doesn't keep them
  }
  await txDone(tx)

  for (const row of doomed) {
    await enqueueSync({
      action: 'delete',
      kind: 'schedule',
      scheduleId: row.id,
      payload: { ...row, deleted: true, updated_at: new Date().toISOString() },
    })
  }

  try {
    localStorage.removeItem('crc-schedule-seeded')
  } catch {
    /* ignore */
  }

  return getAllSchedule()
}

/** @deprecated use ensureScheduleReady */
export const ensureScheduleSeeded = ensureScheduleReady
