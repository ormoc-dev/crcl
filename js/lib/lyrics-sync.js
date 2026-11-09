import { config } from '../config.js'
import { getSupabase } from './supabase.js'
import {
  getSyncQueue,
  removeSyncQueueItem,
  markLyricSynced,
  replaceAllLyrics,
  getPendingSyncCount,
} from './lyrics-store.js'
import {
  markScheduleSynced,
  replaceAllSchedule,
  ensureScheduleSeeded,
} from './schedule-store.js'
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
  return {
    id: item.id,
    type: item.type === 'practice' ? 'practice' : 'service',
    day: item.day || '',
    title: item.title || '',
    time: item.time || '',
    note: item.note || '',
    updated_at: item.updated_at || new Date().toISOString(),
  }
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
        const { error } = await supabase
          .from('schedule')
          .upsert(toRemoteSchedule(item.payload), { onConflict: 'id' })
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
      .select('id,type,day,title,time,note,updated_at')
      .order('day', { ascending: true }),
  ])

  if (lyricsRes.error) throw lyricsRes.error
  // Schedule table may not exist yet on older projects — keep lyrics sync working
  if (scheduleRes.error && !/relation .*schedule.* does not exist|Could not find the table/i.test(scheduleRes.error.message || '')) {
    throw scheduleRes.error
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

  await replaceAllLyrics(lyricRows)

  let scheduleRows = []
  if (!scheduleRes.error) {
    scheduleRows = (scheduleRes.data || []).map((row) => ({
      id: row.id,
      type: row.type === 'practice' ? 'practice' : 'service',
      day: row.day || '',
      title: row.title || '',
      time: row.time || '',
      note: row.note || '',
      updated_at: row.updated_at,
      synced: true,
      deleted: false,
    }))

    if (scheduleRows.length) {
      await replaceAllSchedule(scheduleRows)
    } else {
      await ensureScheduleSeeded()
    }
  } else {
    await ensureScheduleSeeded()
  }

  try {
    await detectAndNotifySyncChanges({ lyrics: lyricRows, schedule: scheduleRows })
  } catch (error) {
    console.warn('Notify check failed:', error)
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
    await ensureScheduleSeeded()
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
