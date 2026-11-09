import { applyHomeSearch } from '../pages/home.js'

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  return hash.startsWith('/') ? hash : `/${hash}`
}

export function renderHeader(el) {
  el.innerHTML = `
    <div class="site-header-row">
      <a class="site-logo" href="#/">
        <img src="public/assets/icon/app_icon.jpg" alt="CRC" />
        <div class="site-logo-text">
          <span>Song Lyrics</span>
          <small>Christus Rex Choir</small>
        </div>
      </a>
      <button type="button" class="header-search-btn" id="header-search-toggle" aria-label="Search songs">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
    </div>
    <div class="header-search-panel" id="header-search-panel" hidden>
      <input
        id="header-search-input"
        type="search"
        placeholder="Search songs..."
        autocomplete="off"
        enterkeyhint="search"
      />
      <button type="button" class="btn-text" id="header-search-close">Close</button>
    </div>
  `

  bindHeaderSearch(el)
}

function bindHeaderSearch(el) {
  const toggle = el.querySelector('#header-search-toggle')
  const panel = el.querySelector('#header-search-panel')
  const input = el.querySelector('#header-search-input')
  const close = el.querySelector('#header-search-close')

  if (!toggle || !panel || !input || !close) return

  const openSearch = () => {
    const path = currentPath()
    if (path !== '/' && path !== '') {
      window.location.hash = '#/'
    }

    panel.hidden = false
    el.classList.add('is-searching')
    input.focus()
  }

  const closeSearch = () => {
    panel.hidden = true
    el.classList.remove('is-searching')
    input.value = ''
    applyHomeSearch('')
  }

  toggle.addEventListener('click', () => {
    if (panel.hidden) openSearch()
    else closeSearch()
  })

  close.addEventListener('click', closeSearch)

  input.addEventListener('input', () => {
    applyHomeSearch(input.value)
  })
}
