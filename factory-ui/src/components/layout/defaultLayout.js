import { ELEMENT_TYPES, clamp01 } from './layoutTypes'

export function createDefaultLayoutForDepartment(department) {
  const zones = Array.isArray(department?.zones) ? department.zones : []

  const elements = []

  // Base floor overlay. Zones/machines are laid out inside this rectangle.
  const floor = {
    id: 'floor-1',
    type: ELEMENT_TYPES.FLOOR,
    label: 'Floor',
    x: 0.05,
    y: 0.05,
    w: 0.9,
    h: 0.9,
    rotationDeg: 0,
  }
  elements.push(floor)

  if (zones.length === 0) {
    return {
      version: 1,
      background: null,
      assets: {},
      elements,
      updatedAt: null,
    }
  }

  // Choose a grid that packs zones into the floor.
  const zoneCount = zones.length
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(zoneCount))))
  const rows = Math.ceil(zoneCount / cols)

  const floorPad = 0.03
  const gutterX = 0.02
  const gutterY = 0.03

  const usableW = Math.max(0.05, floor.w - floorPad * 2)
  const usableH = Math.max(0.05, floor.h - floorPad * 2)

  const cellW = (usableW - gutterX * (cols - 1)) / cols
  const cellH = (usableH - gutterY * (rows - 1)) / rows

  const zoneW = Math.max(0.12, cellW * 0.94)
  const zoneH = Math.max(0.10, cellH * 0.90)

  zones.forEach((z, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols

    const cellX = floor.x + floorPad + col * (cellW + gutterX)
    const cellY = floor.y + floorPad + row * (cellH + gutterY)

    const x = clamp01(cellX + (cellW - zoneW) / 2)
    const y = clamp01(cellY + (cellH - zoneH) / 2)

    const zoneId = `zone-${z?.id || i}`
    elements.push({
      id: zoneId,
      type: ELEMENT_TYPES.ZONE,
      label: z?.name || `Zone ${i + 1}`,
      x,
      y,
      w: clamp01(zoneW),
      h: clamp01(zoneH),
      rotationDeg: 0,
      color: 'dark-green',
    })

    const machines = Array.isArray(z?.machines) ? z.machines : []
    const n = machines.length
    if (n === 0) return

    // Lay machines in a near-square grid inside the zone.
    const mCols = Math.max(1, Math.ceil(Math.sqrt(n)))
    const mRows = Math.ceil(n / mCols)

    const innerPad = Math.min(0.03, zoneW * 0.08)
    const gap = Math.min(0.02, zoneW * 0.05)

    const availW = Math.max(0.02, zoneW - innerPad * 2)
    const availH = Math.max(0.02, zoneH - innerPad * 2)

    const cellMW = (availW - gap * (mCols - 1)) / mCols
    const cellMH = (availH - gap * (mRows - 1)) / mRows
    const size = Math.max(0.02, Math.min(cellMW, cellMH) * 0.95)

    machines.forEach((m, mi) => {
      const r = Math.floor(mi / mCols)
      const c = mi % mCols

      const mx = clamp01(x + innerPad + c * (size + gap))
      const my = clamp01(y + innerPad + r * (size + gap))

      elements.push({
        id: `machine-${m?.id || mi}`,
        type: ELEMENT_TYPES.MACHINE,
        machineId: String(m?.id || ''),
        x: mx,
        y: my,
        w: clamp01(size),
        h: clamp01(size),
        rotationDeg: 0,
      })
    })
  })

  return {
    version: 1,
    background: null,
    assets: {},
    elements,
    updatedAt: null,
  }
}
