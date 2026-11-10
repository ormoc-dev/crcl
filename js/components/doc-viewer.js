import {
  ensurePracticeDocCached,
  isPdfDoc,
} from '../lib/practice-doc-cache.js'
import { formatDocSize } from '../lib/practice-docs.js'

let host = null
let objectUrl = ''
let pdfjsPromise = null

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

function ensurePromiseWithResolvers() {
  if (typeof Promise.withResolvers === 'function') return
  Promise.withResolvers = function withResolvers() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}

async function loadPdfJs() {
  if (!pdfjsPromise) {
    ensurePromiseWithResolvers()
    pdfjsPromise = import('../vendor/pdfjs/pdf.min.mjs').then((mod) => {
      const pdfjsLib = mod?.getDocument ? mod : globalThis.pdfjsLib
      if (!pdfjsLib?.getDocument) {
        throw new Error('PDF viewer failed to load.')
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        '../vendor/pdfjs/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
      return pdfjsLib
    })
  }
  return pdfjsPromise
}

function pdfBlob(blob, name = '') {
  if (blob?.type === 'application/pdf') return blob
  return new Blob([blob], { type: 'application/pdf' })
}

/** Render PDF pages with PDF.js — works on iOS where iframe/blob PDF fails. */
async function renderPdfPages(body, blob) {
  const pdfjsLib = await loadPdfJs()
  const data = new Uint8Array(await blob.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise

  const scroller = document.createElement('div')
  scroller.className = 'doc-viewer-pdf'
  body.replaceChildren(scroller)

  const maxWidth = Math.max(280, Math.floor(scroller.clientWidth || body.clientWidth || window.innerWidth))

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const unscaled = page.getViewport({ scale: 1 })
    const scale = Math.min(2.5, maxWidth / unscaled.width)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.className = 'doc-viewer-page'
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.width = '100%'
    canvas.style.height = 'auto'

    const context = canvas.getContext('2d', { alpha: false })
    scroller.appendChild(canvas)

    await page.render({ canvasContext: context, viewport }).promise
  }
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
    const typed =
      isPdfDoc(cached) || isPdfDoc(doc)
        ? pdfBlob(cached.blob, cached.name)
        : cached.blob
    objectUrl = URL.createObjectURL(typed)

    if (metaEl) {
      metaEl.textContent = `${formatDocSize(cached.size || cached.blob.size)} · saved offline`
    }

    if (!body) return

    if (isPdfDoc(cached) || isPdfDoc(doc)) {
      setBusy('Opening PDF…')
      await renderPdfPages(body, typed)
      return
    }

    body.replaceChildren()
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
