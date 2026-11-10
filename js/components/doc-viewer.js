import {
  ensurePracticeDocCached,
  isPdfDoc,
} from '../lib/practice-doc-cache.js'
import { formatDocSize } from '../lib/practice-docs.js'

let host = null
let objectUrl = ''

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
}

function ensureHost() {
  if (host && document.body.contains(host)) return host
  host = document.createElement('div')
  host.id = 'doc-viewer'
  host.className = 'doc-viewer'
  host.hidden = true
  host.innerHTML = `
    <div class="doc-viewer-bar">
      <button type="button" class="doc-viewer-back" id="doc-viewer-back">Back</button>
      <div class="doc-viewer-title-wrap">
        <strong id="doc-viewer-title">Document</strong>
        <span id="doc-viewer-meta"></span>
      </div>
    </div>
    <div class="doc-viewer-body" id="doc-viewer-body"></div>
  `
  document.body.appendChild(host)

  host.querySelector('#doc-viewer-back')?.addEventListener('click', closeDocViewer)
  return host
}

function setBusy(message) {
  const body = ensureHost().querySelector('#doc-viewer-body')
  if (!body) return
  body.replaceChildren()
  const status = document.createElement('div')
  status.className = 'doc-viewer-status'
  status.textContent = message
  body.appendChild(status)
}

export function closeDocViewer() {
  revokeObjectUrl()
  if (!host) return
  host.hidden = true
  document.getElementById('app')?.classList.remove('is-doc-viewer')
  const body = host.querySelector('#doc-viewer-body')
  if (body) body.replaceChildren()
}

/**
 * Open a practice document inside the app (no external redirect).
 * Prefers IndexedDB offline cache; downloads once when online.
 */
export async function openDocViewer(doc) {
  const root = ensureHost()
  const titleEl = root.querySelector('#doc-viewer-title')
  const metaEl = root.querySelector('#doc-viewer-meta')
  const body = root.querySelector('#doc-viewer-body')

  revokeObjectUrl()
  root.hidden = false
  document.getElementById('app')?.classList.add('is-doc-viewer')

  if (titleEl) titleEl.textContent = doc?.name || 'Document'
  if (metaEl) metaEl.textContent = formatDocSize(doc?.size || 0)
  setBusy('Loading file…')

  try {
    const cached = await ensurePracticeDocCached(doc)
    objectUrl = URL.createObjectURL(cached.blob)

    if (metaEl) {
      metaEl.textContent = `${formatDocSize(cached.size || cached.blob.size)} · saved offline`
    }

    if (!body) return
    body.replaceChildren()

    if (isPdfDoc(cached) || isPdfDoc(doc)) {
      const frame = document.createElement('iframe')
      frame.className = 'doc-viewer-frame'
      frame.title = cached.name || 'PDF'
      frame.src = `${objectUrl}#toolbar=1&navpanes=0`
      body.appendChild(frame)
      return
    }

    const fallback = document.createElement('div')
    fallback.className = 'doc-viewer-fallback'

    const label = document.createElement('p')
    label.className = 'doc-viewer-fallback-label'
    label.textContent = 'Saved on this device'
    fallback.appendChild(label)

    const name = document.createElement('strong')
    name.textContent = cached.name || 'Document'
    fallback.appendChild(name)

    const help = document.createElement('p')
    help.textContent =
      'This file type can’t be previewed here, but it is stored offline for the choir.'
    fallback.appendChild(help)

    const save = document.createElement('a')
    save.className = 'btn btn-primary'
    save.href = objectUrl
    save.download = cached.name || 'document'
    save.textContent = 'Save a copy'
    fallback.appendChild(save)

    body.appendChild(fallback)
  } catch (error) {
    setBusy(error?.message || 'Could not open this file.')
  }
}

export function isDocViewerOpen() {
  return Boolean(host && !host.hidden)
}
