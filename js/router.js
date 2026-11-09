import { renderHome, bindHome } from './pages/home.js'
import { renderSettings } from './pages/settings.js'
import { renderStore, bindStore } from './pages/store.js'
import { renderPrivacy } from './pages/privacy.js'
import { renderLyric } from './pages/lyrics.js'
import { setActiveNav } from './components/bottom-bar.js'

export function getPath() {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  return hash.startsWith('/') ? hash : `/${hash}`
}

async function resolvePage(path) {
  if (path === '/settings') return await renderSettings()
  if (path === '/store') return renderStore()
  if (path === '/privacy') return renderPrivacy()

  const lyricMatch = path.match(/^\/lyrics\/([^/]+)$/)
  if (lyricMatch) return renderLyric(decodeURIComponent(lyricMatch[1]))

  return renderHome()
}

export async function renderRoute() {
  const path = getPath()
  const mount = document.getElementById('page-content')

  if (!mount) return

  mount.innerHTML = '<section class="page"><p>Loading…</p></section>'
  mount.innerHTML = await resolvePage(path)
  setActiveNav(path)

  if (path === '/' || path === '') bindHome(mount)
  if (path === '/store') bindStore(mount)
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute)
  window.addEventListener('crc-sync', (event) => {
    if (event.detail?.status !== 'done') return
    const path = getPath()
    if (path === '/' || path === '' || path === '/settings' || path === '/store') {
      renderRoute()
    }
  })
  renderRoute()
}
