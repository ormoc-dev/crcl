import { getAllLyrics } from '../lib/lyrics-store.js'

let cachedLyrics = []
let lastListSignature = ''
let currentQuery = ''

function lyricListItem(lyric) {
  return `
    <a class="lyric-card" href="#/lyrics/${lyric.id}">
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
        <div class="empty-icon" aria-hidden="true">❧</div>
        <strong>No songs found</strong>
        <p>These pages are waiting for choir lyrics to be written.</p>
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
      <div class="lyric-list">
        ${renderList(filterLyrics(cachedLyrics, currentQuery))}
      </div>
    </section>
  `
}

export function bindHome() {
  // Search is handled from the header icon
}

export function applyHomeSearch(query) {
  currentQuery = query || ''
  const list = document.querySelector('#page-content .lyric-list')
  if (!list) return
  list.innerHTML = renderList(filterLyrics(cachedLyrics, currentQuery))
}

/** Update song list after background sync without remounting the page. */
export async function refreshHomeQuietly(root = document.getElementById('page-content')) {
  if (!root) return false

  const list = root.querySelector('.lyric-list')
  if (!list) return false

  const lyrics = await getAllLyrics()
  const signature = listSignature(lyrics)
  if (signature === lastListSignature) return false

  lastListSignature = signature
  cachedLyrics = lyrics
  list.innerHTML = renderList(filterLyrics(cachedLyrics, currentQuery))
  return true
}
