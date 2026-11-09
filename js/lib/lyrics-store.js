const DB_NAME = 'crcl-lyrics'
const DB_VERSION = 2
const STORE = 'lyrics'
const QUEUE = 'sync_queue'

const SAMPLE_LYRICS = [
  {
    id: 'sample-1',
    title: 'Amazing Grace',
    artist: 'Traditional',
    key: 'G',
    updated_at: new Date().toISOString(),
    synced: false,
    body: `Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
Was blind, but now I see`,
  },
  {
    id: 'sample-2',
    title: 'How Great Thou Art',
    artist: 'Traditional',
    key: 'A',
    updated_at: new Date().toISOString(),
    synced: false,
    body: `O Lord my God, when I in awesome wonder
Consider all the worlds Thy hands have made
I see the stars, I hear the rolling thunder
Thy power throughout the universe displayed`,
  },
]

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('title', 'title', { unique: false })
        store.createIndex('updated_at', 'updated_at', { unique: false })
      }

      if (!db.objectStoreNames.contains(QUEUE)) {
        db.createObjectStore(QUEUE, { keyPath: 'id', autoIncrement: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'))
  })
}

export async function getAllLyrics() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).getAll()
    request.onsuccess = () => {
      const rows = (request.result || []).filter((row) => !row.deleted)
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getLyricById(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(id)
    request.onsuccess = () => {
      const row = request.result || null
      resolve(row && !row.deleted ? row : null)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveLyrics(lyrics) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  lyrics.forEach((lyric) => store.put(lyric))
  await txDone(tx)
}

export async function saveLyric(lyric) {
  const payload = {
    ...lyric,
    id: lyric.id || (crypto.randomUUID ? crypto.randomUUID() : `song-${Date.now()}`),
    title: (lyric.title || '').trim(),
    artist: (lyric.artist || '').trim(),
    key: (lyric.key || '').trim(),
    body: (lyric.body || '').trim(),
    updated_at: new Date().toISOString(),
    synced: false,
    deleted: false,
  }

  await saveLyrics([payload])
  await enqueueSync({ action: 'upsert', lyricId: payload.id, payload })
  return payload
}

export async function deleteLyric(id) {
  const existing = await getLyricById(id)
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)

  await enqueueSync({
    action: 'delete',
    lyricId: id,
    payload: existing
      ? { ...existing, deleted: true, updated_at: new Date().toISOString() }
      : { id },
  })
}

export async function replaceAllLyrics(lyrics) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
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

  for (const lyric of lyrics) {
    if (pendingIds.has(lyric.id)) continue
    store.put({ ...lyric, synced: true, deleted: false })
  }

  await txDone(tx)
}

export async function markLyricSynced(id) {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
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

export async function enqueueSync(entry) {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).add({
    ...entry,
    created_at: new Date().toISOString(),
  })
  await txDone(tx)
}

export async function getSyncQueue() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readonly')
    const request = tx.objectStore(QUEUE).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export async function removeSyncQueueItem(id) {
  const db = await openDb()
  const tx = db.transaction(QUEUE, 'readwrite')
  tx.objectStore(QUEUE).delete(id)
  await txDone(tx)
}

export async function getPendingSyncCount() {
  const queue = await getSyncQueue()
  return queue.length
}

export async function ensureSeedLyrics(hasRemoteConfig = false) {
  const existing = await getAllLyrics()
  if (existing.length > 0) return existing
  if (hasRemoteConfig) return []

  await saveLyrics(SAMPLE_LYRICS)
  return SAMPLE_LYRICS
}
