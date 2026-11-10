import { renderHeader } from './components/header.js'
import { renderBottomBar } from './components/bottom-bar.js'
import { renderOfflineBanner } from './components/offline-banner.js'
import { renderInstallPrompt } from './components/install-prompt.js'
import { startRouter } from './router.js'
import { removeBuiltInSamples } from './lib/lyrics-store.js'
import { removeBuiltInScheduleSamples } from './lib/schedule-store.js'
import { hasSupabaseConfig, startAutoSync } from './lib/lyrics-sync.js'
import { registerServiceWorker } from './lib/register-sw.js'
import { startNotifyService } from './lib/notify-service.js'
import { lockScrollBounce } from './lib/scroll-lock.js'

async function boot() {
  const header = document.querySelector('[data-component="header"]')
  const bottomBar = document.querySelector('[data-component="bottom-bar"]')
  const pageContent = document.getElementById('page-content')

  if (header) renderHeader(header)
  if (bottomBar) renderBottomBar(bottomBar)
  if (pageContent) lockScrollBounce(pageContent)

  renderOfflineBanner()
  renderInstallPrompt()
  await removeBuiltInSamples()
  await removeBuiltInScheduleSamples()
  startRouter()
  registerServiceWorker()
  startNotifyService()

  if (hasSupabaseConfig()) {
    startAutoSync()
  } else {
    console.warn('Supabase is not configured in js/config.js — local-only mode.')
  }
}

boot()
