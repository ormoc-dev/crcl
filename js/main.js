import { renderHeader } from './components/header.js'
import { renderBottomBar } from './components/bottom-bar.js'
import { renderOfflineBanner } from './components/offline-banner.js'
import { startRouter } from './router.js'
import { ensureSeedLyrics } from './lib/lyrics-store.js'
import { hasSupabaseConfig, startAutoSync, syncLyrics } from './lib/lyrics-sync.js'
import { registerServiceWorker } from './lib/register-sw.js'

async function boot() {
  const header = document.querySelector('[data-component="header"]')
  const bottomBar = document.querySelector('[data-component="bottom-bar"]')

  if (header) renderHeader(header)
  if (bottomBar) renderBottomBar(bottomBar)

  renderOfflineBanner()
  await ensureSeedLyrics(hasSupabaseConfig())
  startRouter()
  registerServiceWorker()

  if (hasSupabaseConfig()) {
    startAutoSync()
  } else {
    console.warn('Supabase is not configured in js/config.js — local-only mode.')
  }

  // Expose manual sync for settings button
  window.crcSyncLyrics = syncLyrics
}

boot()
