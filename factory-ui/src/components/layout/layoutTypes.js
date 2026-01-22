export const ELEMENT_TYPES = /** @type {const} */ ({
  FLOOR: 'FLOOR',
  ZONE: 'ZONE',
  WALKWAY: 'WALKWAY',
  TRANSPORTER: 'TRANSPORTER',
  MACHINE: 'MACHINE',
})

export function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function coerceNum(n, fallback) {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

export function normalizeElement(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = raw.type
  if (!Object.values(ELEMENT_TYPES).includes(type)) return null

  const id = String(raw.id || '').trim()
  if (!id) return null

  const defaultW = type === ELEMENT_TYPES.FLOOR ? 0.9 : 0.15
  const defaultH = type === ELEMENT_TYPES.FLOOR ? 0.9 : 0.12

  return {
    id,
    type,
    label: raw.label ? String(raw.label) : '',
    machineId: raw.machineId ? String(raw.machineId) : undefined,
    modelUrl: raw.modelUrl ? String(raw.modelUrl) : undefined,
    scale: Math.max(0.01, Math.min(50, coerceNum(raw.scale, 1))),
    x: clamp01(coerceNum(raw.x, 0.1)),
    y: clamp01(coerceNum(raw.y, 0.1)),
    w: clamp01(coerceNum(raw.w, defaultW)),
    h: clamp01(coerceNum(raw.h, defaultH)),
    rotationDeg: coerceNum(raw.rotationDeg, 0),
    color: raw.color ? String(raw.color) : undefined,
    iconSrc: raw.iconSrc ? String(raw.iconSrc) : undefined,
  }
}

export function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object') {
    return { version: 1, background: null, assets: {}, threeD: null, elements: [], updatedAt: null }
  }

  const elements = Array.isArray(raw.elements) ? raw.elements.map(normalizeElement).filter(Boolean) : []

  const background = raw.background && typeof raw.background === 'object'
    ? {
        type: raw.background.type === 'url' ? 'url' : 'dataUrl',
        src: String(raw.background.src || '').trim(),
      }
    : null

  const threeD = raw.threeD && typeof raw.threeD === 'object'
    ? {
        floorModelUrl: raw.threeD.floorModelUrl ? String(raw.threeD.floorModelUrl) : undefined,
        floorModelScale: coerceNum(raw.threeD.floorModelScale, 1),
        floorModelAutoRotate: !!raw.threeD.floorModelAutoRotate,
      }
    : null

  return {
    version: Number(raw.version || 1),
    background: background?.src ? background : null,
    assets: raw.assets && typeof raw.assets === 'object' ? raw.assets : {},
    threeD,
    elements,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
  }
}
