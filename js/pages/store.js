import {
  getAllLyrics,
  getLyricById,
  saveLyric,
  deleteLyric,
  getPendingSyncCount,
} from '../lib/lyrics-store.js'
import {
  getScheduleByType,
  getScheduleItem,
  saveScheduleItem,
  deleteScheduleItem,
  ensureScheduleReady,
} from '../lib/schedule-store.js'
import { isStoreUnlocked, unlockStore, lockStore } from '../lib/store-auth.js'
import { hasSupabaseConfig, syncLyrics } from '../lib/lyrics-sync.js'
import { confirmModal } from '../components/confirm-modal.js'

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
        <h1>Manage Choir</h1>
        <p>Password required to edit lyrics, choir service, and practice.</p>
      </div>

      <div class="store-help">
        <p>
          For access, contact the developer, or ask
          <strong>Djen</strong> / <strong>April</strong>.
        </p>
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

function tabsHtml(tab) {
  return `
    <div class="store-tabs" role="tablist" aria-label="Manage choir">
      <button type="button" class="store-tab ${tab === 'lyrics' ? 'is-active' : ''}" data-tab="lyrics">Lyrics</button>
      <button type="button" class="store-tab ${tab === 'service' ? 'is-active' : ''}" data-tab="service">Service</button>
      <button type="button" class="store-tab ${tab === 'practice' ? 'is-active' : ''}" data-tab="practice">Practice</button>
    </div>
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
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${escapeHtml(lyric.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        </button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete" aria-label="Delete ${escapeHtml(lyric.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14" />
            <path d="M9 7V5h6v2" />
            <path d="M8 7l1 13h6l1-13" />
          </svg>
        </button>
      </div>
    </div>
  `
}

function scheduleRow(item) {
  const pending = item.synced === false ? ' · Syncing' : ''

  return `
    <div class="store-song" data-id="${escapeHtml(item.id)}" data-kind="schedule">
      <div class="store-song-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.day)} · ${escapeHtml(item.time || '—')}${pending}</span>
      </div>
      <div class="store-song-actions">
        <button type="button" class="icon-btn" data-action="edit" aria-label="Edit ${escapeHtml(item.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4l10.5-10.5-4-4L4 16v4z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        </button>
        <button type="button" class="icon-btn icon-btn-danger" data-action="delete" aria-label="Delete ${escapeHtml(item.title)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14" />
            <path d="M9 7V5h6v2" />
            <path d="M8 7l1 13h6l1-13" />
          </svg>
        </button>
      </div>
    </div>
  `
}

function lyricEditor(lyric = null) {
  return `
    <form class="store-form" id="store-form" data-kind="lyric">
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

function scheduleEditor(type, item = null) {
  const label = type === 'practice' ? 'practice' : 'service'
  return `
    <form class="store-form" id="store-form" data-kind="schedule" data-type="${escapeHtml(type)}">
      <input type="hidden" name="id" value="${escapeHtml(item?.id || '')}" />
      <input name="day" type="text" required placeholder="Day (e.g. Sunday)" value="${escapeHtml(item?.day || '')}" />
      <input name="title" type="text" required placeholder="Title" value="${escapeHtml(item?.title || '')}" />
      <input name="time" type="text" required placeholder="Time (e.g. 6:00 AM)" value="${escapeHtml(item?.time || '')}" />
      <textarea name="note" rows="3" placeholder="Note (optional)">${escapeHtml(item?.note || '')}</textarea>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">${item ? 'Save' : `Add ${label}`}</button>
        <button type="button" class="btn btn-ghost" id="store-cancel">Cancel</button>
      </div>
    </form>
  `
}

async function unlockedScreen({
  tab = 'lyrics',
  mode = 'list',
  editingId = null,
  notice = '',
} = {}) {
  await ensureScheduleReady()
  const pending = await getPendingSyncCount()
  const addLabel =
    tab === 'lyrics' ? 'Add song' : tab === 'practice' ? 'Add practice' : 'Add service'

  let body = ''
  if (mode === 'form') {
    if (tab === 'lyrics') {
      const editing = editingId ? await getLyricById(editingId) : null
      body = lyricEditor(editing)
    } else {
      const editing = editingId ? await getScheduleItem(editingId) : null
      body = scheduleEditor(tab, editing)
    }
  } else if (tab === 'lyrics') {
    const lyrics = (await getAllLyrics()).sort((a, b) => a.title.localeCompare(b.title))
    body = `
      <div class="store-song-list">
        ${
          lyrics.map(songRow).join('') ||
          `<div class="store-empty">No songs yet.<br />Tap Add to save one.</div>`
        }
      </div>
    `
  } else {
    const items = await getScheduleByType(tab)
    body = `
      <div class="store-song-list">
        ${
          items.map(scheduleRow).join('') ||
          `<div class="store-empty">No ${tab} times yet.<br />Tap Add to create one.</div>`
        }
      </div>
    `
  }

  return `
    <section class="page store-page" data-store-tab="${escapeHtml(tab)}">
      <div class="store-top">
        <div class="store-top-row">
          <h1>Manage Choir</h1>
          <div class="store-top-actions">
            ${mode === 'list' ? `<button type="button" class="btn btn-primary btn-sm" id="store-add">${addLabel}</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" id="store-lock-btn">Lock</button>
          </div>
        </div>
        <div class="store-meta">
          <span class="store-status">${escapeHtml(syncHint())}</span>
          ${pending ? `<span class="sync-pending">${pending} pending</span>` : ''}
          ${notice ? `<span class="sync-notice">${escapeHtml(notice)}</span>` : ''}
        </div>
      </div>

      ${tabsHtml(tab)}
      ${body}
    </section>
  `
}

async function remount(root, options) {
  root.innerHTML = await unlockedScreen(options)
  bindStore(root)
}

export async function renderStore() {
  if (!isStoreUnlocked()) return lockScreen()
  syncLyrics()
  return unlockedScreen({ tab: 'lyrics', mode: 'list' })
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
      await remount(root, { tab: 'lyrics', mode: 'list' })
    })
    return
  }

  const currentTab = root.querySelector('.store-page')?.dataset.storeTab || 'lyrics'

  root.querySelector('#store-lock-btn')?.addEventListener('click', () => {
    lockStore()
    root.innerHTML = lockScreen()
    bindStore(root)
  })

  root.querySelectorAll('.store-tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await remount(root, { tab: btn.dataset.tab || 'lyrics', mode: 'list' })
    })
  })

  root.querySelector('#store-add')?.addEventListener('click', async () => {
    await remount(root, { tab: currentTab, mode: 'form' })
  })

  root.querySelector('#store-cancel')?.addEventListener('click', async () => {
    await remount(root, { tab: currentTab, mode: 'list' })
  })

  root.querySelectorAll('.store-song').forEach((row) => {
    const id = row.dataset.id
    const isSchedule = row.dataset.kind === 'schedule'

    row.querySelector('[data-action="edit"]')?.addEventListener('click', async () => {
      await remount(root, { tab: currentTab, mode: 'form', editingId: id })
    })

    row.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      const title = row.querySelector('strong')?.textContent || 'this item'
      const ok = await confirmModal({
        title: isSchedule ? 'Delete schedule item?' : 'Delete song?',
        message: isSchedule
          ? `Remove "${title}" from the choir schedule?`
          : `Remove "${title}" from the choir lyrics list? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Keep',
        danger: true,
      })
      if (!ok) return

      if (isSchedule) await deleteScheduleItem(id)
      else await deleteLyric(id)
      await syncLyrics()
      await remount(root, {
        tab: currentTab,
        mode: 'list',
        notice: navigator.onLine ? 'Deleted and synced.' : 'Deleted. Will sync when online.',
      })
    })
  })

  const form = root.querySelector('#store-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = new FormData(form)
    const kind = form.dataset.kind

    if (kind === 'schedule') {
      await saveScheduleItem({
        id: String(data.get('id') || '') || undefined,
        type: form.dataset.type === 'practice' ? 'practice' : 'service',
        day: String(data.get('day') || '').trim(),
        title: String(data.get('title') || '').trim(),
        time: String(data.get('time') || '').trim(),
        note: String(data.get('note') || '').trim(),
      })
    } else {
      await saveLyric({
        id: String(data.get('id') || '') || undefined,
        title: String(data.get('title') || '').trim(),
        artist: String(data.get('artist') || '').trim(),
        key: String(data.get('key') || '').trim(),
        body: String(data.get('body') || '').trim(),
      })
    }

    await syncLyrics()
    await remount(root, {
      tab: currentTab,
      mode: 'list',
      notice: navigator.onLine ? 'Saved and synced.' : 'Saved offline. Will sync when online.',
    })
  })
}
