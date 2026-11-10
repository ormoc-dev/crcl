import { installHelpHtml, bindInstallHelp } from '../components/install-prompt.js'
import { BUILD_ID } from '../build-id.js'
import { checkForAppUpdate } from '../lib/register-sw.js'
import {
  enableNotifications,
  notificationPermission,
  notificationsEnabled,
  notificationsSupported,
  setNotificationsEnabled,
} from '../lib/notify-service.js'

function notifyStatusLabel() {
  if (!notificationsSupported()) return 'Not supported on this device'
  const perm = notificationPermission()
  if (perm === 'denied') return 'Blocked in browser settings'
  if (perm === 'granted' && notificationsEnabled()) {
    return 'On — alerts even when app is closed'
  }
  if (perm === 'granted') return 'Allowed — currently off'
  return 'Off — tap Enable (install app on iPhone first)'
}

export async function renderSettings() {
  const offline = !navigator.onLine
  const buildLabel = BUILD_ID === '__BUILD_ID__' ? 'local' : BUILD_ID
  const notifyOn =
    notificationsSupported() &&
    notificationPermission() === 'granted' &&
    notificationsEnabled()

  return `
    <section class="page">
      <div class="page-head">
        <h1>Settings</h1>
        <p>Manage Christus Rex Choir Song Lyrics on this device.</p>
      </div>

      <div class="settings-list">
        ${installHelpHtml()}

        <a class="settings-row settings-link" href="#/store">
          <div>
            <strong>Manage Choir</strong>
            <span>Password locked — lyrics, service schedule & practice</span>
          </div>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </a>
        <a class="settings-row settings-link" href="#/privacy">
          <div>
            <strong>Privacy</strong>
            <span>How song data is stored on this device</span>
          </div>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </a>
        <div class="settings-row">
          <div>
            <strong>Notifications</strong>
            <span id="settings-notify-label">${notifyStatusLabel()}</span>
          </div>
          ${
            notificationsSupported()
              ? `<button type="button" class="btn btn-ghost btn-sm" id="settings-notify-btn">
                  ${notifyOn ? 'Turn off' : 'Enable'}
                </button>`
              : ''
          }
        </div>
        <div class="settings-row">
          <div>
            <strong>Connection</strong>
            <span>${offline ? 'Offline — local edits wait for sync' : 'Online'}</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>Offline storage</strong>
            <span>Lyrics saved on this device, then synced to cloud</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>App version</strong>
            <span id="settings-build-label">${buildLabel}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="settings-check-update">
            Check update
          </button>
        </div>
      </div>
    </section>
  `
}

export function bindSettings(root) {
  bindInstallHelp(root)

  const notifyBtn = root.querySelector('#settings-notify-btn')
  const notifyLabel = root.querySelector('#settings-notify-label')

  notifyBtn?.addEventListener('click', async () => {
    const currentlyOn =
      notificationPermission() === 'granted' && notificationsEnabled()

    if (currentlyOn) {
      setNotificationsEnabled(false)
      notifyBtn.textContent = 'Enable'
      if (notifyLabel) notifyLabel.textContent = notifyStatusLabel()
      return
    }

    notifyBtn.disabled = true
    notifyBtn.textContent = 'Allowing…'
    const perm = await enableNotifications()
    notifyBtn.disabled = false

    if (perm === 'granted') {
      notifyBtn.textContent = 'Turn off'
      if (notifyLabel) {
        notifyLabel.textContent = 'On — registering this device…'
      }
      // Label settles after push subscribe finishes inside enableNotifications
      window.setTimeout(() => {
        if (notifyLabel) notifyLabel.textContent = notifyStatusLabel()
      }, 800)
      return
    }

    notifyBtn.textContent = 'Enable'
    if (notifyLabel) {
      notifyLabel.textContent =
        perm === 'denied'
          ? 'Blocked — allow this site in browser settings'
          : notifyStatusLabel()
    }
  })

  root.querySelector('#settings-check-update')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget
    const label = root.querySelector('#settings-build-label')
    btn.disabled = true
    btn.textContent = 'Checking…'
    try {
      const result = await checkForAppUpdate({ force: true })
      if (label && result?.build) label.textContent = result.build
      if (result?.updated) {
        btn.textContent = 'Updating…'
        return
      }
      btn.textContent = result?.build ? 'Up to date' : 'Unavailable'
    } catch {
      btn.textContent = 'Failed'
    }
    setTimeout(() => {
      btn.disabled = false
      btn.textContent = 'Check update'
    }, 1600)
  })
}
