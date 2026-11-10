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
  formatScheduleDayLong,
  parseSongs,
  toDateInputValue,
} from '../lib/schedule-store.js'
import { isStoreUnlocked, unlockStore, lockStore } from '../lib/store-auth.js'
import { hasSupabaseConfig, syncLyrics } from '../lib/lyrics-sync.js'
import { confirmModal } from '../components/confirm-modal.js'
import {
  PRACTICE_DOC_ACCEPT,
  deletePracticeDocPaths,
  formatDocSize,
  normalizeDocuments,
  parseDocuments,
  publicDocUrl,
  uploadPracticeFiles,
  validatePracticeFile,
} from '../lib/practice-docs.js'
import {
  putCachedPracticeDoc,
  removeCachedPracticeDocs,
} from '../lib/practice-doc-cache.js'
import { dispatchChoirPush } from '../lib/push-service.js'

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
  const docs = item.type === 'practice' ? parseDocuments(item.documents) : []
  const songs = item.type === 'service' ? parseSongs(item.songs) : []
  const docsHint = docs.length ? ` · ${docs.length} file${docs.length === 1 ? '' : 's'}` : ''
  const songsHint = songs.length ? ` · ${songs.length} song${songs.length === 1 ? '' : 's'}` : ''

  return `
    <div class="store-song" data-id="${escapeHtml(item.id)}" data-kind="schedule">
      <div class="store-song-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(formatScheduleDayLong(item.day))} · ${escapeHtml(item.time || '—')}${songsHint}${docsHint}${pending}</span>
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

function practiceDocsEditor(item = null) {
  const docs = parseDocuments(item?.documents)
  const rows =
    docs
      .map(
        (doc) => `
      <div class="practice-doc-row" data-doc-id="${escapeHtml(doc.id)}" data-doc-path="${escapeHtml(doc.path)}" data-doc-name="${escapeHtml(doc.name)}" data-doc-size="${escapeHtml(String(doc.size || 0))}" data-doc-mime="${escapeHtml(doc.mime || '')}" data-doc-url="${escapeHtml(doc.url || publicDocUrl(doc.path))}">
        <div class="practice-doc-copy">
          <strong>${escapeHtml(doc.name)}</strong>
          <span>${escapeHtml(formatDocSize(doc.size))}</span>
        </div>
        <button type="button" class="icon-btn icon-btn-danger" data-action="remove-doc" aria-label="Remove ${escapeHtml(doc.name)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 7h14" />
            <path d="M9 7V5h6v2" />
            <path d="M8 7l1 13h6l1-13" />
          </svg>
        </button>
      </div>`,
      )
      .join('') || `<p class="practice-docs-empty">No documents yet.</p>`

  return `
    <div class="practice-docs" id="practice-docs">
      <div class="practice-docs-head">
        <span>Practice documents</span>
        <span>Optional</span>
      </div>
      <div class="practice-docs-list" id="practice-docs-existing">${rows}</div>
      <div class="practice-docs-pending" id="practice-docs-pending" hidden></div>
      <label class="practice-docs-dropzone" for="practice-docs-input">
        <input type="file" id="practice-docs-input" multiple accept="${PRACTICE_DOC_ACCEPT}" />
        <span class="practice-docs-dropzone-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 16V7" />
            <path d="M8.5 10.5 12 7l3.5 3.5" />
            <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" />
          </svg>
        </span>
        <span class="practice-docs-dropzone-copy">
          <strong>Add practice files</strong>
          <span>PDF, Word, or Excel · up to 20 MB each</span>
        </span>
      </label>
      <p class="form-error" id="practice-docs-error" hidden></p>
    </div>
  `
}

function serviceSongRow(song) {
  return `
    <div
      class="service-song-row"
      data-song-id="${escapeHtml(song.id)}"
      data-song-title="${escapeHtml(song.title)}"
      data-song-artist="${escapeHtml(song.artist || '')}"
      data-song-key="${escapeHtml(song.key || '')}"
    >
      <div class="service-song-copy">
        <strong>${escapeHtml(song.title)}</strong>
        <span>${escapeHtml(song.artist || 'Unknown')}${song.key ? ` · Key ${escapeHtml(song.key)}` : ''}</span>
      </div>
      <button type="button" class="icon-btn icon-btn-danger" data-action="remove-song" aria-label="Remove ${escapeHtml(song.title)}">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l1 13h6l1-13" />
        </svg>
      </button>
    </div>`
}

function serviceSongsEditor(item = null, lyrics = []) {
  const selected = parseSongs(item?.songs)
  const catalog = lyrics
    .filter((lyric) => lyric.id)
    .map((lyric) => ({
      id: lyric.id,
      title: lyric.title || 'Untitled',
      artist: lyric.artist || '',
      key: lyric.key || '',
    }))

  return `
    <div class="service-songs" id="service-songs">
      <div class="service-songs-head">
        <span>Service songs</span>
        <span>Search & add from library</span>
      </div>
      <div class="service-songs-list" id="service-songs-list">
        ${
          selected.map(serviceSongRow).join('') ||
          `<p class="service-songs-empty">No songs linked yet.</p>`
        }
      </div>
      <div class="service-songs-picker">
        <input
          type="search"
          id="service-songs-search"
          placeholder="Search songs by title, artist, or key…"
          autocomplete="off"
          enterkeyhint="search"
        />
        <div class="service-songs-results" id="service-songs-results" hidden></div>
      </div>
      <script type="application/json" id="service-songs-catalog">${JSON.stringify(catalog).replace(/</g, '\\u003c')}</script>
    </div>
  `
}

async function scheduleEditor(type, item = null) {
  const label = type === 'practice' ? 'practice' : 'service'
  const lyrics =
    type === 'service'
      ? (await getAllLyrics()).sort((a, b) => a.title.localeCompare(b.title))
      : []

  const dayValue = toDateInputValue(item?.day)
  const legacyDay = item?.day && !dayValue ? String(item.day) : ''

  return `
    <form class="store-form" id="store-form" data-kind="schedule" data-type="${escapeHtml(type)}">
      <input type="hidden" name="id" value="${escapeHtml(item?.id || '')}" />
      <label class="store-date-field">
        <span class="store-date-label">Date</span>
        <span class="store-date-control">
          <button type="button" class="store-date-icon" id="store-date-picker-btn" aria-label="Open calendar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18" />
              <path d="M8 3v4" />
              <path d="M16 3v4" />
            </svg>
          </button>
          <input
            name="day"
            id="store-day-input"
            type="date"
            required
            value="${escapeHtml(dayValue)}"
          />
        </span>
        ${
          legacyDay
            ? `<span class="store-date-hint">Was “${escapeHtml(legacyDay)}” — pick a date to update.</span>`
            : ''
        }
      </label>
      <input name="title" type="text" required placeholder="Title" value="${escapeHtml(item?.title || '')}" />
      <input name="time" type="text" required placeholder="Time (e.g. 6:00 AM)" value="${escapeHtml(item?.time || '')}" />
      <textarea name="note" rows="3" placeholder="Note (optional)">${escapeHtml(item?.note || '')}</textarea>
      ${type === 'service' ? serviceSongsEditor(item, lyrics) : ''}
      ${type === 'practice' ? practiceDocsEditor(item) : ''}
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
      body = await scheduleEditor(tab, editing)
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

      if (isSchedule) {
        const existing = await getScheduleItem(id)
        const paths = parseDocuments(existing?.documents).map((doc) => doc.path)
        await deleteScheduleItem(id)
        await deletePracticeDocPaths(paths)
        await removeCachedPracticeDocs(paths)
      } else {
        await deleteLyric(id)
      }
      await syncLyrics()
      await remount(root, {
        tab: currentTab,
        mode: 'list',
        notice: navigator.onLine ? 'Deleted and synced.' : 'Deleted. Will sync when online.',
      })
    })
  })

  const form = root.querySelector('#store-form')
  if (form) {
    const pendingFiles = []
    const removedPaths = []
    const pendingHost = form.querySelector('#practice-docs-pending')
    const errorEl = form.querySelector('#practice-docs-error')
    const submitBtn = form.querySelector('button[type="submit"]')
    const dayInput = form.querySelector('#store-day-input')
    const songsList = form.querySelector('#service-songs-list')
    const songsSearch = form.querySelector('#service-songs-search')
    const songsResults = form.querySelector('#service-songs-results')
    const catalogEl = form.querySelector('#service-songs-catalog')

    form.querySelector('#store-date-picker-btn')?.addEventListener('click', () => {
      if (!dayInput) return
      if (typeof dayInput.showPicker === 'function') {
        try {
          dayInput.showPicker()
          return
        } catch {
          /* fall through */
        }
      }
      dayInput.focus()
      dayInput.click()
    })

    let songCatalog = []
    try {
      songCatalog = JSON.parse(catalogEl?.textContent || '[]')
      if (!Array.isArray(songCatalog)) songCatalog = []
    } catch {
      songCatalog = []
    }

    function selectedSongIds() {
      return new Set(
        Array.from(form.querySelectorAll('#service-songs-list .service-song-row')).map(
          (row) => row.dataset.songId || '',
        ),
      )
    }

    function refreshSongsEmpty() {
      if (!songsList) return
      if (!songsList.querySelector('.service-song-row')) {
        songsList.innerHTML = `<p class="service-songs-empty">No songs linked yet.</p>`
      }
    }

    function renderSongResults(query = '') {
      if (!songsResults) return
      const q = String(query || '').trim().toLowerCase()
      const taken = selectedSongIds()
      const matches = songCatalog
        .filter((song) => song.id && !taken.has(song.id))
        .filter((song) => {
          if (!q) return true
          const hay = `${song.title} ${song.artist} ${song.key}`.toLowerCase()
          return hay.includes(q)
        })
        .slice(0, 12)

      if (!q) {
        songsResults.hidden = true
        songsResults.innerHTML = ''
        return
      }

      songsResults.hidden = false
      if (!matches.length) {
        songsResults.innerHTML = `<p class="service-songs-results-empty">No songs match “${escapeHtml(query)}”.</p>`
        return
      }

      songsResults.innerHTML = matches
        .map(
          (song) => `
          <button
            type="button"
            class="service-songs-result"
            data-action="pick-song"
            data-song-id="${escapeHtml(song.id)}"
            data-song-title="${escapeHtml(song.title)}"
            data-song-artist="${escapeHtml(song.artist || '')}"
            data-song-key="${escapeHtml(song.key || '')}"
          >
            <strong>${escapeHtml(song.title)}</strong>
            <span>${escapeHtml(song.artist || 'Unknown')}${song.key ? ` · Key ${escapeHtml(song.key)}` : ''}</span>
          </button>`,
        )
        .join('')
    }

    function addSongFromDataset(dataset) {
      if (!songsList) return
      const id = dataset.songId || ''
      if (!id || selectedSongIds().has(id)) return

      songsList.querySelector('.service-songs-empty')?.remove()
      songsList.insertAdjacentHTML(
        'beforeend',
        serviceSongRow({
          id,
          title: dataset.songTitle || 'Untitled',
          artist: dataset.songArtist || '',
          key: dataset.songKey || '',
        }),
      )

      if (songsSearch) {
        songsSearch.value = ''
        songsSearch.focus()
      }
      renderSongResults('')
    }

    songsSearch?.addEventListener('input', () => {
      renderSongResults(songsSearch.value)
    })

    songsSearch?.addEventListener('focus', () => {
      if (songsSearch.value.trim()) renderSongResults(songsSearch.value)
    })

    songsResults?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="pick-song"]')
      if (!btn) return
      addSongFromDataset(btn.dataset)
    })

    songsList?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="remove-song"]')
      if (!btn) return
      const row = btn.closest('.service-song-row')
      if (!row) return
      row.remove()
      refreshSongsEmpty()
      if (songsSearch?.value.trim()) renderSongResults(songsSearch.value)
    })

    function setDocsError(message) {
      if (!errorEl) return
      if (!message) {
        errorEl.hidden = true
        errorEl.textContent = ''
        return
      }
      errorEl.hidden = false
      errorEl.textContent = message
    }

    function renderPending() {
      if (!pendingHost) return
      if (!pendingFiles.length) {
        pendingHost.hidden = true
        pendingHost.innerHTML = ''
        return
      }
      pendingHost.hidden = false
      pendingHost.innerHTML = pendingFiles
        .map(
          (file, index) => `
        <div class="practice-doc-row is-pending" data-pending-index="${index}">
          <div class="practice-doc-copy">
            <strong>${escapeHtml(file.name)}</strong>
            <span>${escapeHtml(formatDocSize(file.size))} · new</span>
          </div>
          <button type="button" class="icon-btn icon-btn-danger" data-action="remove-pending" aria-label="Remove ${escapeHtml(file.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14" />
              <path d="M9 7V5h6v2" />
              <path d="M8 7l1 13h6l1-13" />
            </svg>
          </button>
        </div>`,
        )
        .join('')
    }

    form.querySelector('#practice-docs-input')?.addEventListener('change', (event) => {
      const input = event.currentTarget
      const files = Array.from(input.files || [])
      setDocsError('')
      for (const file of files) {
        const err = validatePracticeFile(file)
        if (err) {
          setDocsError(err)
          continue
        }
        pendingFiles.push(file)
      }
      input.value = ''
      renderPending()
    })

    form.querySelector('#practice-docs-existing')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="remove-doc"]')
      if (!btn) return
      const row = btn.closest('.practice-doc-row')
      if (!row) return
      const path = row.dataset.docPath
      if (path) removedPaths.push(path)
      row.remove()
      const list = form.querySelector('#practice-docs-existing')
      if (list && !list.querySelector('.practice-doc-row')) {
        list.innerHTML = `<p class="practice-docs-empty">No documents yet.</p>`
      }
    })

    pendingHost?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action="remove-pending"]')
      if (!btn) return
      const row = btn.closest('[data-pending-index]')
      if (!row) return
      const index = Number(row.dataset.pendingIndex)
      if (Number.isInteger(index)) pendingFiles.splice(index, 1)
      renderPending()
    })

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(form)
      const kind = form.dataset.kind
      setDocsError('')
      let pushNotice = null

      if (kind === 'schedule') {
        const type = form.dataset.type === 'practice' ? 'practice' : 'service'
        const existingId = String(data.get('id') || '').trim()
        const scheduleId =
          existingId ||
          (crypto.randomUUID ? crypto.randomUUID() : `sched-${Date.now()}`)
        const title = String(data.get('title') || '').trim()
        const day = String(data.get('day') || '').trim()
        const time = String(data.get('time') || '').trim()

        let documents = []
        let songs = []

        if (type === 'practice') {
          documents = Array.from(form.querySelectorAll('#practice-docs-existing .practice-doc-row')).map(
            (row) => ({
              id: row.dataset.docId || '',
              name: row.dataset.docName || 'document',
              path: row.dataset.docPath || '',
              size: Number(row.dataset.docSize) || 0,
              mime: row.dataset.docMime || '',
              url: row.dataset.docUrl || '',
            }),
          )

          if (pendingFiles.length) {
            try {
              if (submitBtn) {
                submitBtn.disabled = true
                submitBtn.textContent = 'Uploading…'
              }
              const uploaded = await uploadPracticeFiles(scheduleId, pendingFiles)
              for (let i = 0; i < uploaded.length; i += 1) {
                const meta = uploaded[i]
                const file = pendingFiles[i]
                if (meta?.path && file) {
                  await putCachedPracticeDoc({
                    path: meta.path,
                    name: meta.name,
                    mime: meta.mime || file.type,
                    blob: file,
                    size: meta.size || file.size,
                    url: meta.url,
                  })
                }
              }
              documents = [...documents, ...uploaded]
            } catch (error) {
              setDocsError(error?.message || 'Upload failed.')
              if (submitBtn) {
                submitBtn.disabled = false
                submitBtn.textContent = existingId ? 'Save' : 'Add practice'
              }
              return
            }
          }

          documents = normalizeDocuments(documents)
        }

        if (type === 'service') {
          songs = parseSongs(
            Array.from(form.querySelectorAll('#service-songs-list .service-song-row')).map((row) => ({
              id: row.dataset.songId || '',
              title: row.dataset.songTitle || '',
              artist: row.dataset.songArtist || '',
              key: row.dataset.songKey || '',
            })),
          )
        }

        await saveScheduleItem({
          id: scheduleId,
          type,
          day,
          title,
          time,
          note: String(data.get('note') || '').trim(),
          documents,
          songs,
        })

        if (removedPaths.length) {
          await deletePracticeDocPaths(removedPaths)
          await removeCachedPracticeDocs(removedPaths)
        }

        const kindLabel = type === 'practice' ? 'Practice' : 'Service'
        pushNotice = {
          kind: 'schedule',
          title: `Choir ${kindLabel} update`,
          body: [day, title, time].filter(Boolean).join(' · ') || 'Schedule was updated',
          url: '#/schedule',
          tag: `crc-schedule-${scheduleId}`,
        }
      } else {
        const title = String(data.get('title') || '').trim()
        const saved = await saveLyric({
          id: String(data.get('id') || '') || undefined,
          title,
          artist: String(data.get('artist') || '').trim(),
          key: String(data.get('key') || '').trim(),
          body: String(data.get('body') || '').trim(),
        })

        pushNotice = {
          kind: 'lyric',
          title: 'New choir lyric',
          body: title || 'A new song was added',
          url: saved?.id ? `#/lyrics/${encodeURIComponent(saved.id)}` : '#/',
          tag: saved?.id ? `crc-lyric-${saved.id}` : 'crc-lyrics',
        }
      }

      await syncLyrics()

      if (navigator.onLine && pushNotice) {
        dispatchChoirPush(pushNotice).catch(() => {})
      }

      await remount(root, {
        tab: currentTab,
        mode: 'list',
        notice: navigator.onLine ? 'Saved and synced.' : 'Saved offline. Will sync when online.',
      })
    })
  }
}
