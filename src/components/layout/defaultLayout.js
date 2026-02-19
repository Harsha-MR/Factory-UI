import { ELEMENT_TYPES, clamp01 } from './layoutTypes'

export function createDefaultLayoutForDepartment(department) {
  const zones = Array.isArray(department?.zones) ? department.zones : []

  const elements = []

  const zoneCount = zones.length
  if (zoneCount === 0) {
    // Still create a default floor.
    elements.push({
      id: 'floor-1',
      type: ELEMENT_TYPES.FLOOR,
      label: 'Floor',
      x: 0.08,
      y: 0.08,
      w: 0.84,
      h: 0.84,
      rotationDeg: 0,
    })
    return {
      version: 1,
      background: null,
      assets: {},
      elements,
      updatedAt: null,
    }
  }

  const computeMachineGrid = (n) => {
    const count = Math.max(0, Number(n) || 0)
    if (count <= 0) return { cols: 1, rows: 1 }
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)))
    const rows = Math.ceil(count / cols)
    return { cols, rows }
  }

  // Specs in normalized units; later we uniformly scale everything to fit the canvas.
  const baseMachine = 0.055
  const baseGap = 0.012
  const baseInnerPad = 0.02
  const minZoneW = 0.20
  const minZoneH = 0.16
  const maxZoneW = 0.62
  const maxZoneH = 0.62

  const zoneSpecs = zones.map((z, i) => {
    const machines = Array.isArray(z?.machines) ? z.machines : []
    const n = machines.length
    const grid = computeMachineGrid(n)
    const wRaw = baseInnerPad * 2 + grid.cols * baseMachine + (grid.cols - 1) * baseGap
    const hRaw = baseInnerPad * 2 + grid.rows * baseMachine + (grid.rows - 1) * baseGap
    const w = Math.max(minZoneW, Math.min(maxZoneW, wRaw))
    const h = Math.max(minZoneH, Math.min(maxZoneH, hRaw))

    return {
      key: `zone-${z?.id || i}`,
      label: z?.name || `Zone ${i + 1}`,
      machines,
      grid,
      w,
      h,
    }
  })

  // Grid packing with variable-sized zones:
  // - choose columns
  // - compute per-col widths and per-row heights
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(zoneCount))))
  const rows = Math.ceil(zoneCount / cols)

  const colWidths = Array.from({ length: cols }, () => 0)
  const rowHeights = Array.from({ length: rows }, () => 0)

  zoneSpecs.forEach((spec, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    if (row >= rows) return
    colWidths[col] = Math.max(colWidths[col], spec.w)
    rowHeights[row] = Math.max(rowHeights[row], spec.h)
  })

  const baseFloorPad = 0.035
  const baseGutterX = 0.03
  const baseGutterY = 0.035

  const baseTotalW = colWidths.reduce((a, b) => a + b, 0) + baseGutterX * (cols - 1) + baseFloorPad * 2
  const baseTotalH = rowHeights.reduce((a, b) => a + b, 0) + baseGutterY * (rows - 1) + baseFloorPad * 2

  // Scale down uniformly if we don't fit.
  const maxCanvas = 0.92
  const scale = Math.min(1, maxCanvas / Math.max(baseTotalW, 0.0001), maxCanvas / Math.max(baseTotalH, 0.0001))

  const floorPad = baseFloorPad * scale
  const gutterX = baseGutterX * scale
  const gutterY = baseGutterY * scale
  const innerPad = baseInnerPad * scale
  const gap = baseGap * scale

  const colWScaled = colWidths.map((w) => w * scale)
  const rowHScaled = rowHeights.map((h) => h * scale)

  const usedW = colWScaled.reduce((a, b) => a + b, 0) + gutterX * (cols - 1)
  const usedH = rowHScaled.reduce((a, b) => a + b, 0) + gutterY * (rows - 1)

  const floorW = clamp01(Math.min(0.98, usedW + floorPad * 2))
  const floorH = clamp01(Math.min(0.98, usedH + floorPad * 2))
  const floorX = clamp01((1 - floorW) / 2)
  const floorY = clamp01((1 - floorH) / 2)

  elements.push({
    id: 'floor-1',
    type: ELEMENT_TYPES.FLOOR,
    label: 'Floor',
    x: floorX,
    y: floorY,
    w: floorW,
    h: floorH,
    rotationDeg: 0,
  })

  const colStartX = []
  for (let c = 0, x = floorX + floorPad; c < cols; c += 1) {
    colStartX[c] = x
    x += colWScaled[c] + gutterX
  }

  const rowStartY = []
  for (let r = 0, y = floorY + floorPad; r < rows; r += 1) {
    rowStartY[r] = y
    y += rowHScaled[r] + gutterY
  }

  zoneSpecs.forEach((spec, i) => {
    const row = Math.floor(i / cols)
    const col = i % cols
    if (row >= rows) return

    const cellW = colWScaled[col]
    const cellH = rowHScaled[row]
    const zoneW = spec.w * scale
    const zoneH = spec.h * scale

    // Center zone in its row/col cell.
    const x = clamp01(colStartX[col] + Math.max(0, (cellW - zoneW) / 2))
    const y = clamp01(rowStartY[row] + Math.max(0, (cellH - zoneH) / 2))

    elements.push({
      id: spec.key,
      type: ELEMENT_TYPES.ZONE,
      label: spec.label,
      x,
      y,
      w: clamp01(zoneW),
      h: clamp01(zoneH),
      rotationDeg: 0,
      color: 'dark-green',
    })

    const machines = spec.machines
    const n = machines.length
    if (n <= 0) return

    const mCols = spec.grid.cols
    const mRows = spec.grid.rows
    const availW = Math.max(0.02, zoneW - innerPad * 2)
    const availH = Math.max(0.02, zoneH - innerPad * 2)
    const cellMW = (availW - gap * (mCols - 1)) / mCols
    const cellMH = (availH - gap * (mRows - 1)) / mRows
    const size = clamp01(Math.max(0.02, Math.min(cellMW, cellMH) * 0.92))

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
        w: size,
        h: size,
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
