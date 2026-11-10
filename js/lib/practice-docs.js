import { config } from '../config.js'
import { getSupabase } from './supabase.js'

function hasSupabaseConfig() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey)
}

export const PRACTICE_DOCS_BUCKET = 'practice-docs'
export const PRACTICE_DOC_MAX_BYTES = 20 * 1024 * 1024

const ALLOWED_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx'])

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
])

export const PRACTICE_DOC_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Accept arrays, JSON strings, or null from Supabase / IndexedDB. */
export function parseDocuments(raw) {
  if (raw == null || raw === '') return []
  if (typeof raw === 'string') {
    try {
      return normalizeDocuments(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return normalizeDocuments(raw)
}

export function normalizeDocuments(docs) {
  if (!Array.isArray(docs)) return []
  return docs
    .map((doc) => {
      const path = String(doc?.path || doc?.storagePath || '').trim()
      const id =
        String(doc?.id || '').trim() ||
        (path ? path.split('/').pop()?.replace(/^[^-]+-/, '') || path : '')
      return {
        id,
        name: String(doc?.name || doc?.fileName || 'document').trim() || 'document',
        path,
        size: Number(doc?.size) || 0,
        mime: String(doc?.mime || doc?.type || ''),
        url: String(doc?.url || '').trim(),
      }
    })
    .filter((doc) => doc.path)
}

export function formatDocSize(bytes) {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function fileExt(name) {
  const parts = String(name || '').toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

function safeFileName(name) {
  return String(name || 'document')
    .replace(/[^\w.\-()+ ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'document'
}

export function validatePracticeFile(file) {
  if (!file) return 'Missing file.'
  const ext = fileExt(file.name)
  if (!ALLOWED_EXT.has(ext)) {
    return `"${file.name}" must be PDF, Word, or Excel.`
  }
  if (file.size > PRACTICE_DOC_MAX_BYTES) {
    return `"${file.name}" is over 20 MB.`
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    // Some browsers report empty or odd MIME for Office files — allow by extension.
    if (!['doc', 'docx', 'xls', 'xlsx', 'pdf'].includes(ext)) {
      return `"${file.name}" type is not allowed.`
    }
  }
  return ''
}

export function publicDocUrl(path) {
  const supabase = getSupabase()
  if (!supabase || !path) return ''
  const { data } = supabase.storage.from(PRACTICE_DOCS_BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

export async function uploadPracticeFiles(scheduleId, files) {
  if (!files?.length) return []
  if (!hasSupabaseConfig()) {
    throw new Error('Document upload needs Supabase. Check js/config.js.')
  }
  if (!navigator.onLine) {
    throw new Error('Connect to the internet to upload documents.')
  }

  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase is not configured.')

  const uploaded = []

  for (const file of files) {
    const err = validatePracticeFile(file)
    if (err) throw new Error(err)

    const id = crypto.randomUUID ? crypto.randomUUID() : `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const path = `${scheduleId}/${id}-${safeFileName(file.name)}`

    const { error } = await supabase.storage.from(PRACTICE_DOCS_BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    })
    if (error) throw error

    uploaded.push({
      id,
      name: file.name,
      path,
      size: file.size,
      mime: file.type || '',
      url: publicDocUrl(path),
    })
  }

  return uploaded
}

export async function deletePracticeDocPaths(paths) {
  const list = (paths || []).map(String).filter(Boolean)
  if (!list.length || !hasSupabaseConfig() || !navigator.onLine) return

  const supabase = getSupabase()
  if (!supabase) return

  const { error } = await supabase.storage.from(PRACTICE_DOCS_BUCKET).remove(list)
  if (error) console.warn('Practice doc delete failed:', error)
}

/**
 * Recover files from storage when schedule.documents was wiped
 * (e.g. older DB without the documents column).
 */
export async function listPracticeDocsForSchedule(scheduleId) {
  if (!scheduleId || !hasSupabaseConfig() || !navigator.onLine) return []

  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase.storage.from(PRACTICE_DOCS_BUCKET).list(String(scheduleId), {
    limit: 100,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error || !Array.isArray(data)) {
    if (error) console.warn('Practice doc list failed:', error)
    return []
  }

  return data
    .filter((entry) => entry?.name && !entry.name.endsWith('/'))
    .map((entry) => {
      const path = `${scheduleId}/${entry.name}`
      const idMatch = String(entry.name).match(/^([0-9a-f-]{36})-/i)
      const prettyName = String(entry.name).replace(/^[0-9a-f-]{36}-/i, '') || entry.name
      return {
        id: idMatch?.[1] || entry.id || entry.name,
        name: prettyName,
        path,
        size: Number(entry.metadata?.size) || 0,
        mime: String(entry.metadata?.mimetype || ''),
        url: publicDocUrl(path),
      }
    })
    .filter((doc) => doc.path)
}
