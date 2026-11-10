import { config } from '../config.js'
import { getSupabase } from './supabase.js'
import { openDb, txDone, AUDIO_STORE } from './lyrics-store.js'

export const AUDIO_BUCKET = 'audio-recordings'
export const AUDIO_MAX_BYTES = 30 * 1024 * 1024

export const AUDIO_CATEGORIES = [
  { id: 'soprano', label: 'Soprano' },
  { id: 'alto', label: 'Alto' },
  { id: 'tenor', label: 'Tenor' },
  { id: 'bass', label: 'Bass' },
  { id: 'mixed', label: 'Mixed' },
]

function hasSupabaseConfig() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey)
}

export function isValidAudioCategory(value) {
  return AUDIO_CATEGORIES.some((cat) => cat.id === value)
}

export function categoryLabel(id) {
  return AUDIO_CATEGORIES.find((cat) => cat.id === id)?.label || String(id || 'Audio')
}

export function formatAudioSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function publicAudioUrl(path) {
  const supabase = getSupabase()
  if (!supabase || !path) return ''
  const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

function normalizeRecording(row = {}) {
  const category = String(row.category || '').trim().toLowerCase()
  return {
    id: String(row.id || '').trim(),
    category: isValidAudioCategory(category) ? category : 'mixed',
    title: String(row.title || 'Recording').trim() || 'Recording',
    path: String(row.path || '').trim(),
    mime: String(row.mime || 'audio/webm'),
    size: Number(row.size) || 0,
    url: String(row.url || '').trim(),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    synced: row.synced !== false,
  }
}

export async function getAllAudioRecordings() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_STORE, 'readonly')
    const request = tx.objectStore(AUDIO_STORE).getAll()
    request.onsuccess = () => {
      const rows = (request.result || [])
        .map(normalizeRecording)
        .filter((row) => row.id && row.path)
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      resolve(rows)
    }
    request.onerror = () => reject(request.error)
  })
}

export async function getAudioByCategory(category) {
  const all = await getAllAudioRecordings()
  if (!isValidAudioCategory(category)) return all
  return all.filter((row) => row.category === category)
}

export async function saveAudioRecordingLocal(item) {
  const payload = normalizeRecording(item)
  if (!payload.id || !payload.path) throw new Error('Invalid recording.')

  const db = await openDb()
  const tx = db.transaction(AUDIO_STORE, 'readwrite')
  tx.objectStore(AUDIO_STORE).put(payload)
  await txDone(tx)
  return payload
}

export async function deleteAudioRecordingLocal(id) {
  if (!id) return
  const db = await openDb()
  const tx = db.transaction(AUDIO_STORE, 'readwrite')
  tx.objectStore(AUDIO_STORE).delete(id)
  await txDone(tx)
}

export async function replaceAllAudioRecordings(items = []) {
  const rows = (items || []).map(normalizeRecording).filter((row) => row.id && row.path)
  const db = await openDb()
  const tx = db.transaction(AUDIO_STORE, 'readwrite')
  const store = tx.objectStore(AUDIO_STORE)
  store.clear()
  for (const row of rows) store.put(row)
  await txDone(tx)
  return rows
}

/** Pick best MediaRecorder mime for this phone. */
export function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ]
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported?.(type)) return type
  }
  return ''
}

export function recorderFileExt(mime = '', fileName = '') {
  const name = String(fileName || '').toLowerCase()
  const fromName = name.includes('.') ? name.split('.').pop() : ''
  if (fromName && ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'webm', 'mp4', 'mpeg'].includes(fromName)) {
    return fromName === 'mp4' ? 'm4a' : fromName
  }

  const lower = String(mime).toLowerCase()
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a'
  if (lower.includes('ogg')) return 'ogg'
  if (lower.includes('wav')) return 'wav'
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3'
  return 'webm'
}

export const AUDIO_ACCEPT =
  'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.webm,.mpeg,.mp4'

const ALLOWED_AUDIO_EXT = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'webm', 'mpeg', 'mp4'])

export function validateAudioFile(file) {
  if (!file) return 'Missing audio file.'
  if (file.size > AUDIO_MAX_BYTES) return `"${file.name}" is over 30 MB.`
  const ext = String(file.name || '')
    .toLowerCase()
    .split('.')
    .pop()
  const mime = String(file.type || '').toLowerCase()
  const okExt = ALLOWED_AUDIO_EXT.has(ext)
  const okMime = !mime || mime.startsWith('audio/') || mime === 'application/octet-stream'
  if (!okExt && !okMime) {
    return `"${file.name}" must be an audio file (mp3, m4a, wav, ogg, webm).`
  }
  return ''
}

export async function uploadAudioRecording({ category, title, blob, mime, fileName = '' }) {
  if (!isValidAudioCategory(category)) {
    throw new Error('Choose a voice part first (Soprano, Alto, Tenor, Bass, or Mixed).')
  }
  if (!blob || !blob.size) throw new Error('Nothing was recorded.')
  if (blob.size > AUDIO_MAX_BYTES) throw new Error('Recording is over 30 MB.')
  if (!hasSupabaseConfig()) {
    throw new Error('Audio upload needs Supabase. Check js/config.js.')
  }
  if (!navigator.onLine) {
    throw new Error('Connect to the internet to save this recording.')
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')

  const id = crypto.randomUUID ? crypto.randomUUID() : `audio-${Date.now()}`
  const safeTitle = String(title || 'Recording')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Recording'
  const contentType = mime || blob.type || 'audio/webm'
  const ext = recorderFileExt(contentType, fileName)
  const path = `${category}/${id}-${safeTitle}.${ext}`

  const { error: uploadError } = await supabase.storage.from(AUDIO_BUCKET).upload(path, blob, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  })
  if (uploadError) throw uploadError

  const url = publicAudioUrl(path)
  const now = new Date().toISOString()
  const row = {
    id,
    category,
    title: String(title || 'Recording').trim() || 'Recording',
    path,
    mime: contentType,
    size: blob.size,
    url,
    created_at: now,
    updated_at: now,
  }

  const { error: dbError } = await supabase.from('audio_recordings').upsert(row, {
    onConflict: 'id',
  })
  if (dbError) {
    // Clean up orphaned file if table insert fails
    await supabase.storage.from(AUDIO_BUCKET).remove([path]).catch(() => {})
    throw new Error(dbError.message || 'Could not save recording metadata.')
  }

  const local = await saveAudioRecordingLocal({ ...row, synced: true })
  return { ...local, blob }
}

export async function deleteAudioRecording(recording) {
  const id = recording?.id
  const path = recording?.path
  if (!id) return

  await deleteAudioRecordingLocal(id)

  if (!hasSupabaseConfig() || !navigator.onLine) return

  const supabase = getSupabase()
  if (!supabase) return

  if (path) {
    const { error: storageError } = await supabase.storage.from(AUDIO_BUCKET).remove([path])
    if (storageError) console.warn('Audio file delete failed:', storageError)
  }

  const { error } = await supabase.from('audio_recordings').delete().eq('id', id)
  if (error) console.warn('Audio row delete failed:', error)
}

export async function pullAudioRecordings() {
  if (!hasSupabaseConfig() || !navigator.onLine) {
    return getAllAudioRecordings()
  }

  const supabase = getSupabase()
  if (!supabase) return getAllAudioRecordings()

  const { data, error } = await supabase
    .from('audio_recordings')
    .select('id,category,title,path,mime,size,url,created_at,updated_at')
    .order('updated_at', { ascending: false })

  if (error) {
    if (/audio_recordings|schema cache|does not exist/i.test(error.message || '')) {
      console.warn('Run supabase/audio-recordings.sql to enable choir audio.')
      return getAllAudioRecordings()
    }
    throw error
  }

  return replaceAllAudioRecordings(
    (data || []).map((row) => ({
      ...row,
      url: row.url || publicAudioUrl(row.path),
      synced: true,
    })),
  )
}
