import { getAllLyrics } from '../lib/lyrics-store.js'

let cachedLyrics = []
let lastListSignature = ''

function lyricListItem(lyric) {
  const initial = (lyric.title || '?').trim().charAt(0).toUpperCase()

  return `
    <a class="lyric-card" href="#/lyrics/${lyric.id}">
      <div class="lyric-mark" aria-hidden="true">${escapeHtml(initial)}</div>
      <div class="lyric-copy">
        <strong>${escapeHtml(lyric.title)}</strong>
        <span>${escapeHtml(lyric.artist || 'Unknown')}</span>
      </div>
      <div class="lyric-key">${escapeHtml(lyric.key || '—')}</div>
    </a>
  `
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function filterLyrics(lyrics, query) {
  const q = query.trim().toLowerCase()
  if (!q) return lyrics

  return lyrics.filter((lyric) => {
    const haystack = [lyric.title, lyric.artist, lyric.key, lyric.body]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
}

function listSignature(lyrics) {
  return lyrics
    .map((lyric) => `${lyric.id}:${lyric.updated_at}:${lyric.title}:${lyric.key}:${lyric.artist}`)
    .sort()
    .join('|')
}

function renderList(lyrics) {
  if (!lyrics.length) {
    return `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">♪</div>
        <strong>No songs found</strong>
        <p>Choir lyrics will appear here once they are saved.</p>
      </div>
    `
  }

  return lyrics
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(lyricListItem)
    .join('')
}

export async function renderHome() {
  cachedLyrics = await getAllLyrics()
  lastListSignature = listSignature(cachedLyrics)

  return `
    <section class="page lyrics-page">
      <div class="search-bar">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id="lyric-search"
          type="search"
          placeholder="Search song lyrics..."
          autocomplete="off"
          enterkeyhint="search"
        />
      </div>
      <div class="lyric-list">
        ${renderList(cachedLyrics)}
      </div>
    </section>
  `
}

export function bindHome(root) {
  const input = root.querySelector('#lyric-search')
  const list = root.querySelector('.lyric-list')
  if (!input || !list) return

  input.addEventListener('input', () => {
    list.innerHTML = renderList(filterLyrics(cachedLyrics, input.value))
  })
}

/** Update song list after background sync without remounting the page. */
export async function refreshHomeQuietly(root = document.getElementById('page-content')) {
  if (!root) return false

  const list = root.querySelector('.lyric-list')
  const input = root.querySelector('#lyric-search')
  if (!list) return false

  const lyrics = await getAllLyrics()
  const signature = listSignature(lyrics)
  if (signature === lastListSignature) return false

  lastListSignature = signature
  cachedLyrics = lyrics

  const query = input?.value || ''
  const selectionStart = input?.selectionStart
  const selectionEnd = input?.selectionEnd
  const hadFocus = document.activeElement === input

  list.innerHTML = renderList(filterLyrics(cachedLyrics, query))

  if (hadFocus && input) {
    input.focus({ preventScroll: true })
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
      input.setSelectionRange(selectionStart, selectionEnd)
    }
  }

  return true
}
