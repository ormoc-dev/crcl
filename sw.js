const CACHE_VERSION = 'crc-v__BUILD_ID__'
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/main.css',
  './js/main.js',
  './js/router.js',
  './js/config.js',
  './js/build-id.js',
  './js/components/header.js',
  './js/components/bottom-bar.js',
  './js/components/offline-banner.js',
  './js/components/install-prompt.js',
  './js/components/confirm-modal.js',
  './js/lib/install-pwa.js',
  './js/pages/home.js',
  './js/pages/schedule.js',
  './js/pages/settings.js',
  './js/pages/store.js',
  './js/pages/privacy.js',
  './js/pages/lyrics.js',
  './js/lib/supabase.js',
  './js/lib/lyrics-store.js',
  './js/lib/schedule-store.js',
  './js/lib/lyrics-sync.js',
  './js/lib/store-auth.js',
  './js/lib/register-sw.js',
  './js/lib/app-notify.js',
  './js/lib/notify-service.js',
  './public/assets/icon/app_icon.jpg',
  './public/assets/icon/icon-192.png',
  './public/assets/icon/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith('crcl-') || key.startsWith('crc-')) &&
                key !== SHELL_CACHE &&
                key !== RUNTIME_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

/** Closed-app Web Push from Supabase Edge Function `send-choir-push`. */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    try {
      payload = { body: event.data?.text?.() || '' }
    } catch {
      payload = {}
    }
  }

  const title = String(payload.title || 'Christus Rex Choir')
  const icon = new URL('public/assets/icon/icon-192.png', self.registration.scope).href
  const data = {
    url: payload.url || '#/',
    kind: payload.kind || 'generic',
    ...(payload.data || {}),
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body: String(payload.body || '').slice(0, 180),
      icon,
      badge: icon,
      tag: payload.tag || data.kind || 'crc',
      renotify: true,
      data,
      vibrate: [120],
    }),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of all) {
        client.postMessage({ type: 'crc-push-resubscribe' })
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  const data = event.notification?.data || {}
  event.notification.close()

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const client = all.find((c) => 'focus' in c) || all[0] || null
      const targetHash = String(data.url || '#/').startsWith('#')
        ? String(data.url || '#/')
        : `#${String(data.url || '/').replace(/^\//, '')}`

      if (client) {
        try {
          await client.focus()
        } catch {
          /* ignore */
        }
        client.postMessage({
          type: 'crc-notify-action',
          data: { ...data, url: targetHash },
        })
        return
      }

      const base = self.registration.scope || './'
      await self.clients.openWindow(`${base}${targetHash}`)
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Always try network for version checks / SW updates / app code
  if (
    url.pathname.endsWith('/version.json') ||
    url.pathname.endsWith('/sw.js') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.origin === self.location.origin) {
    // HTML navigations: network first so deploys show up faster
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
      event.respondWith(networkFirst(request))
      return
    }

    event.respondWith(cacheFirst(request))
    return
  }

  event.respondWith(networkFirst(request))
})

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true })
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    if (request.mode === 'navigate') {
      return caches.match('./index.html')
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE)

  try {
    const response = await fetch(request, { cache: 'no-store' })
    if (response.ok) {
      cache.put(request, response.clone())
      // Also refresh shell cache copy for same-origin assets
      if (new URL(request.url).origin === self.location.origin) {
        const shell = await caches.open(SHELL_CACHE)
        shell.put(request, response.clone())
      }
    }
    return response
  } catch {
    const cached =
      (await cache.match(request)) ||
      (await caches.match(request, { ignoreSearch: true })) ||
      (request.mode === 'navigate' ? await caches.match('./index.html') : null)

    if (cached) return cached
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}
