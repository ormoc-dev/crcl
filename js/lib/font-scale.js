const STORAGE_KEY = 'crc-text-scale'

export const FONT_SCALE_OPTIONS = [
  { value: '0.9', label: 'S', title: 'Small' },
  { value: '1', label: 'M', title: 'Default' },
  { value: '1.15', label: 'L', title: 'Large' },
  { value: '1.3', label: 'XL', title: 'Extra large' },
]

function normalizeScale(value) {
  const raw = String(value || '').trim()
  const allowed = FONT_SCALE_OPTIONS.map((opt) => opt.value)
  return allowed.includes(raw) ? raw : '1'
}

export function getFontScale() {
  try {
    return normalizeScale(localStorage.getItem(STORAGE_KEY))
  } catch {
    return '1'
  }
}

export function applyFontScale(scale = getFontScale()) {
  const value = normalizeScale(scale)
  document.documentElement.style.setProperty('--text-scale', value)
  document.documentElement.dataset.textScale = value
  return value
}

export function setFontScale(scale) {
  const value = normalizeScale(scale)
  try {
    localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
  return applyFontScale(value)
}
