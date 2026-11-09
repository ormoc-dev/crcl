import { installHelpHtml, bindInstallHelp } from '../components/install-prompt.js'
import { BUILD_ID } from '../build-id.js'
import { checkForAppUpdate } from '../lib/register-sw.js'

export async function renderSettings() {
  const offline = !navigator.onLine
  const buildLabel = BUILD_ID === '__BUILD_ID__' ? 'local' : BUILD_ID

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
            <strong>Store Lyrics</strong>
            <span>Password locked — add or edit choir songs</span>
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
