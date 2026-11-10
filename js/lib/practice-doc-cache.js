import { openDb, txDone, PRACTICE_DOC_BLOBS } from './lyrics-store.js'
import { publicDocUrl } from './practice-docs.js'

function guessMime(name = '', fallback = '') {
  const lower = String(name).toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.doc')) return 'application/msword'
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return fallback || 'application/octet-stream'
}

export async function getCachedPracticeDoc(path) {
  if (!path) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PRACTICE_DOC_BLOBS, 'readonly')
    const request = tx.objectStore(PRACTICE_DOC_BLOBS).get(path)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function putCachedPracticeDoc({ path, name, mime, blob, size, url }) {
  if (!path || !blob) return null
  const record = {
    path,
    name: name || 'document',
    mime: mime || blob.type || guessMime(name),
    size: size || blob.size || 0,
    url: url || '',
    blob,
    cached_at: new Date().toISOString(),
  }

  const db = await openDb()
  const tx = db.transaction(PRACTICE_DOC_BLOBS, 'readwrite')
  tx.objectStore(PRACTICE_DOC_BLOBS).put(record)
  await txDone(tx)
  return record
}

export async function removeCachedPracticeDocs(paths = []) {
  const list = (paths || []).map(String).filter(Boolean)
  if (!list.length) return
  const db = await openDb()
  const tx = db.transaction(PRACTICE_DOC_BLOBS, 'readwrite')
  const store = tx.objectStore(PRACTICE_DOC_BLOBS)
  for (const path of list) store.delete(path)
  await txDone(tx)
}

/** Return cached blob, or fetch+cache from network when online. */
export async function ensurePracticeDocCached(doc) {
  const path = String(doc?.path || '')
  if (!path) throw new Error('Missing document path.')

  const existing = await getCachedPracticeDoc(path)
  if (existing?.blob) return existing

  if (!navigator.onLine) {
    throw new Error('This file is not saved offline yet. Connect once to download it.')
  }

  const href = doc.url || publicDocUrl(path)
  if (!href) throw new Error('Document URL is missing.')

  const response = await fetch(href)
  if (!response.ok) throw new Error(`Could not download file (${response.status}).`)

  const raw = await response.blob()
  const mime = doc.mime || raw.type || guessMime(doc.name)
  const blob =
    mime && raw.type !== mime ? new Blob([raw], { type: mime }) : raw
  return putCachedPracticeDoc({
    path,
    name: doc.name || 'document',
    mime,
    blob,
    size: doc.size || blob.size,
    url: href,
  })
}

export async function prefetchPracticeDocs(docs = []) {
  const list = Array.isArray(docs) ? docs : []
  for (const doc of list) {
    if (!doc?.path) continue
    try {
      await ensurePracticeDocCached(doc)
    } catch (error) {
      console.warn('Prefetch practice doc failed:', doc.path, error)
    }
  }
}

export function isPdfDoc(doc) {
  const mime = String(doc?.mime || '').toLowerCase()
  const name = String(doc?.name || doc?.path || '').toLowerCase()
  return mime.includes('pdf') || name.endsWith('.pdf')
}
