import { getLyricById } from '../lib/lyrics-store.js'

const SPEED_KEY = 'crc-lyric-scroll-speed'
const SPEED_MIN = 1
const SPEED_MAX = 10
const SPEED_DEFAULT = 2
const SPEED_BASE_PX = 0.4
const LEGACY_SPEEDS = { slow: 1, normal: 2, fast: 4 }

let scrollRaf = 0
let scrolling = false

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function normalizeSpeed(value) {
  if (LEGACY_SPEEDS[value]) return LEGACY_SPEEDS[value]
  const n = Number.parseInt(value, 10)
  if (Number.isFinite(n) && n >= SPEED_MIN && n <= SPEED_MAX) return n
  return SPEED_DEFAULT
}

function getSavedSpeed() {
  return normalizeSpeed(localStorage.getItem(SPEED_KEY))
}

function speedToPx(multiplier) {
  return SPEED_BASE_PX * normalizeSpeed(multiplier)
}

export function stopLyricAutoScroll() {
  scrolling = false
  if (scrollRaf) {
    cancelAnimationFrame(scrollRaf)
    scrollRaf = 0
  }
}

function startLyricAutoScroll(multiplier) {
  stopLyricAutoScroll()
  const px = speedToPx(multiplier)
  scrolling = true

  const tick = () => {
    if (!scrolling) return

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    if (window.scrollY >= maxScroll - 1) {
      scrolling = false
      const toggle = document.getElementById('lyric-scroll-toggle')
      if (toggle) {
        toggle.textContent = 'Scroll'
        toggle.classList.remove('is-on')
      }
      return
    }

    window.scrollBy(0, px)
    scrollRaf = requestAnimationFrame(tick)
  }

  scrollRaf = requestAnimationFrame(tick)
}

export async function renderLyric(id) {
  const lyric = await getLyricById(id)

  if (!lyric) {
    return `
      <section class="page lyric-view">
        <h1>Song not found</h1>
        <p>This lyric is not saved on this device.</p>
        <div class="lyric-footer">
          <a class="btn btn-primary" href="#/">Back</a>
        </div>
      </section>
    `
  }

  const key = (lyric.key || '').trim()
  const speed = getSavedSpeed()
  const speedOptions = Array.from({ length: SPEED_MAX }, (_, i) => {
    const value = i + 1
    return `<option value="${value}" ${speed === value ? 'selected' : ''}>${value}x</option>`
  }).join('')

  return `
    <section class="page lyric-view">
      <header class="lyric-meta">
        <p class="lyric-meta-label">Christus Rex Choir</p>
        <h1>${escapeHtml(lyric.title)}</h1>
        <div class="lyric-meta-row">
          <span class="lyric-meta-artist">${escapeHtml(lyric.artist || 'Unknown')}</span>
          ${key ? `<span class="lyric-meta-key">Key ${escapeHtml(key)}</span>` : ''}
        </div>
      </header>

      <pre class="lyric-body">${escapeHtml(lyric.body || '')}</pre>

      <div class="lyric-footer" role="toolbar" aria-label="Lyric controls">
        <a class="lyric-bar-btn" href="#/" id="lyric-back-btn">Back</a>
        <button type="button" class="lyric-bar-btn lyric-bar-btn-main" id="lyric-scroll-toggle">
          Scroll
        </button>
        <label class="lyric-speed-wrap" for="lyric-scroll-speed">
          <select id="lyric-scroll-speed" class="lyric-speed-select" aria-label="Scroll speed">
            ${speedOptions}
          </select>
        </label>
      </div>
    </section>
  `
}

export function bindLyric(root) {
  stopLyricAutoScroll()
  window.scrollTo(0, 0)

  const toggle = root.querySelector('#lyric-scroll-toggle')
  const speedSelect = root.querySelector('#lyric-scroll-speed')
  let speed = getSavedSpeed()

  const setToggleUi = (on) => {
    if (!toggle) return
    toggle.textContent = on ? 'Pause' : 'Scroll'
    toggle.classList.toggle('is-on', on)
  }

  speedSelect?.addEventListener('change', () => {
    speed = normalizeSpeed(speedSelect.value)
    localStorage.setItem(SPEED_KEY, String(speed))
    if (scrolling) startLyricAutoScroll(speed)
  })

  toggle?.addEventListener('click', () => {
    if (scrolling) {
      stopLyricAutoScroll()
      setToggleUi(false)
      return
    }

    startLyricAutoScroll(speed)
    setToggleUi(true)
  })

  const onUserScroll = () => {
    if (!scrolling) return
    stopLyricAutoScroll()
    setToggleUi(false)
  }

  window.addEventListener('wheel', onUserScroll, { passive: true })
  window.addEventListener('touchmove', onUserScroll, { passive: true })

  root.querySelector('#lyric-back-btn')?.addEventListener('click', () => {
    stopLyricAutoScroll()
  })

  // When auto-scroll finishes at the end, reset button label
  const endWatcher = setInterval(() => {
    if (!scrolling && toggle?.classList.contains('is-on')) setToggleUi(false)
  }, 400)

  root._lyricCleanup = () => {
    stopLyricAutoScroll()
    clearInterval(endWatcher)
    window.removeEventListener('wheel', onUserScroll)
    window.removeEventListener('touchmove', onUserScroll)
  }
}
