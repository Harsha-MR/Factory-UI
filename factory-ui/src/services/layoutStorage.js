const STORAGE_PREFIX = 'factory-ui:dept-layout'

function resolveUserId() {
  // This app currently has no auth provider. When you add login,
  // replace this with the logged-in user's stable identifier.
  try {
    // Allow an injected global in case the host app sets it.
    const globalId = typeof window !== 'undefined' ? window.__FACTORY_UI_USER_ID__ : ''
    if (globalId) return String(globalId).trim() || 'shared'

    // Fallback for local testing:
    // localStorage.setItem('factory-ui:userId', 'employee-123')
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('factory-ui:userId') : ''
    if (ls) return String(ls).trim() || 'shared'
  } catch {
    // ignore
  }
  return 'shared'
}

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
    // Treat the API as the primary storage in all modes.
    return true
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
  if (!canUseDevApi()) return getDepartmentCustomLayoutVersions(ctx)

  try {
    const url = new URL('/api/layouts', window.location.origin)
    url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
    url.searchParams.set('plantId', String(ctx?.plantId || ''))
    url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
    url.searchParams.set('userId', resolveUserId())

    const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    if (res.ok) {
      const json = await res.json()
      const bundle = normalizeStoredBundle(json)
      // Intentionally do NOT cache in localStorage (per requirement).
      return bundle
    }
  } catch {
    // ignore and fall back
  }

  return getDepartmentCustomLayoutVersions(ctx)
}

export function saveDepartmentCustomLayout(ctx, layout) {
  const nextCurrent = sanitizeDepartmentLayout({
    ...layout,
    updatedAt: new Date().toISOString(),
  })

  // Persist to backend API (best-effort). No browser storage.
  if (!canUseDevApi()) return
  try {
    const url = new URL('/api/layouts', window.location.origin)
    url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
    url.searchParams.set('plantId', String(ctx?.plantId || ''))
    url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
    url.searchParams.set('userId', resolveUserId())

    void fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layout: nextCurrent }),
    }).catch(() => {})
  } catch {
    // ignore
  }
}

export function deleteDepartmentCustomLayout(ctx) {
  if (!canUseDevApi()) return
  try {
    const url = new URL('/api/layouts', window.location.origin)
    url.searchParams.set('factoryId', String(ctx?.factoryId || ''))
    url.searchParams.set('plantId', String(ctx?.plantId || ''))
    url.searchParams.set('departmentId', String(ctx?.departmentId || ''))
    url.searchParams.set('userId', resolveUserId())
    void fetch(url.toString(), { method: 'DELETE' }).catch(() => {})
  } catch {
    // ignore
  }
}
