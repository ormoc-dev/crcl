const BUILD_KEY = 'crc-build-id'
const RELOAD_KEY = 'crc-sw-reloading'

function activateWaitingWorker(worker) {
  worker?.postMessage({ type: 'SKIP_WAITING' })
}

async function checkRemoteVersion() {
  try {
    const response = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json()
    return data?.build ? String(data.build) : null
  } catch {
    return null
  }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  try {
    const registration = await navigator.serviceWorker.register('sw.js', {
      scope: './',
      updateViaCache: 'none',
    })

    // New SW downloaded while page is open → activate immediately
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing
      if (!worker) return

      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          activateWaitingWorker(worker)
        }
      })
    })

    // If a waiting worker already exists
    if (registration.waiting && navigator.serviceWorker.controller) {
      activateWaitingWorker(registration.waiting)
    }

    // When the new SW takes control, reload once to load fresh files
    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return
      if (sessionStorage.getItem(RELOAD_KEY) === '1') {
        sessionStorage.removeItem(RELOAD_KEY)
        return
      }
      refreshing = true
      sessionStorage.setItem(RELOAD_KEY, '1')
      window.location.reload()
    })

    const tryUpdate = async () => {
      try {
        await registration.update()
      } catch {
        // ignore offline update failures
      }

      const remoteBuild = await checkRemoteVersion()
      if (!remoteBuild) return

      const localBuild = localStorage.getItem(BUILD_KEY)
      if (localBuild && localBuild !== remoteBuild) {
        localStorage.setItem(BUILD_KEY, remoteBuild)
        // Force SW update cycle; controllerchange reload will finish the job
        if (registration.waiting) {
          activateWaitingWorker(registration.waiting)
        } else {
          // Soft reload if SW already matches but assets/version changed
          window.location.reload()
        }
        return
      }

      localStorage.setItem(BUILD_KEY, remoteBuild)
    }

    // Check on open, when returning to the app, and every few minutes
    tryUpdate()
    window.addEventListener('focus', tryUpdate)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryUpdate()
    })
    setInterval(tryUpdate, 5 * 60 * 1000)

    return registration
  } catch (error) {
    console.warn('Service worker registration failed:', error)
    return null
  }
}
