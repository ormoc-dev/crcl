import { ensureSeedLyrics, getAllLyrics } from '../lib/lyrics-store.js'

let cachedLyrics = []

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

function renderList(lyrics) {
  if (!lyrics.length) {
    return '<p class="empty-state">No songs found.</p>'
  }

  return lyrics
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(lyricListItem)
    .join('')
}

export async function renderHome() {
  cachedLyrics = await getAllLyrics()
  if (!cachedLyrics.length) cachedLyrics = await ensureSeedLyrics()

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
