const DISMISS_KEY = 'crc-install-dismissed'

let deferredPrompt = null
let listenersReady = false

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIos() {
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent || '')
}

export function isInAppBrowser() {
  const ua = navigator.userAgent || ''
  return /FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|BytedanceWebview|Messenger|MicroMessenger/i.test(ua)
}

export function inAppBrowserName() {
  const ua = navigator.userAgent || ''
  if (/Instagram/i.test(ua)) return 'Instagram'
  if (/Messenger/i.test(ua)) return 'Messenger'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook'
  if (/Line\//i.test(ua)) return 'LINE'
  if (/TikTok|BytedanceWebview/i.test(ua)) return 'TikTok'
  return 'this app'
}

export function wasInstallDismissed() {
  return localStorage.getItem(DISMISS_KEY) === '1'
}

export function dismissInstallPrompt() {
  localStorage.setItem(DISMISS_KEY, '1')
}

export function canNativeInstall() {
  return Boolean(deferredPrompt)
}

export function getShareUrl() {
  return window.location.href.split('#')[0]
}

/** Try to leave Messenger/Instagram/Facebook browser into Chrome/Safari. */
export async function openInSystemBrowser() {
  const url = getShareUrl()

  if (isAndroid()) {
    const withoutProtocol = url.replace(/^https?:\/\//i, '')
    const intentUrl = `intent://${withoutProtocol}#Intent;scheme=https;package=com.android.chrome;end`
    window.location.href = intentUrl
    return { ok: true, method: 'intent' }
  }

  // iOS in-app browsers usually block forcing Safari; copy link instead
  try {
    await navigator.clipboard.writeText(url)
    return { ok: true, method: 'clipboard' }
  } catch {
    return { ok: false, method: 'manual', url }
  }
}

export function initInstallCapture() {
  if (listenersReady) return
  listenersReady = true

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    window.dispatchEvent(new CustomEvent('crc-install-ready'))
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    dismissInstallPrompt()
    window.dispatchEvent(new CustomEvent('crc-install-done'))
  })
}

export async function promptInstall() {
  if (isInAppBrowser()) {
    return { ok: false, reason: 'in-app-browser' }
  }

  if (!deferredPrompt) return { ok: false, reason: 'unavailable' }

  deferredPrompt.prompt()
  const choice = await deferredPrompt.userChoice
  deferredPrompt = null

  if (choice.outcome === 'accepted') {
    dismissInstallPrompt()
    return { ok: true }
  }

  return { ok: false, reason: 'dismissed' }
}

export function shouldShowInstallPrompt() {
  if (isStandalone()) return false
  if (wasInstallDismissed()) return false
  // Always show guidance inside Messenger / Instagram / Facebook
  if (isInAppBrowser()) return true
  return isIos() || isAndroid() || canNativeInstall()
}
