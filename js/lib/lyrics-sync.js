import { config } from '../config.js'
import { getSupabase } from './supabase.js'
import {
  getSyncQueue,
  removeSyncQueueItem,
  markLyricSynced,
  replaceAllLyrics,
  getPendingSyncCount,
} from './lyrics-store.js'

let syncing = false
let started = false
let queuedAgain = false

export function hasSupabaseConfig() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey)
}

function toRemoteRow(lyric) {
  return {
    id: lyric.id,
    title: lyric.title,
    artist: lyric.artist || '',
    key: lyric.key || '',
    body: lyric.body || '',
    updated_at: lyric.updated_at || new Date().toISOString(),
  }
}

async function pushQueue() {
  const supabase = getSupabase()
  if (!supabase) return { pushed: 0, error: 'missing-config' }

  const queue = await getSyncQueue()
  let pushed = 0

  for (const item of queue) {
    if (item.action === 'upsert') {
      const { error } = await supabase
        .from('lyrics')
        .upsert(toRemoteRow(item.payload), { onConflict: 'id' })

      if (error) throw error
      await markLyricSynced(item.lyricId)
    }

    if (item.action === 'delete') {
      const { error } = await supabase.from('lyrics').delete().eq('id', item.lyricId)
      if (error) throw error
    }

    await removeSyncQueueItem(item.id)
    pushed += 1
  }

  return { pushed }
}

async function pullRemote() {
  const supabase = getSupabase()
  if (!supabase) return { pulled: 0, error: 'missing-config' }

  const { data, error } = await supabase
    .from('lyrics')
    .select('id,title,artist,key,body,updated_at')
    .order('title', { ascending: true })

  if (error) throw error

  const rows = (data || []).map((row) => ({
    id: row.id,
    title: row.title,
    artist: row.artist || '',
    key: row.key || '',
    body: row.body || '',
    updated_at: row.updated_at,
    synced: true,
    deleted: false,
  }))

  await replaceAllLyrics(rows)
  return { pulled: rows.length }
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
    const pushed = await pushQueue()
    const pulled = await pullRemote()
    const pending = await getPendingSyncCount()

    const result = {
      ok: true,
      pushed: pushed.pushed || 0,
      pulled: pulled.pulled || 0,
      pending,
    }

    // Notify UI quietly — listeners must not remount the whole page
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

  // Immediate + frequent background sync so other devices stay updated
  run()
  setInterval(run, 15_000)
}
