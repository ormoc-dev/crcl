import {
  getAllLyrics,
  getLyricById,
  saveLyric,
  deleteLyric,
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
  if (!hasSupabaseConfig()) return 'Local only'
  if (!navigator.onLine) return 'Offline · will sync later'
  return 'Auto sync on'
}

function lockScreen(error = '') {
  return `
    <section class="page store-page">
      <div class="store-top">
        <h1>Store Lyrics</h1>
        <p>Enter password to manage songs.</p>
      </div>

      <form class="store-lock" id="store-lock-form">
        <input
          id="store-password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="Password"
          required
        />
        ${error ? `<p class="form-error">${escapeHtml(error)}</p>` : ''}
        <button type="submit" class="btn btn-primary btn-block">Unlock</button>
      </form>
    </section>
  `
}

function songRow(lyric) {
  const pending = lyric.synced === false ? ' · Syncing' : ''

  return `
    <div class="store-song" data-id="${escapeHtml(lyric.id)}">
      <div class="store-song-copy">
        <strong>${escapeHtml(lyric.title)}</strong>
        <span>${escapeHtml(lyric.artist || 'Unknown')} · ${escapeHtml(lyric.key || '—')}${pending}</span>
      </div>
      <div class="store-song-actions">
        <button type="button" class="btn-text" data-action="edit">Edit</button>
        <button type="button" class="btn-text btn-text-danger" data-action="delete">Delete</button>
      </div>
    </div>
  `
}

function editorForm(lyric = null) {
  return `
    <form class="store-form" id="store-form">
      <input type="hidden" name="id" value="${escapeHtml(lyric?.id || '')}" />

      <input id="song-title" name="title" type="text" required placeholder="Title" value="${escapeHtml(lyric?.title || '')}" />
      <div class="store-form-row">
        <input id="song-artist" name="artist" type="text" placeholder="Artist / Source" value="${escapeHtml(lyric?.artist || '')}" />
        <input id="song-key" name="key" type="text" placeholder="Key" value="${escapeHtml(lyric?.key || '')}" />
      </div>
      <textarea id="song-body" name="body" rows="10" required placeholder="Song lyrics...">${escapeHtml(lyric?.body || '')}</textarea>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${lyric ? 'Save' : 'Add'}</button>
        <button type="button" class="btn btn-ghost" id="store-cancel">Cancel</button>
      </div>
    </form>
  `
}

async function unlockedScreen(mode = 'list', editingId = null, notice = '') {
  const lyrics = (await getAllLyrics()).sort((a, b) => a.title.localeCompare(b.title))
  const editing = editingId ? await getLyricById(editingId) : null
  const pending = await getPendingSyncCount()

  return `
    <section class="page store-page">
      <div class="store-top">
        <div class="store-top-row">
          <h1>Store Lyrics</h1>
          <div class="store-top-actions">
            ${mode === 'list' ? `<button type="button" class="btn btn-primary btn-sm" id="store-add">Add</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" id="store-lock-btn">Lock</button>
          </div>
        </div>
        <div class="store-meta">
          <span class="store-status">${escapeHtml(syncHint())}</span>
          ${pending ? `<span class="sync-pending">${pending} pending</span>` : ''}
          ${notice ? `<span class="sync-notice">${escapeHtml(notice)}</span>` : ''}
        </div>
      </div>

      ${
        mode === 'form'
          ? editorForm(editing)
          : `
            <div class="store-song-list">
              ${
                lyrics.map(songRow).join('') ||
                `<div class="store-empty">No songs yet.<br />Tap Add to save one.</div>`
              }
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
