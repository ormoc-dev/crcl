let host = null
let hideTimer = 0

function ensureHost() {
  if (host && document.body.contains(host)) return host
  host = document.createElement('div')
  host.id = 'app-toast-host'
  host.className = 'app-toast-host'
  host.setAttribute('aria-live', 'polite')
  document.body.appendChild(host)
  return host
}

/**
 * Show a short in-app toast. Works even when the OS banner is suppressed.
 * @param {{
 *   title: string,
 *   body?: string,
 *   url?: string,
 *   kind?: 'lyric' | 'schedule' | 'info',
 *   durationMs?: number,
 * }} opts
 */
export function showAppToast(opts = {}) {
  const root = ensureHost()
  root.innerHTML = ''

  const toast = document.createElement('button')
  toast.type = 'button'
  toast.className = `app-toast app-toast-${opts.kind || 'info'}`

  const title = document.createElement('strong')
  title.textContent = String(opts.title || 'Update')
  toast.appendChild(title)

  if (opts.body) {
    const body = document.createElement('span')
    body.textContent = String(opts.body)
    toast.appendChild(body)
  }

  const url = opts.url || ''
  toast.addEventListener('click', () => {
    hideAppToast()
    if (!url) return
    if (String(url).startsWith('#')) location.hash = url
    else if (String(url).startsWith('/')) location.hash = `#${url}`
    else location.hash = '#/'
  })

  root.appendChild(toast)
  requestAnimationFrame(() => toast.classList.add('is-in'))

  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hideAppToast, opts.durationMs || 5200)
}

export function hideAppToast() {
  clearTimeout(hideTimer)
  if (!host) return
  const toast = host.querySelector('.app-toast')
  if (!toast) {
    host.innerHTML = ''
    return
  }
  toast.classList.remove('is-in')
  window.setTimeout(() => {
    if (host) host.innerHTML = ''
  }, 220)
}
