import {
  ensurePracticeDocCached,
  isPdfDoc,
} from '../lib/practice-doc-cache.js'
import { formatDocSize } from '../lib/practice-docs.js'

let host = null
let objectUrl = ''
let pdfjsPromise = null
let pdfSession = null

const ZOOM_MIN = 0.75
const ZOOM_MAX = 3
const ZOOM_STEP = 0.25

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
      <div class="doc-viewer-zoom" id="doc-viewer-zoom" hidden>
        <button type="button" class="doc-viewer-zoom-btn" id="doc-zoom-out" aria-label="Zoom out">−</button>
        <span class="doc-viewer-zoom-label" id="doc-zoom-label">100%</span>
        <button type="button" class="doc-viewer-zoom-btn" id="doc-zoom-in" aria-label="Zoom in">+</button>
      </div>
    </div>
    <div class="doc-viewer-body" id="doc-viewer-body"></div>
  `
  document.body.appendChild(host)

  host.querySelector('#doc-viewer-back')?.addEventListener('click', closeDocViewer)
  host.querySelector('#doc-zoom-out')?.addEventListener('click', () => {
    if (pdfSession) pdfSession.setZoom(pdfSession.zoom - ZOOM_STEP)
  })
  host.querySelector('#doc-zoom-in')?.addEventListener('click', () => {
    if (pdfSession) pdfSession.setZoom(pdfSession.zoom + ZOOM_STEP)
  })
  return host
}

function setZoomUi(zoom) {
  const wrap = host?.querySelector('#doc-viewer-zoom')
  const label = host?.querySelector('#doc-zoom-label')
  const out = host?.querySelector('#doc-zoom-out')
  const inn = host?.querySelector('#doc-zoom-in')
  if (!wrap) return
  wrap.hidden = false
  if (label) label.textContent = `${Math.round(zoom * 100)}%`
  if (out) out.disabled = zoom <= ZOOM_MIN + 0.001
  if (inn) inn.disabled = zoom >= ZOOM_MAX - 0.001
}

function hideZoomUi() {
  const wrap = host?.querySelector('#doc-viewer-zoom')
  if (wrap) wrap.hidden = true
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

function pdfBlob(blob) {
  if (blob?.type === 'application/pdf') return blob
  return new Blob([blob], { type: 'application/pdf' })
}

function clampZoom(value) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
}

/** Sharp PDF render with DPR + zoom / pinch. */
async function openPdfViewer(body, blob) {
  const pdfjsLib = await loadPdfJs()
  const data = new Uint8Array(await blob.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise

  const scroller = document.createElement('div')
  scroller.className = 'doc-viewer-pdf'
  body.replaceChildren(scroller)

  let zoom = 1
  let painting = false
  let pendingZoom = null
  let generation = 0

  const paint = async () => {
    const gen = ++generation
    painting = true
    const cssWidth = Math.max(
      260,
      Math.floor(scroller.clientWidth || body.clientWidth || window.innerWidth) - 10,
    )
    // Cap DPR a bit for memory, but keep retina sharp
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)

    scroller.replaceChildren()
    setZoomUi(zoom)

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      if (gen !== generation) return
      const page = await pdf.getPage(pageNum)
      const unscaled = page.getViewport({ scale: 1 })
      const fitScale = cssWidth / unscaled.width
      const scale = fitScale * zoom
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.className = 'doc-viewer-page'
      const cssW = Math.floor(viewport.width)
      const cssH = Math.floor(viewport.height)
      canvas.width = Math.floor(cssW * dpr)
      canvas.height = Math.floor(cssH * dpr)
      canvas.style.width = `${cssW}px`
      canvas.style.height = `${cssH}px`

      const context = canvas.getContext('2d', { alpha: false })
      scroller.appendChild(canvas)

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
      })
      await renderTask.promise
    }

    painting = false
    if (pendingZoom != null && pendingZoom !== zoom) {
      const next = pendingZoom
      pendingZoom = null
      zoom = next
      await paint()
    }
  }

  const setZoom = async (next) => {
    const value = clampZoom(next)
    if (Math.abs(value - zoom) < 0.001) {
      setZoomUi(zoom)
      return
    }
    if (painting) {
      pendingZoom = value
      setZoomUi(value)
      return
    }
    zoom = value
    await paint()
  }

  // Pinch-to-zoom (live label, re-render when fingers lift)
  let pinchStartDist = 0
  let pinchStartZoom = 1
  let pinchLiveZoom = null

  const touchDistance = (touches) => {
    const a = touches[0]
    const b = touches[1]
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    return Math.hypot(dx, dy)
  }

  scroller.addEventListener(
    'touchstart',
    (event) => {
      if (event.touches.length === 2) {
        pinchStartDist = touchDistance(event.touches)
        pinchStartZoom = zoom
        pinchLiveZoom = zoom
      }
    },
    { passive: true },
  )

  scroller.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 2 || !pinchStartDist) return
      event.preventDefault()
      const dist = touchDistance(event.touches)
      pinchLiveZoom = clampZoom(pinchStartZoom * (dist / pinchStartDist))
      setZoomUi(pinchLiveZoom)
    },
    { passive: false },
  )

  scroller.addEventListener(
    'touchend',
    async (event) => {
      if (event.touches.length >= 2) return
      pinchStartDist = 0
      if (pinchLiveZoom == null) return
      const next = pinchLiveZoom
      pinchLiveZoom = null
      await setZoom(next)
    },
    { passive: true },
  )

  // Double-tap toggles fit / 200%
  let lastTap = 0
  scroller.addEventListener('click', () => {
    const now = Date.now()
    if (now - lastTap < 280) {
      setZoom(zoom > 1.2 ? 1 : 2)
      lastTap = 0
      return
    }
    lastTap = now
  })

  pdfSession = { setZoom, get zoom() { return zoom } }
  await paint()
}

export function closeDocViewer() {
  revokeObjectUrl()
  pdfSession = null
  hideZoomUi()
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
  pdfSession = null
  hideZoomUi()
  root.hidden = false
  document.getElementById('app')?.classList.add('is-doc-viewer')

  if (titleEl) titleEl.textContent = doc?.name || 'Document'
  if (metaEl) metaEl.textContent = formatDocSize(doc?.size || 0)
  setBusy('Loading file…')

  try {
    const cached = await ensurePracticeDocCached(doc)
    const typed =
      isPdfDoc(cached) || isPdfDoc(doc)
        ? pdfBlob(cached.blob)
        : cached.blob
    objectUrl = URL.createObjectURL(typed)

    if (metaEl) {
      metaEl.textContent = `${formatDocSize(cached.size || cached.blob.size)} · saved offline`
    }

    if (!body) return

    if (isPdfDoc(cached) || isPdfDoc(doc)) {
      setBusy('Opening PDF…')
      await openPdfViewer(body, typed)
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
