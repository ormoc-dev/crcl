import { ensureScheduleSeeded, getAllSchedule } from '../lib/schedule-store.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function section(title, items) {
  if (!items.length) return ''

  const rows = items
    .map(
      (item) => `
        <article class="schedule-item">
          <div class="schedule-item-day">${escapeHtml(item.day)}</div>
          <div class="schedule-item-body">
            <h2>${escapeHtml(item.title)}</h2>
            <p class="schedule-item-time">${escapeHtml(item.time)}</p>
            ${item.note ? `<p class="schedule-item-note">${escapeHtml(item.note)}</p>` : ''}
          </div>
        </article>
      `,
    )
    .join('')

  return `
    <section class="schedule-section">
      <h2 class="schedule-section-title">${escapeHtml(title)}</h2>
      <div class="schedule-list">${rows}</div>
    </section>
  `
}

export async function renderSchedule() {
  await ensureScheduleSeeded()
  const all = await getAllSchedule()
  const services = all
    .filter((item) => item.type === 'service')
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))
  const practices = all
    .filter((item) => item.type === 'practice')
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time))

  const sections = section('Choir service', services) + section('Practice', practices)
  const body = sections || `<div class="store-empty">No schedule yet.</div>`

  return `
    <section class="page">
      <div class="page-head">
        <h1>Schedule</h1>
        <p>Christus Rex Choir service & practice times</p>
      </div>
      ${body}
    </section>
  `
}
