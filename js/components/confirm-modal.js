function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function confirmModal({
  title = 'Please confirm',
  message = 'Are you sure?',
  confirmText = 'Delete',
  cancelText = 'Cancel',
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById('crc-confirm-modal')
    existing?.remove()

    const overlay = document.createElement('div')
    overlay.id = 'crc-confirm-modal'
    overlay.className = 'confirm-modal'
    overlay.innerHTML = `
      <div class="confirm-modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h2 id="confirm-modal-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-modal-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-action="confirm">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `

    const close = (value) => {
      overlay.remove()
      document.removeEventListener('keydown', onKey)
      resolve(value)
    }

    const onKey = (event) => {
      if (event.key === 'Escape') close(false)
    }

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) close(false)
    })

    overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => close(false))
    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => close(true))
    document.addEventListener('keydown', onKey)

    document.body.appendChild(overlay)
    overlay.querySelector('[data-action="cancel"]')?.focus()
  })
}
