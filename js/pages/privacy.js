export function renderPrivacy() {
  return `
    <section class="page privacy-page">
      <div class="page-head">
        <a class="back-link" href="#/settings">← Back to Settings</a>
        <h1>Privacy</h1>
        <p>How Christus Rex Choir Song Lyrics handles your information.</p>
      </div>

      <div class="privacy-content">
        <article>
          <h2>What we store</h2>
          <p>
            Song lyrics are saved on this device (IndexedDB) for offline reading.
            When online, changes sync to Supabase so other choir devices can update
            their local song list automatically.
          </p>
        </article>

        <article>
          <h2>App PIN &amp; Manage Choir password</h2>
          <p>
            A 4-digit PIN unlocks the app and is remembered on this device after a
            correct entry. The Manage Choir password unlocks editing for the current
            browser session only. Both values are stored in Supabase
            <code>app_settings</code> and cached locally for offline checks.
          </p>
        </article>

        <article>
          <h2>What we do not collect</h2>
          <p>
            This app does not sell personal data. Viewing lyrics does not require
            an account. No analytics trackers are built into the current version.
          </p>
        </article>

        <article>
          <h2>Offline &amp; install</h2>
          <p>
            As a PWA, the app may cache pages and songs on your device so choir
            members can use them without internet.
          </p>
        </article>

        <article>
          <h2>Contact</h2>
          <p>
            For privacy questions about Christus Rex Choir Song Lyrics, contact
            <a href="mailto:anthony.capuyan23@gmail.com">anthony.capuyan23@gmail.com</a>.
          </p>
        </article>
      </div>
    </section>
  `
}
