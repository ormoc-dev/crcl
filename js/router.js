import { renderHome, bindHome, refreshHomeQuietly } from './pages/home.js'
import { renderSettings, bindSettings } from './pages/settings.js'
import { renderStore, bindStore } from './pages/store.js'
import { renderPrivacy } from './pages/privacy.js'
import { renderLyric, bindLyric, stopLyricAutoScroll } from './pages/lyrics.js'
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
  const app = document.getElementById('app')

  if (!mount) return

  // Stop previous lyric page auto-scroll / listeners
  mount._lyricCleanup?.()
  stopLyricAutoScroll()

  const isLyricView = /^\/lyrics\/[^/]+$/.test(path)
  app?.classList.toggle('is-lyric-view', isLyricView)

  // Keep current page visible until the next page is ready (no loading blink)
  const html = await resolvePage(path)
  mount.innerHTML = html
  setActiveNav(path)

  if (path === '/' || path === '') bindHome()
  if (path === '/settings') bindSettings(mount)
  if (path === '/store') bindStore(mount)
  if (isLyricView) bindLyric(mount)
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute)

  // Auto-sync must NOT remount pages — only quietly refresh the home list
  window.addEventListener('crc-sync', (event) => {
    if (event.detail?.status !== 'done') return
    const path = getPath()
    if (path === '/' || path === '') {
      refreshHomeQuietly()
    }
  })

  renderRoute()
}
