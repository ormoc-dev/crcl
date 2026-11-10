import {
  ensureScheduleReady,
  formatScheduleDayLong,
  formatScheduleDayShort,
  getAllSchedule,
  parseSongs,
  saveScheduleItem,
} from '../lib/schedule-store.js'
import {
  formatDocSize,
  listPracticeDocsForSchedule,
  parseDocuments,
  publicDocUrl,
} from '../lib/practice-docs.js'
import { prefetchPracticeDocs } from '../lib/practice-doc-cache.js'
import { openDocViewer } from '../components/doc-viewer.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function itemDocs(item) {
  return parseDocuments(item.documents).map((doc) => ({
    ...doc,
    href: doc.url || publicDocUrl(doc.path),
  }))
}

function docsPanelHtml(docs) {
  if (!docs.length) {
    return `<p class="schedule-card-docs-empty">No files attached.</p>`
  }

  return docs
    .map((doc) => {
      const canOpen = Boolean(doc.path || doc.href)
      if (!canOpen) {
        return `
          <div class="schedule-doc-link is-disabled">
            <span class="schedule-doc-link-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /></svg>
            </span>
            <span class="schedule-doc-link-copy">
              <strong>${escapeHtml(doc.name)}</strong>
              <span>${escapeHtml(formatDocSize(doc.size))} · unavailable</span>
            </span>
          </div>`
      }

      return `
        <button
          type="button"
          class="schedule-doc-link"
          data-action="open-doc"
          data-doc-path="${escapeHtml(doc.path)}"
          data-doc-name="${escapeHtml(doc.name)}"
          data-doc-size="${escapeHtml(String(doc.size || 0))}"
          data-doc-mime="${escapeHtml(doc.mime || '')}"
          data-doc-url="${escapeHtml(doc.href || '')}"
        >
          <span class="schedule-doc-link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /></svg>
          </span>
          <span class="schedule-doc-link-copy">
            <strong>${escapeHtml(doc.name)}</strong>
            <span>${escapeHtml(formatDocSize(doc.size))} · open in app</span>
          </span>
          <span class="schedule-doc-link-go" aria-hidden="true">›</span>
        </button>`
    })
    .join('')
}

function songsPanelHtml(songs) {
  if (!songs.length) {
    return `<p class="schedule-card-docs-empty">No songs linked.</p>`
  }

  return songs
    .map(
      (song, index) => `
      <button
        type="button"
        class="schedule-song-link"
        data-action="open-song"
        data-lyric-id="${escapeHtml(song.id)}"
      >
        <span class="schedule-song-num">${index + 1}</span>
        <span class="schedule-song-copy">
          <strong>${escapeHtml(song.title)}</strong>
          <span>${escapeHtml(song.artist || 'Unknown')}${song.key ? ` · Key ${escapeHtml(song.key)}` : ''}</span>
        </span>
        <span class="schedule-song-go" aria-hidden="true">›</span>
      </button>`,
    )
    .join('')
}

function scheduleCard(item) {
  const docs = itemDocs(item)
  const songs = item.type === 'service' ? parseSongs(item.songs) : []
  const hasDocs = docs.length > 0
  const hasSongs = songs.length > 0
  const kind = item.type === 'practice' ? 'Practice' : 'Service'
  const badge = hasSongs
    ? `${songs.length} song${songs.length === 1 ? '' : 's'}`
    : hasDocs
      ? `${docs.length} file${docs.length === 1 ? '' : 's'}`
      : item.type === 'practice'
        ? 'No files'
        : 'No songs'
  const expandable = hasDocs || hasSongs || item.type === 'practice' || item.type === 'service'

  return `
    <article class="schedule-card${expandable ? ' is-expandable' : ''}${hasDocs || hasSongs ? ' has-files' : ''}" data-schedule-id="${escapeHtml(item.id || '')}" data-schedule-type="${escapeHtml(item.type || '')}">
      <button
        type="button"
        class="schedule-card-main"
        ${expandable ? `aria-expanded="false"` : 'disabled'}
      >
        <div class="schedule-card-day">
          <span>${escapeHtml(formatScheduleDayShort(item.day))}</span>
          ${
            formatScheduleDayShort(item.day) !== formatScheduleDayLong(item.day)
              ? `<small>${escapeHtml(formatScheduleDayLong(item.day).replace(/^[^,]+,\s*/, ''))}</small>`
              : ''
          }
        </div>
        <div class="schedule-card-copy">
          <p class="schedule-card-kind">${escapeHtml(kind)}</p>
          <h2>${escapeHtml(item.title || 'Untitled')}</h2>
          <p class="schedule-card-time">${escapeHtml(item.time || '')}</p>
          ${item.note ? `<p class="schedule-card-note">${escapeHtml(item.note)}</p>` : ''}
        </div>
        <div class="schedule-card-aside">
          <span class="schedule-card-files${hasDocs || hasSongs ? ' is-ready' : ''}">${escapeHtml(badge)}</span>
          ${expandable ? `<span class="schedule-card-chevron" aria-hidden="true"></span>` : ''}
        </div>
      </button>
      ${
        expandable
          ? `<div class="schedule-card-docs" hidden>
              ${
                item.type === 'service'
                  ? `<div class="schedule-card-docs-head">Songs</div>
                     <div class="schedule-card-songs-list">${songsPanelHtml(songs)}</div>`
                  : `<div class="schedule-card-docs-head">Attached files</div>
                     <div class="schedule-card-docs-list">${docsPanelHtml(docs)}</div>`
              }
            </div>`
          : ''
      }
    </article>
  `
}

function section(title, items) {
  if (!items.length) return ''

  return `
    <section class="schedule-section">
      <h2 class="schedule-section-title">${escapeHtml(title)}</h2>
      <div class="schedule-list">${items.map(scheduleCard).join('')}</div>
    </section>
  `
}

function scheduleBodyHtml(all) {
  const services = all
    .filter((item) => item.type === 'service')
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))
  const practices = all
    .filter((item) => item.type === 'practice')
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))

  const sections = section('Choir service', services) + section('Practice', practices)
  return sections || `<div class="store-empty">No schedule yet.</div>`
}

function updateCardDocsUi(card, docs) {
  const filesBadge = card.querySelector('.schedule-card-files')
  const list = card.querySelector('.schedule-card-docs-list')
  if (filesBadge) {
    const hasDocs = docs.length > 0
    filesBadge.textContent = hasDocs
      ? `${docs.length} file${docs.length === 1 ? '' : 's'}`
      : 'No files'
    filesBadge.classList.toggle('is-ready', hasDocs)
    card.classList.toggle('has-files', hasDocs)
  }
  if (list) list.innerHTML = docsPanelHtml(docs)
}

async function recoverMissingPracticeDocs(root) {
  const cards = Array.from(root.querySelectorAll('.schedule-card[data-schedule-type="practice"]'))
  for (const card of cards) {
    const id = card.dataset.scheduleId
    if (!id) continue
    if (card.classList.contains('has-files')) continue

    try {
      const recovered = await listPracticeDocsForSchedule(id)
      if (!recovered.length) continue

      const withHref = recovered.map((doc) => ({
        ...doc,
        href: doc.url || publicDocUrl(doc.path),
      }))
      updateCardDocsUi(card, withHref)
      prefetchPracticeDocs(withHref)

      const all = await getAllSchedule()
      const item = all.find((row) => row.id === id)
      if (item) {
        await saveScheduleItem({
          ...item,
          documents: recovered,
        })
      }
    } catch (error) {
      console.warn('Could not recover practice docs for', id, error)
    }
  }
}

function collectDocsFromRoot(root) {
  return Array.from(root.querySelectorAll('[data-action="open-doc"]')).map((btn) => ({
    path: btn.dataset.docPath || '',
    name: btn.dataset.docName || 'document',
    size: Number(btn.dataset.docSize) || 0,
    mime: btn.dataset.docMime || '',
    url: btn.dataset.docUrl || '',
  }))
}

export function bindSchedule(root = document.getElementById('page-content')) {
  if (!root) return

  root.querySelectorAll('.schedule-card.is-expandable').forEach((card) => {
    const toggle = card.querySelector('.schedule-card-main')
    const panel = card.querySelector('.schedule-card-docs')
    if (!toggle || !panel) return

    toggle.addEventListener('click', () => {
      const open = card.classList.toggle('is-open')
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      panel.hidden = !open
    })
  })

  if (root._onScheduleAction) root.removeEventListener('click', root._onScheduleAction)
  root._onScheduleAction = (event) => {
    const songBtn = event.target.closest('[data-action="open-song"]')
    if (songBtn && root.contains(songBtn)) {
      event.preventDefault()
      const lyricId = songBtn.dataset.lyricId || ''
      if (lyricId) location.hash = `#/lyrics/${encodeURIComponent(lyricId)}`
      return
    }

    const docBtn = event.target.closest('[data-action="open-doc"]')
    if (!docBtn || !root.contains(docBtn)) return
    event.preventDefault()
    openDocViewer({
      path: docBtn.dataset.docPath || '',
      name: docBtn.dataset.docName || 'document',
      size: Number(docBtn.dataset.docSize) || 0,
      mime: docBtn.dataset.docMime || '',
      url: docBtn.dataset.docUrl || '',
    })
  }
  root.addEventListener('click', root._onScheduleAction)

  prefetchPracticeDocs(collectDocsFromRoot(root))
  recoverMissingPracticeDocs(root)
}

export async function renderSchedule() {
  await ensureScheduleReady()
  const all = await getAllSchedule()

  return `
    <section class="page">
      <div class="page-head">
        <h1>Schedule</h1>
        <p>Christus Rex Choir service & practice times</p>
      </div>
      <div class="schedule-page-body">
        ${scheduleBodyHtml(all)}
      </div>
    </section>
  `
}

/** Update schedule after background sync without remounting the page. */
export async function refreshScheduleQuietly(root = document.getElementById('page-content')) {
  if (!root) return false
  const body = root.querySelector('.schedule-page-body')
  if (!body) return false

  await ensureScheduleReady()
  const all = await getAllSchedule()
  body.innerHTML = scheduleBodyHtml(all)
  bindSchedule(root)
  return true
}
