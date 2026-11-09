import { DEFAULT_SCHEDULE } from '../data/choir-schedule.js'
import {
  openDb,
  txDone,
  enqueueSync,
  SCHEDULE_STORE,
} from './lyrics-store.js'

const SEED_KEY = 'crc-schedule-seeded'
let seeded = false

function normalizeItem(item) {
  return {
    ...item,
    id: item.id || (crypto.randomUUID ? crypto.randomUUID() : `sched-${Date.now()}`),
    type: item.type === 'practice' ? 'practice' : 'service',
    day: String(item.day || '').trim(),
    title: String(item.title || '').trim(),
    time: String(item.time || '').trim(),
    note: String(item.note || '').trim(),
    updated_at: item.updated_at || new Date().toISOString(),
    synced: item.synced !== false,
    deleted: Boolean(item.deleted),
  }
}

export async function ensureScheduleSeeded() {
  if (seeded || localStorage.getItem(SEED_KEY) === '1') {
    seeded = true
    return
  }

  const existing = await getAllSchedule()
  if (existing.length) {
    localStorage.setItem(SEED_KEY, '1')
    seeded = true
    return
  }

  const db = await openDb()
  const tx = db.transaction(SCHEDULE_STORE, 'readwrite')
  const store = tx.objectStore(SCHEDULE_STORE)
  for (const item of DEFAULT_SCHEDULE) {
    store.put(normalizeItem({ ...item, synced: true, deleted: false }))
  }
  await txDone(tx)
  localStorage.setItem(SEED_KEY, '1')
  seeded = true
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
  await ensureScheduleSeeded()
  const rows = await getAllSchedule()
  return rows
    .filter((row) => row.type === type)
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time) || a.title.localeCompare(b.title))
}

export async function getScheduleItem(id) {
  await ensureScheduleSeeded()
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
  await ensureScheduleSeeded()
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
  await ensureScheduleSeeded()
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

  for (const item of items) {
    if (pendingIds.has(item.id)) continue
    store.put(normalizeItem({ ...item, synced: true, deleted: false }))
  }

  await txDone(tx)
  localStorage.setItem(SEED_KEY, '1')
  seeded = true
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
