export function renderOfflineBanner() {
  let banner = document.getElementById('offline-banner')

  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'offline-banner'
    banner.className = 'offline-banner'
    banner.hidden = true
    banner.textContent = 'Offline — showing saved CRC lyrics'
    document.body.prepend(banner)
  }

  const update = () => {
    banner.hidden = navigator.onLine
  }

  window.addEventListener('online', update)
  window.addEventListener('offline', update)
  update()
}
