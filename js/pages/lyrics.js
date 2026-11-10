import { getLyricById } from '../lib/lyrics-store.js'

const SPEED_KEY = 'crc-lyric-scroll-speed'
const SPEED_MIN = 1
const SPEED_MAX = 10
const SPEED_DEFAULT = 2
const SPEED_BASE_PX = 0.4
const LEGACY_SPEEDS = { slow: 1, normal: 2, fast: 4 }

let scrollRaf = 0
let scrolling = false

function getScrollRoot() {
  return document.getElementById('page-content') || document.getElementById('app') || document.documentElement
}

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

    const root = getScrollRoot()
    const maxScroll = root.scrollHeight - root.clientHeight
    if (root.scrollTop >= maxScroll - 1) {
      scrolling = false
      const toggle = document.getElementById('lyric-scroll-toggle')
      if (toggle) {
        toggle.textContent = 'Scroll'
        toggle.classList.remove('is-on')
      }
      return
    }

    root.scrollBy(0, px)
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
      <div class="lyric-swipe-layer">
        <header class="lyric-meta">
          <p class="lyric-meta-label">Christus Rex Choir</p>
          <h1>${escapeHtml(lyric.title)}</h1>
          <div class="lyric-meta-row">
            <span class="lyric-meta-artist">${escapeHtml(lyric.artist || 'Unknown')}</span>
            ${key ? `<span class="lyric-meta-key">Key ${escapeHtml(key)}</span>` : ''}
          </div>
        </header>

        <pre class="lyric-body">${escapeHtml(lyric.body || '')}</pre>
      </div>

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

function goHomeFromLyric() {
  stopLyricAutoScroll()
  window.location.hash = '#/'
}

function bindSwipeBack(view) {
  const SWIPE_MIN = 72
  const ANGLE_RATIO = 1.25

  let startX = 0
  let startY = 0
  let tracking = false
  let axis = null // null | 'x' | 'y'
  let lastDx = 0

  const resetTransform = () => {
    view.classList.remove('is-swiping')
    view.style.transform = ''
    view.style.opacity = ''
  }

  const onStart = (event) => {
    if (event.touches.length !== 1) return
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
    axis = null
    lastDx = 0
  }

  const onMove = (event) => {
    if (!tracking || event.touches.length !== 1) return
    const touch = event.touches[0]
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (!axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      axis = Math.abs(dx) > Math.abs(dy) * ANGLE_RATIO ? 'x' : 'y'
      if (axis === 'x') {
        view.classList.add('is-swiping')
        if (scrolling) stopLyricAutoScroll()
      }
    }

    if (axis !== 'x') return

    event.preventDefault()
    lastDx = dx
    const fade = Math.max(0.55, 1 - Math.abs(dx) / (view.clientWidth || 320))
    view.style.transform = `translate3d(${dx}px, 0, 0)`
    view.style.opacity = String(fade)
  }

  const onEnd = () => {
    if (!tracking) return
    tracking = false

    if (axis === 'x' && Math.abs(lastDx) >= SWIPE_MIN) {
      const dir = lastDx > 0 ? 1 : -1
      view.classList.add('is-swipe-exit')
      view.style.transform = `translate3d(${dir * 110}%, 0, 0)`
      view.style.opacity = '0'
      window.setTimeout(goHomeFromLyric, 160)
      axis = null
      lastDx = 0
      return
    }

    resetTransform()
    axis = null
    lastDx = 0
  }

  view.addEventListener('touchstart', onStart, { passive: true })
  view.addEventListener('touchmove', onMove, { passive: false })
  view.addEventListener('touchend', onEnd)
  view.addEventListener('touchcancel', onEnd)

  return () => {
    view.removeEventListener('touchstart', onStart)
    view.removeEventListener('touchmove', onMove)
    view.removeEventListener('touchend', onEnd)
    view.removeEventListener('touchcancel', onEnd)
    resetTransform()
  }
}

export function bindLyric(root) {
  stopLyricAutoScroll()
  const scrollRoot = getScrollRoot()
  scrollRoot.scrollTop = 0

  const swipeLayer = root.querySelector('.lyric-swipe-layer') || root.querySelector('.lyric-view') || root
  const toggle = root.querySelector('#lyric-scroll-toggle')
  const speedSelect = root.querySelector('#lyric-scroll-speed')
  let speed = getSavedSpeed()
  const unbindSwipe = bindSwipeBack(swipeLayer)

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

  // wheel/touch only — not "scroll", or auto-scroll would cancel itself
  scrollRoot.addEventListener('wheel', onUserScroll, { passive: true })
  scrollRoot.addEventListener('touchmove', onUserScroll, { passive: true })

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
    unbindSwipe()
    scrollRoot.removeEventListener('wheel', onUserScroll)
    scrollRoot.removeEventListener('touchmove', onUserScroll)
  }
}
