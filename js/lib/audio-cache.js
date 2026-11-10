import { openDb, txDone, AUDIO_BLOBS } from './lyrics-store.js'
import { publicAudioUrl } from './audio-recordings.js'

export async function getCachedAudio(path) {
  if (!path) return null
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_BLOBS, 'readonly')
    const request = tx.objectStore(AUDIO_BLOBS).get(path)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function putCachedAudio({ path, name, mime, blob, size, url }) {
  if (!path || !blob) return null
  const record = {
    path,
    name: name || 'recording',
    mime: mime || blob.type || 'audio/webm',
    size: size || blob.size || 0,
    url: url || '',
    blob,
    cached_at: new Date().toISOString(),
  }

  const db = await openDb()
  const tx = db.transaction(AUDIO_BLOBS, 'readwrite')
  tx.objectStore(AUDIO_BLOBS).put(record)
  await txDone(tx)
  return record
}

export async function removeCachedAudio(paths = []) {
  const list = (paths || []).map(String).filter(Boolean)
  if (!list.length) return
  const db = await openDb()
  const tx = db.transaction(AUDIO_BLOBS, 'readwrite')
  const store = tx.objectStore(AUDIO_BLOBS)
  for (const path of list) store.delete(path)
  await txDone(tx)
}

/** Return object URL for playback; caches blob offline when online. */
export async function ensureAudioPlayUrl(recording) {
  const path = String(recording?.path || '')
  if (!path) throw new Error('Missing audio path.')

  const cached = await getCachedAudio(path)
  if (cached?.blob) {
    return {
      url: URL.createObjectURL(cached.blob),
      revoke: true,
      offline: true,
    }
  }

  if (!navigator.onLine) {
    throw new Error('This recording is not saved offline yet.')
  }

  const href = recording.url || publicAudioUrl(path)
  if (!href) throw new Error('Audio URL is missing.')

  const response = await fetch(href)
  if (!response.ok) throw new Error(`Could not download audio (${response.status}).`)

  const blob = await response.blob()
  await putCachedAudio({
    path,
    name: recording.title || 'recording',
    mime: recording.mime || blob.type,
    blob,
    size: recording.size || blob.size,
    url: href,
  })

  return {
    url: URL.createObjectURL(blob),
    revoke: true,
    offline: false,
  }
}
