import {
  AUDIO_ACCEPT,
  AUDIO_CATEGORIES,
  categoryLabel,
  deleteAudioRecording,
  formatAudioSize,
  getAudioByCategory,
  isValidAudioCategory,
  pickRecorderMime,
  pullAudioRecordings,
  uploadAudioRecording,
  validateAudioFile,
} from '../lib/audio-recordings.js'
import { ensureAudioPlayUrl, putCachedAudio, removeCachedAudio } from '../lib/audio-cache.js'
import { confirmModal } from '../components/confirm-modal.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function categoryTabsHtml(selected = '') {
  return `
    <div class="audio-cats" role="tablist" aria-label="Voice part">
      ${AUDIO_CATEGORIES.map(
        (cat) => `
        <button
          type="button"
          class="audio-cat${selected === cat.id ? ' is-active' : ''}"
          data-action="select-cat"
          data-category="${cat.id}"
          role="tab"
          aria-selected="${selected === cat.id ? 'true' : 'false'}"
        >${escapeHtml(cat.label)}</button>`,
      ).join('')}
    </div>
  `
}

function recordingRowHtml(item) {
  return `
    <article class="audio-row" data-audio-id="${escapeHtml(item.id)}" data-audio-path="${escapeHtml(item.path)}" data-audio-title="${escapeHtml(item.title)}" data-audio-mime="${escapeHtml(item.mime || '')}" data-audio-url="${escapeHtml(item.url || '')}" data-audio-size="${escapeHtml(String(item.size || 0))}" data-audio-category="${escapeHtml(item.category)}">
      <div class="audio-row-copy">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(categoryLabel(item.category))} · ${escapeHtml(formatAudioSize(item.size))}</span>
      </div>
      <div class="audio-row-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-action="play-audio">Play</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="delete-audio">Delete</button>
      </div>
      <audio class="audio-row-player" preload="none" controls hidden></audio>
    </article>
  `
}

function listHtml(items, category) {
  if (!category) {
    return `
      <div class="audio-empty">
        <div class="audio-empty-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <strong>Choose a voice part</strong>
        <p>Select Soprano, Alto, Tenor, Bass, or Mixed before recording or listening.</p>
      </div>
    `
  }

  if (!items.length) {
    return `
      <div class="audio-empty audio-empty-compact">
        <strong>No ${escapeHtml(categoryLabel(category))} recordings yet</strong>
        <p>Tap Record below to add one for this voice part.</p>
      </div>
    `
  }

  return `<div class="audio-list">${items.map(recordingRowHtml).join('')}</div>`
}

function pageHtml({ category = '', items = [], notice = '' } = {}) {
  const canRecord = isValidAudioCategory(category)
  return `
    <section class="page audio-page" data-audio-category="${escapeHtml(category)}">
      <div class="page-head page-head-compact">
        <h1>Audio</h1>
        <p>Recordings by voice part</p>
      </div>

      ${categoryTabsHtml(category)}

      <div class="audio-toolbar">
        <p class="audio-toolbar-copy" id="audio-toolbar-copy">
          ${
            canRecord
              ? `Selected · <strong>${escapeHtml(categoryLabel(category))}</strong>`
              : 'Select a category to continue'
          }
        </p>
        <div class="audio-toolbar-actions">
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            id="audio-upload-btn"
            ${canRecord ? '' : 'disabled'}
          >Upload</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            id="audio-record-btn"
            ${canRecord ? '' : 'disabled'}
          >Record</button>
          <input
            type="file"
            id="audio-upload-input"
            accept="${AUDIO_ACCEPT}"
            multiple
            hidden
          />
        </div>
      </div>

      ${notice ? `<p class="sync-notice audio-notice">${escapeHtml(notice)}</p>` : ''}

      <div class="audio-panel" id="audio-panel">
        ${listHtml(items, category)}
      </div>

      <div class="audio-record-sheet" id="audio-record-sheet" hidden>
        <button type="button" class="audio-record-backdrop" id="audio-rec-backdrop" aria-label="Close recorder"></button>
        <div class="audio-record-card" role="dialog" aria-modal="true" aria-labelledby="audio-record-cat-label">
          <div class="audio-record-handle" aria-hidden="true"></div>
          <div class="audio-record-head">
            <div>
              <p class="audio-record-eyebrow">Recording for</p>
              <h2 id="audio-record-cat-label">${escapeHtml(canRecord ? categoryLabel(category) : '—')}</h2>
            </div>
            <button type="button" class="audio-record-close" id="audio-rec-cancel" aria-label="Close">✕</button>
          </div>

          <div class="audio-record-viz" id="audio-record-viz" data-state="idle">
            <canvas id="audio-wave-canvas" class="audio-wave-canvas" width="640" height="120" aria-hidden="true"></canvas>
            <p class="audio-record-timer" id="audio-record-timer">00:00</p>
            <div class="audio-record-pulse" aria-hidden="true"></div>
          </div>

          <p class="audio-record-hint" id="audio-record-hint">Tap Start, then Stop when finished.</p>
          <label class="store-field-label" for="audio-record-title">Title</label>
          <input id="audio-record-title" type="text" maxlength="80" placeholder="e.g. Panunuluyan — Tenor line" />
          <p class="form-error" id="audio-record-error" hidden></p>
          <div class="audio-record-actions">
            <button type="button" class="btn btn-primary" id="audio-rec-start">Start</button>
            <button type="button" class="btn btn-ghost" id="audio-rec-stop" disabled>Stop</button>
            <button type="button" class="btn btn-primary" id="audio-rec-save" hidden>Save</button>
          </div>
        </div>
      </div>
    </section>
  `
}

async function loadCategoryItems(category) {
  if (!isValidAudioCategory(category)) return []
  try {
    await pullAudioRecordings()
  } catch (error) {
    console.warn('Audio pull failed:', error)
  }
  return getAudioByCategory(category)
}

export async function renderAudio() {
  return pageHtml({ category: '', items: [] })
}

export function bindAudio(root = document.getElementById('page-content')) {
  if (!root) return

  let selectedCategory = root.querySelector('.audio-page')?.dataset.audioCategory || ''
  let mediaRecorder = null
  let mediaStream = null
  let chunks = []
  let recordedBlob = null
  let recordedMime = ''
  let timerId = 0
  let startedAt = 0
  let activeObjectUrl = ''
  let audioCtx = null
  let analyser = null
  let waveRaf = 0

  const panel = () => root.querySelector('#audio-panel')
  const recordBtn = () => root.querySelector('#audio-record-btn')
  const uploadBtn = () => root.querySelector('#audio-upload-btn')
  const uploadInput = () => root.querySelector('#audio-upload-input')
  const sheet = () => root.querySelector('#audio-record-sheet')
  const vizEl = () => root.querySelector('#audio-record-viz')
  const waveCanvas = () => root.querySelector('#audio-wave-canvas')
  const timerEl = () => root.querySelector('#audio-record-timer')
  const hintEl = () => root.querySelector('#audio-record-hint')
  const errorEl = () => root.querySelector('#audio-record-error')
  const titleInput = () => root.querySelector('#audio-record-title')
  const catLabel = () => root.querySelector('#audio-record-cat-label')
  const startBtn = () => root.querySelector('#audio-rec-start')
  const stopBtn = () => root.querySelector('#audio-rec-stop')
  const saveBtn = () => root.querySelector('#audio-rec-save')

  const setVizState = (state) => {
    const el = vizEl()
    if (el) el.dataset.state = state
  }

  const stopWave = () => {
    if (waveRaf) cancelAnimationFrame(waveRaf)
    waveRaf = 0
    try {
      audioCtx?.close?.()
    } catch {
      /* ignore */
    }
    audioCtx = null
    analyser = null

    const canvas = waveCanvas()
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // Idle soft bars
    const bars = 28
    const gap = 4
    const barW = (canvas.width - gap * (bars - 1)) / bars
    ctx.fillStyle = 'rgba(107, 68, 35, 0.22)'
    for (let i = 0; i < bars; i += 1) {
      const h = 12 + ((i * 7) % 18)
      const x = i * (barW + gap)
      const y = (canvas.height - h) / 2
      ctx.fillRect(x, y, barW, h)
    }
  }

  const drawWave = () => {
    const canvas = waveCanvas()
    if (!canvas || !analyser) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const buffer = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(buffer)

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const bars = 32
    const gap = 3
    const barW = (canvas.width - gap * (bars - 1)) / bars
    const step = Math.floor(buffer.length / bars)

    for (let i = 0; i < bars; i += 1) {
      const value = buffer[i * step] || 0
      const h = Math.max(8, (value / 255) * (canvas.height * 0.9))
      const x = i * (barW + gap)
      const y = (canvas.height - h) / 2
      const grad = ctx.createLinearGradient(0, y, 0, y + h)
      grad.addColorStop(0, '#c9a66b')
      grad.addColorStop(1, '#6b4423')
      ctx.fillStyle = grad
      ctx.fillRect(x, y, barW, h)
    }

    waveRaf = requestAnimationFrame(drawWave)
  }

  const startWave = (stream) => {
    stopWave()
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
      const source = audioCtx.createMediaStreamSource(stream)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)
      drawWave()
    } catch (error) {
      console.warn('Wave visualizer unavailable:', error)
    }
  }

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

  const formatTimer = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000))
    const m = String(Math.floor(total / 60)).padStart(2, '0')
    const s = String(total % 60).padStart(2, '0')
    return `${m}:${s}`
  }

  const stopTimer = () => {
    if (timerId) window.clearInterval(timerId)
    timerId = 0
  }

  const startTimer = () => {
    stopTimer()
    startedAt = Date.now()
    const el = timerEl()
    if (el) el.textContent = '00:00'
    timerId = window.setInterval(() => {
      const t = timerEl()
      if (t) t.textContent = formatTimer(Date.now() - startedAt)
    }, 250)
  }

  const cleanupStream = () => {
    stopTimer()
    stopWave()
    setVizState('idle')
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
      } catch {
        /* ignore */
      }
    }
    mediaRecorder = null
    mediaStream?.getTracks?.().forEach((track) => track.stop())
    mediaStream = null
    chunks = []
  }

  const closeSheet = () => {
    cleanupStream()
    recordedBlob = null
    recordedMime = ''
    const sh = sheet()
    if (sh) {
      sh.classList.remove('is-open')
      window.setTimeout(() => {
        if (sh.classList.contains('is-open')) return
        sh.hidden = true
      }, 220)
    }
    setError('')
    const title = titleInput()
    if (title) title.value = ''
    const save = saveBtn()
    const start = startBtn()
    const stop = stopBtn()
    if (save) save.hidden = true
    if (start) {
      start.disabled = false
      start.hidden = false
      start.textContent = 'Start'
    }
    if (stop) stop.disabled = true
    const hint = hintEl()
    if (hint) hint.textContent = 'Tap Start, then Stop when finished.'
    const timer = timerEl()
    if (timer) timer.textContent = '00:00'
  }

  const openSheet = () => {
    if (!isValidAudioCategory(selectedCategory)) {
      alert('Select a voice part first (Soprano, Alto, Tenor, Bass, or Mixed).')
      return
    }
    const sh = sheet()
    if (!sh) return
    if (catLabel()) catLabel().textContent = categoryLabel(selectedCategory)
    if (titleInput()) {
      titleInput().value = `${categoryLabel(selectedCategory)} recording`
    }
    setError('')
    setVizState('idle')
    stopWave()
    sh.hidden = false
    requestAnimationFrame(() => sh.classList.add('is-open'))
  }

  const remountList = async (notice = '') => {
    const items = await getAudioByCategory(selectedCategory)
    const page = root.querySelector('.audio-page')
    if (page) page.dataset.audioCategory = selectedCategory

    root.querySelectorAll('.audio-cat').forEach((btn) => {
      const active = btn.dataset.category === selectedCategory
      btn.classList.toggle('is-active', active)
      btn.setAttribute('aria-selected', active ? 'true' : 'false')
    })

    const copy = root.querySelector('#audio-toolbar-copy')
    if (copy) {
      copy.innerHTML = isValidAudioCategory(selectedCategory)
        ? `Selected · <strong>${escapeHtml(categoryLabel(selectedCategory))}</strong>`
        : 'Select a category to continue'
    }

    const canUse = isValidAudioCategory(selectedCategory)
    const btn = recordBtn()
    if (btn) btn.disabled = !canUse
    const upBtn = uploadBtn()
    if (upBtn) upBtn.disabled = !canUse

    const host = panel()
    if (host) host.innerHTML = listHtml(items, selectedCategory)

    let noticeEl = root.querySelector('.audio-notice')
    if (notice) {
      if (!noticeEl) {
        noticeEl = document.createElement('p')
        noticeEl.className = 'sync-notice audio-notice'
        root.querySelector('.audio-toolbar')?.after(noticeEl)
      }
      noticeEl.textContent = notice
    } else if (noticeEl) {
      noticeEl.remove()
    }
  }

  // Initial pull for empty state readiness
  pullAudioRecordings().catch(() => {})

  root.querySelector('.audio-cats')?.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action="select-cat"]')
    if (!btn) return
    selectedCategory = btn.dataset.category || ''
    closeSheet()
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl)
      activeObjectUrl = ''
    }
    await remountList()
  })

  recordBtn()?.addEventListener('click', () => {
    if (!isValidAudioCategory(selectedCategory)) {
      alert('Select a voice part first before recording.')
      return
    }
    openSheet()
  })

  uploadBtn()?.addEventListener('click', () => {
    if (!isValidAudioCategory(selectedCategory)) {
      alert('Select a voice part first before uploading.')
      return
    }
    uploadInput()?.click()
  })

  uploadInput()?.addEventListener('change', async (event) => {
    const input = event.currentTarget
    const files = Array.from(input.files || [])
    input.value = ''
    if (!files.length) return

    if (!isValidAudioCategory(selectedCategory)) {
      alert('Select a voice part first before uploading.')
      return
    }

    const upBtn = uploadBtn()
    if (upBtn) {
      upBtn.disabled = true
      upBtn.textContent = 'Uploading…'
    }

    let savedCount = 0
    let lastError = ''

    for (const file of files) {
      const err = validateAudioFile(file)
      if (err) {
        lastError = err
        continue
      }

      const title = String(file.name || '')
        .replace(/\.[^.]+$/, '')
        .trim() || `${categoryLabel(selectedCategory)} upload`

      try {
        const saved = await uploadAudioRecording({
          category: selectedCategory,
          title,
          blob: file,
          mime: file.type || 'audio/mpeg',
          fileName: file.name,
        })
        await putCachedAudio({
          path: saved.path,
          name: saved.title,
          mime: saved.mime,
          blob: file,
          size: saved.size,
          url: saved.url,
        })
        savedCount += 1
      } catch (error) {
        lastError = error?.message || 'Upload failed.'
      }
    }

    if (upBtn) {
      upBtn.disabled = !isValidAudioCategory(selectedCategory)
      upBtn.textContent = 'Upload'
    }

    if (savedCount) {
      await remountList(
        savedCount === 1
          ? 'Audio uploaded.'
          : `${savedCount} audio files uploaded.`,
      )
    }
    if (lastError && !savedCount) alert(lastError)
    else if (lastError) alert(`Some files failed: ${lastError}`)
  })

  root.querySelector('#audio-rec-cancel')?.addEventListener('click', closeSheet)
  root.querySelector('#audio-rec-backdrop')?.addEventListener('click', closeSheet)

  startBtn()?.addEventListener('click', async () => {
    setError('')
    if (!isValidAudioCategory(selectedCategory)) {
      setError('Select a voice part first.')
      return
    }
    if (!window.MediaRecorder) {
      setError('This phone/browser cannot record audio in-app.')
      return
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      const mime = pickRecorderMime()
      recordedMime = mime
      chunks = []
      recordedBlob = null

      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data)
      }

      mediaRecorder.onstop = () => {
        recordedBlob = new Blob(chunks, {
          type: mediaRecorder?.mimeType || recordedMime || 'audio/webm',
        })
        recordedMime = recordedBlob.type || recordedMime
        stopWave()
        setVizState('ready')
        mediaStream?.getTracks?.().forEach((track) => track.stop())
        mediaStream = null
        const save = saveBtn()
        const start = startBtn()
        if (save) save.hidden = false
        if (start) {
          start.hidden = false
          start.disabled = false
          start.textContent = 'Re-record'
        }
        const hint = hintEl()
        if (hint) hint.textContent = 'Review the title, then Save.'
      }

      mediaRecorder.start(250)
      startWave(mediaStream)
      setVizState('recording')
      startTimer()
      startBtn().disabled = true
      startBtn().textContent = 'Recording…'
      stopBtn().disabled = false
      saveBtn().hidden = true
      const hint = hintEl()
      if (hint) hint.textContent = 'Recording… tap Stop when done.'
    } catch (error) {
      setError(error?.message || 'Microphone permission is required to record.')
      cleanupStream()
    }
  })

  stopBtn()?.addEventListener('click', () => {
    stopTimer()
    stopBtn().disabled = true
    try {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    } catch (error) {
      setError(error?.message || 'Could not stop recording.')
    }
  })

  saveBtn()?.addEventListener('click', async () => {
    setError('')
    if (!isValidAudioCategory(selectedCategory)) {
      setError('Select a voice part first.')
      return
    }
    if (!recordedBlob?.size) {
      setError('Record something first, then Save.')
      return
    }

    const title = String(titleInput()?.value || '').trim() || `${categoryLabel(selectedCategory)} recording`
    const save = saveBtn()
    const start = startBtn()
    const cancel = root.querySelector('#audio-rec-cancel')
    if (save) {
      save.disabled = true
      save.textContent = 'Saving…'
    }
    if (start) start.disabled = true
    if (cancel) cancel.disabled = true

    try {
      const saved = await uploadAudioRecording({
        category: selectedCategory,
        title,
        blob: recordedBlob,
        mime: recordedMime || recordedBlob.type,
      })
      await putCachedAudio({
        path: saved.path,
        name: saved.title,
        mime: saved.mime,
        blob: recordedBlob,
        size: saved.size,
        url: saved.url,
      })
      closeSheet()
      await remountList('Recording saved.')
    } catch (error) {
      setError(error?.message || 'Could not save recording.')
    } finally {
      if (save) {
        save.disabled = false
        save.textContent = 'Save'
      }
      if (start) start.disabled = false
      if (cancel) cancel.disabled = false
    }
  })

  root.addEventListener('click', async (event) => {
    const playBtn = event.target.closest('[data-action="play-audio"]')
    if (playBtn && root.contains(playBtn)) {
      const row = playBtn.closest('.audio-row')
      if (!row) return
      const player = row.querySelector('.audio-row-player')
      if (!player) return

      try {
        playBtn.disabled = true
        playBtn.textContent = '…'
        if (activeObjectUrl) {
          URL.revokeObjectURL(activeObjectUrl)
          activeObjectUrl = ''
        }
        root.querySelectorAll('.audio-row-player').forEach((el) => {
          el.pause()
          el.hidden = true
        })

        const result = await ensureAudioPlayUrl({
          path: row.dataset.audioPath,
          title: row.dataset.audioTitle,
          mime: row.dataset.audioMime,
          url: row.dataset.audioUrl,
          size: Number(row.dataset.audioSize) || 0,
        })
        if (result.revoke) activeObjectUrl = result.url
        player.src = result.url
        player.hidden = false
        await player.play()
        playBtn.textContent = 'Play'
        playBtn.disabled = false
      } catch (error) {
        alert(error?.message || 'Could not play this recording.')
        playBtn.textContent = 'Play'
        playBtn.disabled = false
      }
      return
    }

    const deleteBtn = event.target.closest('[data-action="delete-audio"]')
    if (deleteBtn && root.contains(deleteBtn)) {
      const row = deleteBtn.closest('.audio-row')
      if (!row) return
      const title = row.dataset.audioTitle || 'this recording'
      const ok = await confirmModal({
        title: 'Delete recording?',
        message: `Remove “${title}” from ${categoryLabel(row.dataset.audioCategory)}?`,
        confirmText: 'Delete',
        cancelText: 'Keep',
        danger: true,
      })
      if (!ok) return

      await deleteAudioRecording({
        id: row.dataset.audioId,
        path: row.dataset.audioPath,
      })
      await removeCachedAudio([row.dataset.audioPath])
      await remountList('Recording deleted.')
    }
  })
}
