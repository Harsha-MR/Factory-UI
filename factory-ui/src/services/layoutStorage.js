const STORAGE_PREFIX = 'factory-ui:dept-layout'

function buildKey({ factoryId, plantId, departmentId }) {
  const dept = String(departmentId || '').trim()
  if (!dept) throw new Error('departmentId is required')

  const f = factoryId ? String(factoryId).trim() : ''
  const p = plantId ? String(plantId).trim() : ''

  // Prefer a scoped key when context is available (avoids collisions).
  if (f && p) return `${STORAGE_PREFIX}:${f}:${p}:${dept}`
  return `${STORAGE_PREFIX}:${dept}`
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function sanitizeDepartmentLayout(raw) {
  if (!raw || typeof raw !== 'object') return null

  const version = Number(raw.version || 1)
  const elements = Array.isArray(raw.elements) ? raw.elements.filter(Boolean) : []

  const background = raw.background && typeof raw.background === 'object'
    ? {
        type: raw.background.type === 'url' ? 'url' : 'dataUrl',
        src: String(raw.background.src || '').trim() || '',
      }
    : null

  const assets = raw.assets && typeof raw.assets === 'object'
    ? {
        machineIcon: raw.assets.machineIcon ? String(raw.assets.machineIcon) : undefined,
        transporterIcon: raw.assets.transporterIcon ? String(raw.assets.transporterIcon) : undefined,
      }
    : {}

  return {
    version,
    background: background?.src ? background : null,
    assets,
    elements,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  }
}

export function getDepartmentCustomLayout(ctx) {
  if (typeof localStorage === 'undefined') return null
  const key = buildKey(ctx)
  const raw = safeJsonParse(localStorage.getItem(key))
  return sanitizeDepartmentLayout(raw)
}

export function saveDepartmentCustomLayout(ctx, layout) {
  if (typeof localStorage === 'undefined') return
  const key = buildKey(ctx)
  const sanitized = sanitizeDepartmentLayout({
    ...layout,
    updatedAt: new Date().toISOString(),
  })
  localStorage.setItem(key, JSON.stringify(sanitized))
}

export function deleteDepartmentCustomLayout(ctx) {
  if (typeof localStorage === 'undefined') return
  const key = buildKey(ctx)
  localStorage.removeItem(key)
}
