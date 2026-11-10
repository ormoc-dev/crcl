export function renderOfflineBanner() {
  const app = document.getElementById('app')
  let banner = document.getElementById('offline-banner')

  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'offline-banner'
    banner.className = 'offline-banner'
    banner.hidden = true
    banner.setAttribute('role', 'status')
    banner.textContent = 'Offline — showing saved CRC lyrics'
  }

  // Keep banner inside #app so it pushes the header down (doesn't cover it)
  if (app && banner.parentElement !== app) {
    app.prepend(banner)
  } else if (!app && !document.body.contains(banner)) {
    document.body.prepend(banner)
  }

  const update = () => {
    banner.hidden = navigator.onLine
  }

  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  update()
}
