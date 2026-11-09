import { getLyricById } from '../lib/lyrics-store.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export async function renderLyric(id) {
  const lyric = await getLyricById(id)

  if (!lyric) {
    return `
      <section class="page">
        <h1>Song not found</h1>
        <p>This lyric is not saved on this device.</p>
      </section>
    `
  }

  return `
    <section class="page lyric-view">
      <header class="lyric-meta">
        <h1>${escapeHtml(lyric.title)}</h1>
        <p>${escapeHtml(lyric.artist || 'Unknown')} · Key ${escapeHtml(lyric.key || '—')}</p>
      </header>
      <pre class="lyric-body">${escapeHtml(lyric.body || '')}</pre>
    </section>
  `
}
