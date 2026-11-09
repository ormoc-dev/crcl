export function renderBottomBar(el) {
  el.innerHTML = `
    <a href="#/" data-nav="home">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5" />
      </svg>
      <span>Home</span>
    </a>
    <a href="#/settings" data-nav="settings">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
      </svg>
      <span>Settings</span>
    </a>
  `
}

export function setActiveNav(path) {
  const active =
    path.startsWith('/settings') || path.startsWith('/store') || path.startsWith('/privacy')
      ? 'settings'
      : 'home'

  document.querySelectorAll('.bottom-bar a').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.nav === active)
  })
}
