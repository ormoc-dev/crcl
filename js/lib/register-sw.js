const BUILD_KEY = 'crc-build-id'
const RELOAD_KEY = 'crc-sw-reloading'

let registrationPromise = null

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

async function clearAppCaches() {
  if (!('caches' in window)) return
  const keys = await caches.keys()
  await Promise.all(
    keys
      .filter((key) => key.startsWith('crc-') || key.startsWith('crcl-'))
      .map((key) => caches.delete(key)),
  )
}

async function applyUpdate(registration, remoteBuild) {
  sessionStorage.setItem(RELOAD_KEY, '1')
  localStorage.setItem(BUILD_KEY, remoteBuild)

  try {
    await registration?.update()
  } catch {
    // ignore offline update failures
  }

  if (registration?.waiting) {
    activateWaitingWorker(registration.waiting)
  } else if (registration?.installing) {
    const worker = registration.installing
    await new Promise((resolve) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          activateWaitingWorker(worker)
          resolve()
        }
        if (worker.state === 'activated' || worker.state === 'redundant') resolve()
      })
    })
  }

  await clearAppCaches()

  // Hard reload so network-first / fresh caches load the new build
  const url = new URL(window.location.href)
  url.searchParams.set('_v', remoteBuild)
  window.location.replace(url.toString())
}

export async function checkForAppUpdate({ force = false } = {}) {
  const remoteBuild = await checkRemoteVersion()
  if (!remoteBuild) return { updated: false, build: localStorage.getItem(BUILD_KEY) }

  const localBuild = localStorage.getItem(BUILD_KEY)
  const registration = await registrationPromise

  if (!localBuild) {
    localStorage.setItem(BUILD_KEY, remoteBuild)
    if (force) await registration?.update()
    return { updated: false, build: remoteBuild }
  }

  if (localBuild === remoteBuild) {
    if (force) await registration?.update()
    return { updated: false, build: remoteBuild }
  }

  await applyUpdate(registration, remoteBuild)
  return { updated: true, build: remoteBuild }
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null

  // Clear leftover flag / cache-bust query from a previous forced reload
  if (sessionStorage.getItem(RELOAD_KEY) === '1') {
    sessionStorage.removeItem(RELOAD_KEY)
  }
  try {
    const clean = new URL(window.location.href)
    if (clean.searchParams.has('_v')) {
      clean.searchParams.delete('_v')
      history.replaceState(null, '', clean.pathname + clean.search + clean.hash)
    }
  } catch {
    // ignore
  }

  try {
    registrationPromise = navigator.serviceWorker.register('sw.js', {
      scope: './',
      updateViaCache: 'none',
    })

    const registration = await registrationPromise

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
      if (sessionStorage.getItem(RELOAD_KEY) === '1') return
      refreshing = true
      sessionStorage.setItem(RELOAD_KEY, '1')
      window.location.reload()
    })

    const tryUpdate = () => {
      checkForAppUpdate().catch(() => {})
    }

    // Check on open, when returning to the app, and periodically
    tryUpdate()
    window.addEventListener('focus', tryUpdate)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryUpdate()
    })
    setInterval(tryUpdate, 60 * 1000)

    return registration
  } catch (error) {
    console.warn('Service worker registration failed:', error)
    registrationPromise = Promise.resolve(null)
    return null
  }
}
