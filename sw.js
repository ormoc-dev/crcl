const CACHE_VERSION = 'crc-v__BUILD_ID__-noblink'
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
  './js/components/header.js',
  './js/components/bottom-bar.js',
  './js/components/offline-banner.js',
  './js/components/install-prompt.js',
  './js/lib/install-pwa.js',
  './js/pages/home.js',
  './js/pages/settings.js',
  './js/pages/store.js',
  './js/pages/privacy.js',
  './js/pages/lyrics.js',
  './js/lib/supabase.js',
  './js/lib/lyrics-store.js',
  './js/lib/lyrics-sync.js',
  './js/lib/store-auth.js',
  './js/lib/register-sw.js',
  './public/assets/icon/app_icon.jpg',
  './public/assets/icon/icon-192.png',
  './public/assets/icon/icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => (key.startsWith('crcl-') || key.startsWith('crc-')) && key !== SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // App shell + same-origin assets: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request))
    return
  }

  // CDN / Supabase: network-first, fall back to cache
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
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}
