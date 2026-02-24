import { ELEMENT_TYPES, clamp01 } from './layoutTypes'

export function createDefaultLayoutForDepartment(department) {
  const zones = Array.isArray(department?.zones) ? department.zones : []

  const elements = []
  const basePlaneScale = 1

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
      threeD: { planeScale: basePlaneScale },
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

  // Odd-zone aware rows:
  // - 3 zones stay in one full row
  // - for 5/7/... the last row is stretched to full row width
  const pickCols = (count) => {
    if (count <= 1) return 1
    if (count <= 2) return 2
    if (count <= 5) return 3
    if (count <= 7) return 4
    return 5
  }
  const cols = pickCols(zoneCount)
  const rows = Math.ceil(zoneCount / cols)
  const fullRows = Math.floor(zoneCount / cols)
  const remainder = zoneCount % cols

  const rowSpecs = []
  if (remainder > 0 && fullRows > 0) {
    rowSpecs.push(zoneSpecs.slice(zoneCount - remainder))
    for (let r = 0; r < fullRows; r += 1) {
      const start = r * cols
      rowSpecs.push(zoneSpecs.slice(start, start + cols))
    }
  } else {
    for (let r = 0; r < rows; r += 1) {
      const start = r * cols
      const end = Math.min(start + cols, zoneSpecs.length)
      rowSpecs.push(zoneSpecs.slice(start, end))
    }
  }

  const rowHeights = rowSpecs.map((items) =>
    items.reduce((m, s) => Math.max(m, s.h), 0),
  )

  const baseFloorPad = 0.035
  const baseGutterX = 0.03
  const baseGutterY = 0.035

  const rowWidths = rowSpecs.map(
    (items) =>
      items.reduce((sum, spec) => sum + spec.w, 0) +
      baseGutterX * Math.max(0, items.length - 1),
  )
  const contentW = rowWidths.reduce((m, w) => Math.max(m, w), 0)
  const baseTotalW = contentW + baseFloorPad * 2
  const baseTotalH = rowHeights.reduce((a, b) => a + b, 0) + baseGutterY * (rows - 1) + baseFloorPad * 2

  // Scale down uniformly if we don't fit.
  const maxCanvas = 0.92
  const scale = Math.min(1, maxCanvas / Math.max(baseTotalW, 0.0001), maxCanvas / Math.max(baseTotalH, 0.0001))
  const planeScale = scale > 0 ? 1 / scale : 1

  const floorPad = baseFloorPad * scale
  const gutterX = baseGutterX * scale
  const gutterY = baseGutterY * scale
  const innerPad = baseInnerPad * scale
  const gap = baseGap * scale

  const rowHScaled = rowHeights.map((h) => h * scale)
  const usedW = contentW * scale
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

  const rowStartY = []
  for (let r = 0, y = floorY + floorPad; r < rows; r += 1) {
    rowStartY[r] = y
    y += rowHScaled[r] + gutterY
  }

  rowSpecs.forEach((items, row) => {
    if (!items.length) return
    const rawRowW =
      items.reduce((sum, spec) => sum + spec.w, 0) +
      baseGutterX * Math.max(0, items.length - 1)
    const stretch = rawRowW > 0 ? contentW / rawRowW : 1
    const localGapX = gutterX * stretch
    const rowCellH = rowHScaled[row]
    const yBase = rowStartY[row]
    let xCursor = floorX + floorPad

    items.forEach((spec) => {
      const zoneW = spec.w * scale * stretch
      const zoneH = spec.h * scale
      const x = clamp01(xCursor)
      const y = clamp01(yBase + Math.max(0, (rowCellH - zoneH) / 2))

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
      if (n > 0) {
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
      }

      xCursor += zoneW + localGapX
    })
  })

  return {
    version: 1,
    background: null,
    assets: {},
    threeD: { planeScale },
    elements,
    updatedAt: null,
  }
}
