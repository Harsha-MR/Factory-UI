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

function normalizeStoredBundle(raw) {
  // Backward compatible:
  // - old schema: a layout object {version,elements,...}
  // - new schema: { current: <layout>, previous: <layout> }
  if (!raw || typeof raw !== 'object') return { current: null, previous: null }

  const looksLikeLayout = Array.isArray(raw.elements) || typeof raw.version !== 'undefined'
  if (looksLikeLayout) {
    return { current: sanitizeDepartmentLayout(raw), previous: null }
  }

  const current = raw.current ? sanitizeDepartmentLayout(raw.current) : null
  const previous = raw.previous ? sanitizeDepartmentLayout(raw.previous) : null
  return { current, previous }
}

function canUseDevApi() {
  try {
    return !!import.meta?.env?.DEV
  } catch {
    return false
  }
}

function writeBundleToLocalStorage(ctx, bundle) {
  if (typeof localStorage === 'undefined') return
  const key = buildKey(ctx)
  const safe = {
    current: bundle?.current ? sanitizeDepartmentLayout(bundle.current) : null,
    previous: bundle?.previous ? sanitizeDepartmentLayout(bundle.previous) : null,
  }
  localStorage.setItem(key, JSON.stringify(safe))
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

  const threeD = raw.threeD && typeof raw.threeD === 'object'
    ? {
        floorModelUrl: raw.threeD.floorModelUrl ? String(raw.threeD.floorModelUrl) : undefined,
        floorModelScale: Number.isFinite(Number(raw.threeD.floorModelScale))
          ? Math.max(0.01, Math.min(50, Number(raw.threeD.floorModelScale)))
          : undefined,
        floorModelAutoRotate: !!raw.threeD.floorModelAutoRotate,
      }
    : null

  return {
    version,
    background: background?.src ? background : null,
    assets,
    threeD,
    elements,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  }
}

export function getDepartmentCustomLayout(ctx) {
  if (typeof localStorage === 'undefined') return null
  const key = buildKey(ctx)
  const raw = safeJsonParse(localStorage.getItem(key))
  return normalizeStoredBundle(raw).current
}

export function getDepartmentCustomLayoutVersions(ctx) {
  if (typeof localStorage === 'undefined') return { current: null, previous: null }
  const key = buildKey(ctx)
  const raw = safeJsonParse(localStorage.getItem(key))
  return normalizeStoredBundle(raw)
}

export async function fetchDepartmentCustomLayoutVersions(ctx) {
  // Prefer dev API-backed JSON file storage when available.
  if (canUseDevApi()) {
    try {
      const url = new URL('/api/layouts', window.location.origin)
      url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
      url.searchParams.set('plantId', String(ctx?.plantId || ''))
      url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
      if (res.ok) {
        const json = await res.json()
        const bundle = normalizeStoredBundle(json)
        writeBundleToLocalStorage(ctx, bundle)
        return bundle
      }
    } catch {
      // ignore and fall back
    }
  }

  return getDepartmentCustomLayoutVersions(ctx)
}

export function saveDepartmentCustomLayout(ctx, layout) {
  if (typeof localStorage === 'undefined') return
  const key = buildKey(ctx)

  const existing = normalizeStoredBundle(safeJsonParse(localStorage.getItem(key)))
  const nextCurrent = sanitizeDepartmentLayout({
    ...layout,
    updatedAt: new Date().toISOString(),
  })

  // On each save, shift: current -> previous, new -> current.
  const bundle = {
    current: nextCurrent,
    previous: existing.current || null,
  }

  localStorage.setItem(key, JSON.stringify(bundle))

  // Also persist to dev JSON file via Vite middleware (best-effort).
  if (canUseDevApi()) {
    try {
      const url = new URL('/api/layouts', window.location.origin)
      url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
      url.searchParams.set('plantId', String(ctx?.plantId || ''))
      url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
      void fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: nextCurrent }),
      }).catch(() => {})
    } catch {
      // ignore
    }
  }
}

export function deleteDepartmentCustomLayout(ctx) {
  if (typeof localStorage === 'undefined') return
  const key = buildKey(ctx)
  localStorage.removeItem(key)

  if (canUseDevApi()) {
    try {
      const url = new URL('/api/layouts', window.location.origin)
      url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
      url.searchParams.set('plantId', String(ctx?.plantId || ''))
      url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
      void fetch(url.toString(), { method: 'DELETE' }).catch(() => {})
    } catch {
      // ignore
    }
  }
}
