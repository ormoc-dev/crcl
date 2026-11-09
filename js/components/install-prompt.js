import {
  canNativeInstall,
  dismissInstallPrompt,
  getShareUrl,
  inAppBrowserName,
  initInstallCapture,
  isAndroid,
  isInAppBrowser,
  isIos,
  isStandalone,
  openInSystemBrowser,
  promptInstall,
  shouldShowInstallPrompt,
} from '../lib/install-pwa.js'

function bannerHtml() {
  if (isInAppBrowser()) {
    const app = inAppBrowserName()
    return `
      <div class="install-prompt install-prompt-wide" id="install-prompt">
        <div class="install-prompt-copy">
          <strong>Install from ${app}?</strong>
          <p>
            ${app} browser can’t install apps.
            ${
              isIos()
                ? 'Tap <b>⋯</b> or <b>Open in Safari</b>, then Add to Home Screen.'
                : 'Open in Chrome first, then tap Install.'
            }
          </p>
        </div>
        <div class="install-prompt-actions">
          <button type="button" class="btn btn-primary btn-sm" id="install-open-browser">
            ${isIos() ? 'Copy link' : 'Open in Chrome'}
          </button>
          <button type="button" class="btn-text" id="install-dismiss">Later</button>
        </div>
      </div>
    `
  }

  if (isIos()) {
    return `
      <div class="install-prompt" id="install-prompt">
        <div class="install-prompt-copy">
          <strong>Install on iPhone</strong>
          <p>Tap <b>Share</b> <span aria-hidden="true">□↑</span> then <b>Add to Home Screen</b>.</p>
        </div>
        <button type="button" class="btn-text" id="install-dismiss">Got it</button>
      </div>
    `
  }

  return `
    <div class="install-prompt" id="install-prompt">
      <div class="install-prompt-copy">
        <strong>Install CRC app</strong>
        <p>Add Christus Rex Choir Song Lyrics to your home screen.</p>
      </div>
      <div class="install-prompt-actions">
        <button type="button" class="btn btn-primary btn-sm" id="install-android-btn">
          Install
        </button>
        <button type="button" class="btn-text" id="install-dismiss">Later</button>
      </div>
    </div>
  `
}

function removeBanner() {
  document.getElementById('install-prompt')?.remove()
}

async function handleOpenBrowser() {
  const result = await openInSystemBrowser()

  if (result.method === 'clipboard') {
    alert('Link copied. Open Safari, paste the link, then tap Share → Add to Home Screen.')
    return
  }

  if (result.method === 'manual') {
    prompt(`Copy this link and open it in Safari/Chrome:\n\n${result.url}`, result.url)
    return
  }

  // Android intent fired — if user stays here, show fallback tip
  setTimeout(() => {
    if (isInAppBrowser()) {
      alert('If Chrome did not open, tap ⋮ in this browser → Open in Chrome.')
    }
  }, 1200)
}

function bindBanner() {
  const root = document.getElementById('install-prompt')
  if (!root) return

  root.querySelector('#install-dismiss')?.addEventListener('click', () => {
    dismissInstallPrompt()
    removeBanner()
  })

  root.querySelector('#install-open-browser')?.addEventListener('click', () => {
    handleOpenBrowser()
  })

  root.querySelector('#install-android-btn')?.addEventListener('click', async () => {
    const result = await promptInstall()
    if (result.ok) {
      removeBanner()
      return
    }

    if (result.reason === 'in-app-browser') {
      handleOpenBrowser()
      return
    }

    if (result.reason === 'unavailable') {
      alert('Install is not ready yet. Open this site in Chrome, then tap Install again. Or use Chrome menu → Install app.')
    }
  })
}

export function renderInstallPrompt() {
  initInstallCapture()

  const show = () => {
    if (!shouldShowInstallPrompt()) {
      removeBanner()
      return
    }

    if (document.getElementById('install-prompt')) {
      const btn = document.getElementById('install-android-btn')
      if (btn && isAndroid() && !isInAppBrowser()) {
        btn.disabled = false
        btn.textContent = canNativeInstall() ? 'Install' : 'Install'
      }
      return
    }

    document.body.insertAdjacentHTML('afterbegin', bannerHtml())
    bindBanner()
  }

  show()
  window.addEventListener('crc-install-ready', show)
  window.addEventListener('crc-install-done', removeBanner)
}

export function installHelpHtml() {
  if (isStandalone()) {
    return `
      <div class="settings-row">
        <div>
          <strong>App install</strong>
          <span>Already installed on this device</span>
        </div>
      </div>
    `
  }

  if (isInAppBrowser()) {
    const app = inAppBrowserName()
    return `
      <div class="settings-help">
        <strong>Opened in ${app}</strong>
        <p>
          Messenger / Instagram / Facebook browsers cannot install the app directly.
          Open the link in your phone browser first.
        </p>
        <ol>
          ${
            isIos()
              ? `
                <li>Tap <b>⋯</b> → <b>Open in Safari</b> (or copy the link)</li>
                <li>In Safari, tap <b>Share</b></li>
                <li>Tap <b>Add to Home Screen</b></li>
              `
              : `
                <li>Tap <b>Open in Chrome</b> below</li>
                <li>In Chrome, tap <b>Install</b> (or menu ⋮ → Install app)</li>
              `
          }
        </ol>
        <button type="button" class="btn btn-primary btn-block" id="settings-open-browser">
          ${isIos() ? 'Copy link for Safari' : 'Open in Chrome'}
        </button>
        <p class="settings-help-note">Link: ${getShareUrl()}</p>
      </div>
    `
  }

  if (isIos()) {
    return `
      <div class="settings-help">
        <strong>Install on iPhone / iPad</strong>
        <ol>
          <li>Open this site in <b>Safari</b></li>
          <li>Tap the <b>Share</b> button</li>
          <li>Tap <b>Add to Home Screen</b></li>
          <li>Tap <b>Add</b></li>
        </ol>
        <p class="settings-help-note">If you opened this from Messenger/Instagram, first tap ⋯ → Open in Safari.</p>
      </div>
    `
  }

  return `
    <div class="settings-help">
      <strong>Install on Android</strong>
      <p>Tap the button below to install the app on your phone.</p>
      <button type="button" class="btn btn-primary btn-block" id="settings-install-btn">
        Install app
      </button>
      <p class="settings-help-note">
        If you opened this from Messenger/Instagram/Facebook, tap menu → Open in Chrome first.
        Then use Install.
      </p>
    </div>
  `
}

export function bindInstallHelp(root) {
  root.querySelector('#settings-install-btn')?.addEventListener('click', async () => {
    const result = await promptInstall()
    if (result.ok) return
    if (result.reason === 'in-app-browser') {
      handleOpenBrowser()
      return
    }
    if (result.reason === 'unavailable') {
      alert('Install is not ready yet. Use Chrome menu (⋮) → Install app.')
    }
  })

  root.querySelector('#settings-open-browser')?.addEventListener('click', () => {
    handleOpenBrowser()
  })
}
