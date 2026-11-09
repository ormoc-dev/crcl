import {
  getAllLyrics,
  getLyricById,
  saveLyric,
  deleteLyric,
  ensureSeedLyrics,
  getPendingSyncCount,
} from '../lib/lyrics-store.js'
import { isStoreUnlocked, unlockStore, lockStore } from '../lib/store-auth.js'
import { hasSupabaseConfig, syncLyrics } from '../lib/lyrics-sync.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function syncHint() {
  if (!hasSupabaseConfig()) {
    return 'Supabase is not configured yet. Songs stay on this device only.'
  }

  if (!navigator.onLine) {
    return 'Offline — saved here now, uploads automatically when back online.'
  }

  return 'Auto sync is on — saves upload to Supabase for other devices.'
}

function lockScreen(error = '') {
  return `
    <section class="page store-page">
      <div class="page-head">
        <h1>Store Lyrics</h1>
        <p>Enter the choir password to add or edit songs.</p>
      </div>

      <form class="store-lock" id="store-lock-form">
        <label for="store-password">Password</label>
        <input
          id="store-password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter password"
          required
        />
        ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ''}
        <button type="submit" class="btn btn-primary">Unlock</button>
      </form>
    </section>
  `
}

function songRow(lyric) {
  const pending = lyric.synced === false ? ' · Syncing…' : ''

  return `
    <div class="store-song" data-id="${escapeHtml(lyric.id)}">
      <div>
        <strong>${escapeHtml(lyric.title)}</strong>
        <span>${escapeHtml(lyric.artist || 'Unknown')} · Key ${escapeHtml(lyric.key || '—')}${pending}</span>
      </div>
      <div class="store-song-actions">
        <button type="button" class="btn btn-ghost" data-action="edit">Edit</button>
        <button type="button" class="btn btn-danger" data-action="delete">Delete</button>
      </div>
    </div>
  `
}

function editorForm(lyric = null) {
  return `
    <form class="store-form" id="store-form">
      <input type="hidden" name="id" value="${escapeHtml(lyric?.id || '')}" />

      <label for="song-title">Title</label>
      <input id="song-title" name="title" type="text" required value="${escapeHtml(lyric?.title || '')}" />

      <label for="song-artist">Artist / Source</label>
      <input id="song-artist" name="artist" type="text" value="${escapeHtml(lyric?.artist || '')}" />

      <label for="song-key">Key</label>
      <input id="song-key" name="key" type="text" value="${escapeHtml(lyric?.key || '')}" placeholder="e.g. G" />

      <label for="song-body">Lyrics</label>
      <textarea id="song-body" name="body" rows="12" required placeholder="Paste or type the song lyrics...">${escapeHtml(lyric?.body || '')}</textarea>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${lyric ? 'Save changes' : 'Add song'}</button>
        <button type="button" class="btn btn-ghost" id="store-cancel">Cancel</button>
      </div>
    </form>
  `
}

async function unlockedScreen(mode = 'list', editingId = null, notice = '') {
  await ensureSeedLyrics(hasSupabaseConfig())
  const lyrics = (await getAllLyrics()).sort((a, b) => a.title.localeCompare(b.title))
  const editing = editingId ? await getLyricById(editingId) : null
  const pending = await getPendingSyncCount()

  return `
    <section class="page store-page">
      <div class="page-head store-head">
        <div>
          <h1>Store Lyrics</h1>
          <p>${escapeHtml(syncHint())}</p>
          ${pending ? `<p class="sync-pending">${pending} change(s) syncing automatically…</p>` : ''}
          ${notice ? `<p class="sync-notice">${escapeHtml(notice)}</p>` : ''}
        </div>
        <button type="button" class="btn btn-ghost" id="store-lock-btn">Lock</button>
      </div>

      ${
        mode === 'form'
          ? editorForm(editing)
          : `
            <div class="form-actions store-toolbar">
              <button type="button" class="btn btn-primary" id="store-add">Add song</button>
            </div>
            <div class="store-song-list">
              ${lyrics.map(songRow).join('') || '<p class="empty-state">No songs stored yet.</p>'}
            </div>
          `
      }
    </section>
  `
}

async function saveAndSync(lyricInput) {
  const saved = await saveLyric(lyricInput)
  const result = await syncLyrics()
  return { saved, result }
}

export async function renderStore() {
  if (!isStoreUnlocked()) return lockScreen()
  syncLyrics()
  return unlockedScreen('list')
}

export function bindStore(root) {
  const lockForm = root.querySelector('#store-lock-form')
  if (lockForm) {
    lockForm.addEventListener('submit', async (event) => {
      event.preventDefault()
      const password = new FormData(lockForm).get('password')
      if (!unlockStore(String(password || ''))) {
        root.innerHTML = lockScreen('Incorrect password.')
        bindStore(root)
        root.querySelector('#store-password')?.focus()
        return
      }
      syncLyrics()
      root.innerHTML = await unlockedScreen('list')
      bindStore(root)
    })
    return
  }

  root.querySelector('#store-lock-btn')?.addEventListener('click', () => {
    lockStore()
    root.innerHTML = lockScreen()
    bindStore(root)
  })

  root.querySelector('#store-add')?.addEventListener('click', async () => {
    root.innerHTML = await unlockedScreen('form')
    bindStore(root)
  })

  root.querySelector('#store-cancel')?.addEventListener('click', async () => {
    root.innerHTML = await unlockedScreen('list')
    bindStore(root)
  })

  root.querySelectorAll('.store-song').forEach((row) => {
    const id = row.dataset.id

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      root.innerHTML = await unlockedScreen('form', id)
      bindStore(root)
    })

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const title = row.querySelector('strong')?.textContent || 'this song'
      if (!confirm(`Delete "${title}"?`)) return
      await deleteLyric(id)
      await syncLyrics()
      root.innerHTML = await unlockedScreen(
        'list',
        null,
        navigator.onLine ? 'Song deleted and synced.' : 'Song deleted. Will sync when online.',
      )
      bindStore(root)
    })
  })

  const form = root.querySelector('#store-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)

    await saveAndSync({
      id: String(data.get('id') || '') || undefined,
      title: String(data.get('title') || '').trim(),
      artist: String(data.get('artist') || '').trim(),
      key: String(data.get('key') || '').trim(),
      body: String(data.get('body') || '').trim(),
    })

    root.innerHTML = await unlockedScreen(
      'list',
      null,
      navigator.onLine ? 'Song saved and synced.' : 'Song saved offline. Will sync when online.',
    )
    bindStore(root)
  })
}
