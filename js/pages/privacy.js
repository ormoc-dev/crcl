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
          <h2>Password lock</h2>
          <p>
            The Store Lyrics password stays on this device for the current browser
            session only. Closing the tab locks Store Lyrics again.
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
            your choir admin.
          </p>
        </article>
      </div>
    </section>
  `
}
