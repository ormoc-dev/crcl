import { config } from '../config.js'
import { getSupabase } from './supabase.js'
import {
  getSyncQueue,
  removeSyncQueueItem,
  markLyricSynced,
  replaceAllLyrics,
  getAllLyrics,
  getPendingSyncCount,
} from './lyrics-store.js'
import {
  markScheduleSynced,
  replaceAllSchedule,
  ensureScheduleReady,
  getAllSchedule,
  parseSongs,
} from './schedule-store.js'
import { parseDocuments } from './practice-docs.js'
import { pullAudioRecordings } from './audio-recordings.js'
import { detectAndNotifySyncChanges } from './notify-service.js'

let syncing = false
let started = false
let queuedAgain = false

export function hasSupabaseConfig() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey)
}

function toRemoteLyric(lyric) {
  return {
    id: lyric.id,
    title: lyric.title,
    artist: lyric.artist || '',
    key: lyric.key || '',
    body: lyric.body || '',
    updated_at: lyric.updated_at || new Date().toISOString(),
  }
}

function toRemoteSchedule(item) {
  const type = item.type === 'practice' ? 'practice' : 'service'
  return {
    id: item.id,
    type,
    day: item.day || '',
    title: item.title || '',
    time: item.time || '',
    note: item.note || '',
    documents: type === 'practice' ? parseDocuments(item.documents) : [],
    songs: type === 'service' ? parseSongs(item.songs) : [],
    updated_at: item.updated_at || new Date().toISOString(),
  }
}

function stripUnknownScheduleColumns(remote, message = '') {
  let next = { ...remote }
  if (/documents|column/i.test(message)) {
    const { documents: _docs, ...rest } = next
    next = rest
  }
  if (/songs|column/i.test(message)) {
    const { songs: _songs, ...rest } = next
    next = rest
  }
  return next
}

async function pushQueue() {
  const supabase = getSupabase()
  if (!supabase) return { pushed: 0, error: 'missing-config' }

  const queue = await getSyncQueue()
  let pushed = 0

  for (const item of queue) {
    const kind = item.kind === 'schedule' ? 'schedule' : 'lyric'

    if (kind === 'schedule') {
      if (item.action === 'upsert') {
        let remote = toRemoteSchedule(item.payload)
        let { error } = await supabase.from('schedule').upsert(remote, { onConflict: 'id' })
        // Older DBs without documents/songs columns — push the rest so sync isn't stuck
        if (error && /documents|songs|column/i.test(error.message || '')) {
          remote = stripUnknownScheduleColumns(remote, error.message || '')
          ;({ error } = await supabase.from('schedule').upsert(remote, { onConflict: 'id' }))
          if (!error) {
            console.warn(
              'schedule.documents/songs column missing — run supabase/schedule.sql so service songs & practice files sync.',
            )
          }
        }
        if (error) throw error
        await markScheduleSynced(item.scheduleId)
      }

      if (item.action === 'delete') {
        const { error } = await supabase.from('schedule').delete().eq('id', item.scheduleId)
        if (error) throw error
      }
    } else {
      if (item.action === 'upsert') {
        const { error } = await supabase
          .from('lyrics')
          .upsert(toRemoteLyric(item.payload), { onConflict: 'id' })
        if (error) throw error
        await markLyricSynced(item.lyricId)
      }

      if (item.action === 'delete') {
        const { error } = await supabase.from('lyrics').delete().eq('id', item.lyricId)
        if (error) throw error
      }
    }

    await removeSyncQueueItem(item.id)
    pushed += 1
  }

  return { pushed }
}

async function pullRemote() {
  const supabase = getSupabase()
  if (!supabase) return { pulled: 0, error: 'missing-config' }

  const [lyricsRes, scheduleRes] = await Promise.all([
    supabase.from('lyrics').select('id,title,artist,key,body,updated_at').order('title', {
      ascending: true,
    }),
    supabase
      .from('schedule')
      .select('id,type,day,title,time,note,documents,songs,updated_at')
      .order('day', { ascending: true }),
  ])

  if (lyricsRes.error) throw lyricsRes.error

  let scheduleQuery = scheduleRes
  // Older DBs may lack documents/songs columns — fall back without them
  if (
    scheduleQuery.error &&
    /documents|songs|column/i.test(scheduleQuery.error.message || '')
  ) {
    scheduleQuery = await supabase
      .from('schedule')
      .select('id,type,day,title,time,note,updated_at')
      .order('day', { ascending: true })
  }

  // Schedule table may not exist yet on older projects — keep lyrics sync working
  if (
    scheduleQuery.error &&
    !/relation .*schedule.* does not exist|Could not find the table/i.test(
      scheduleQuery.error.message || '',
    )
  ) {
    throw scheduleQuery.error
  }

  const lyricRows = (lyricsRes.data || []).map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist || '',
    key: row.key || '',
    body: row.body || '',
    updated_at: row.updated_at,
    synced: true,
    deleted: false,
  }))

  // Snapshot local state before replace so this device doesn't notify itself
  const localLyrics = await getAllLyrics()
  const localSchedule = await getAllSchedule()
  const knownLyricIds = localLyrics.map((row) => row.id).filter(Boolean)
  const knownSchedSigs = localSchedule
    .map(
      (row) =>
        `${row.id}|${row.updated_at || ''}|${row.time || ''}|${row.title || ''}|${row.day || ''}|${row.type || ''}`,
    )
    .filter(Boolean)

  await replaceAllLyrics(lyricRows)

  let scheduleRows = []
  if (!scheduleQuery.error) {
    scheduleRows = (scheduleQuery.data || []).map((row) => {
      const mapped = {
        id: row.id,
        type: row.type === 'practice' ? 'practice' : 'service',
        day: row.day || '',
        title: row.title || '',
        time: row.time || '',
        note: row.note || '',
        updated_at: row.updated_at,
        synced: true,
        deleted: false,
      }

      // Only set when the column was actually selected
      if (Object.prototype.hasOwnProperty.call(row, 'documents')) {
        mapped.documents = parseDocuments(row.documents)
      }
      if (Object.prototype.hasOwnProperty.call(row, 'songs')) {
        mapped.songs = parseSongs(row.songs)
      }

      return mapped
    })

    // Always mirror remote schedule (empty remote = empty local)
    await replaceAllSchedule(scheduleRows)
  } else {
    await ensureScheduleReady()
  }

  try {
    await detectAndNotifySyncChanges({
      lyrics: lyricRows,
      schedule: scheduleRows,
      knownLyricIds,
      knownSchedSigs,
    })
  } catch (error) {
    console.warn('Notify check failed:', error)
  }

  try {
    await pullAudioRecordings()
  } catch (error) {
    console.warn('Audio sync failed:', error)
  }

  return { pulled: lyricRows.length }
}

export async function syncLyrics() {
  if (!hasSupabaseConfig()) {
    return { ok: false, reason: 'missing-config' }
  }

  if (!navigator.onLine) {
    return { ok: false, reason: 'offline' }
  }

  if (syncing) {
    queuedAgain = true
    return { ok: false, reason: 'busy' }
  }

  syncing = true

  try {
    await ensureScheduleReady()
    const pushed = await pushQueue()
    const pulled = await pullRemote()
    const pending = await getPendingSyncCount()

    const result = {
      ok: true,
      pushed: pushed.pushed || 0,
      pulled: pulled.pulled || 0,
      pending,
    }

    window.dispatchEvent(new CustomEvent('crc-sync', { detail: { status: 'done', ...result } }))
    return result
  } catch (error) {
    console.warn('Lyrics sync failed:', error)
    return { ok: false, reason: 'error', error }
  } finally {
    syncing = false
    if (queuedAgain) {
      queuedAgain = false
      setTimeout(() => {
        syncLyrics()
      }, 300)
    }
  }
}

export function startAutoSync() {
  if (started) return
  started = true

  const run = () => {
    if (navigator.onLine) syncLyrics()
  }

  window.addEventListener('online', run)
  window.addEventListener('focus', run)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run()
  })

  run()
  setInterval(run, 15_000)
}
