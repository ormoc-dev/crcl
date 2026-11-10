import { isAppUnlocked, unlockAppWithPin } from '../lib/pin-auth.js'
import { refreshAppSettings } from '../lib/app-settings.js'

function digitsHtml(values) {
  return [0, 1, 2, 3]
    .map((i) => `<span class="pin-dot${values[i] ? ' is-filled' : ''}"></span>`)
    .join('')
}

function renderGate(error = '') {
  return `
    <div class="pin-gate" id="pin-gate" role="dialog" aria-modal="true" aria-labelledby="pin-gate-title">
      <p class="pin-gate-eyebrow">Christus Rex Choir</p>
      <h1 id="pin-gate-title">Enter PIN</h1>
      <p class="pin-gate-copy">4-digit code required to open the app</p>
      <p class="pin-error" id="pin-error"${error ? '' : ' hidden'}>${error || ''}</p>
      <div class="pin-field">
        <div class="pin-dots" id="pin-dots" aria-hidden="true">${digitsHtml(['', '', '', ''])}</div>
        <input
          id="pin-input"
          class="pin-input"
          type="tel"
          inputmode="numeric"
          pattern="[0-9]*"
          autocomplete="one-time-code"
          maxlength="4"
          enterkeyhint="done"
          aria-label="4-digit PIN"
        />
      </div>
    </div>
  `
}

/**
 * Show PIN gate until unlocked. Resolves when local unlock is saved.
 */
export async function ensurePinGate() {
  if (isAppUnlocked()) {
    refreshAppSettings().catch(() => {})
    return true
  }

  refreshAppSettings().catch(() => {})

  document.getElementById('app')?.setAttribute('hidden', '')
  let host = document.getElementById('pin-gate-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'pin-gate-host'
    document.body.appendChild(host)
  }
  host.innerHTML = renderGate()

  return new Promise((resolve) => {
    let submitting = false

    const input = host.querySelector('#pin-input')
    const dots = () => host.querySelector('#pin-dots')
    const errorEl = () => host.querySelector('#pin-error')

    const setError = (message) => {
      const el = errorEl()
      if (!el) return
      if (!message) {
        el.hidden = true
        el.textContent = ''
        return
      }
      el.hidden = false
      el.textContent = message
    }

    const paint = (value) => {
      const el = dots()
      if (el) el.innerHTML = digitsHtml(String(value || '').split(''))
    }

    const finish = () => {
      host.remove()
      document.getElementById('app')?.removeAttribute('hidden')
      resolve(true)
    }

    const submit = async (pin) => {
      if (submitting) return
      submitting = true
      setError('')
      const result = await unlockAppWithPin(pin)
      if (result.ok) {
        finish()
        return
      }
      submitting = false
      if (input) {
        input.value = ''
        input.focus()
      }
      paint('')
      setError(
        result.reason === 'format'
          ? 'Enter a 4-digit PIN.'
          : result.reason === 'missing'
            ? 'PIN is not set up yet.'
            : 'Incorrect PIN.',
      )
    }

    input?.addEventListener('input', async () => {
      const digits = String(input.value || '').replace(/\D/g, '').slice(0, 4)
      if (input.value !== digits) input.value = digits
      setError('')
      paint(digits)
      if (digits.length === 4) await submit(digits)
    })

    input?.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      const digits = String(input.value || '').replace(/\D/g, '').slice(0, 4)
      if (digits.length === 4) await submit(digits)
      else setError('Enter a 4-digit PIN.')
    })

    // Open device keyboard immediately
    requestAnimationFrame(() => {
      input?.focus({ preventScroll: true })
    })
  })
}
