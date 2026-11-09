import { getPendingSyncCount } from '../lib/lyrics-store.js'
import { hasSupabaseConfig } from '../lib/lyrics-sync.js'
import { installHelpHtml, bindInstallHelp } from '../components/install-prompt.js'

export async function renderSettings() {
  const offline = !navigator.onLine
  const pending = await getPendingSyncCount()
  const supabaseReady = hasSupabaseConfig()

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
            <strong>Supabase sync</strong>
            <span>
              ${
                !supabaseReady
                  ? 'Not configured'
                  : pending
                    ? `${pending} change(s) syncing automatically…`
                    : 'Automatic — no Sync button needed'
              }
            </span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>Theme</strong>
            <span>Brown / Cream</span>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <strong>Offline storage</strong>
            <span>Lyrics saved on this device, then synced to cloud</span>
          </div>
        </div>
      </div>
    </section>
  `
}

export function bindSettings(root) {
  bindInstallHelp(root)
}
