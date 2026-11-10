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
  if (!notificationsSupported()) return 'Not supported'
  const perm = notificationPermission()
  if (perm === 'denied') return 'Blocked in browser'
  if (perm === 'granted' && notificationsEnabled()) return 'On · works when closed'
  if (perm === 'granted') return 'Allowed · currently off'
  return 'Off · enable for alerts'
}

export async function renderSettings() {
  const offline = !navigator.onLine
  const buildLabel = BUILD_ID === '__BUILD_ID__' ? 'local' : BUILD_ID
  const notifyOn =
    notificationsSupported() &&
    notificationPermission() === 'granted' &&
    notificationsEnabled()

  return `
    <section class="page settings-page">
      <div class="page-head page-head-compact">
        <h1>Settings</h1>
        <p>This device</p>
      </div>

      <div class="settings-list">
        ${installHelpHtml()}

        <a class="settings-row settings-link" href="#/store">
          <div>
            <strong>Manage Choir</strong>
            <span>Lyrics, schedule & practice</span>
          </div>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </a>
        <a class="settings-row settings-link" href="#/privacy">
          <div>
            <strong>Privacy</strong>
            <span>How data is stored</span>
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
                  ${notifyOn ? 'Off' : 'Enable'}
                </button>`
              : ''
          }
        </div>
        <div class="settings-row">
          <div>
            <strong>Connection</strong>
            <span>${offline ? 'Offline' : 'Online'}</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>Offline storage</strong>
            <span>Saved on device · syncs online</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>App version</strong>
            <span id="settings-build-label">${buildLabel}</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="settings-check-update">
            Update
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
    notifyBtn.textContent = '…'
    const perm = await enableNotifications()
    notifyBtn.disabled = false

    if (perm === 'granted') {
      notifyBtn.textContent = 'Off'
      if (notifyLabel) notifyLabel.textContent = 'On · registering…'
      window.setTimeout(() => {
        if (notifyLabel) notifyLabel.textContent = notifyStatusLabel()
      }, 800)
      return
    }

    notifyBtn.textContent = 'Enable'
    if (notifyLabel) {
      notifyLabel.textContent =
        perm === 'denied' ? 'Blocked in browser' : notifyStatusLabel()
    }
  })

  root.querySelector('#settings-check-update')?.addEventListener('click', async (event) => {
    const btn = event.currentTarget
    const label = root.querySelector('#settings-build-label')
    btn.disabled = true
    btn.textContent = '…'
    try {
      const result = await checkForAppUpdate({ force: true })
      if (label && result?.build) label.textContent = result.build
      if (result?.updated) {
        btn.textContent = 'Updating…'
        return
      }
      btn.textContent = result?.build ? 'OK' : 'N/A'
    } catch {
      btn.textContent = 'Fail'
    }
    setTimeout(() => {
      btn.disabled = false
      btn.textContent = 'Update'
    }, 1600)
  })
}
