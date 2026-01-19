import { ELEMENT_TYPES, clamp01 } from './layoutTypes'

function grid2(i) {
  const col = i % 2
  const row = Math.floor(i / 2)
  return { row, col }
}

export function createDefaultLayoutForDepartment(department) {
  const zones = Array.isArray(department?.zones) ? department.zones : []

  const elements = []

  const zoneW = 0.46
  const zoneH = 0.42
  const gutterX = 0.04
  const gutterY = 0.06
  const startX = 0.03
  const startY = 0.04

  zones.forEach((z, i) => {
    const { row, col } = grid2(i)
    const x = clamp01(startX + col * (zoneW + gutterX))
    const y = clamp01(startY + row * (zoneH + gutterY))

    elements.push({
      id: `zone-${z?.id || i}`,
      type: ELEMENT_TYPES.ZONE,
      label: z?.name || `Zone ${i + 1}`,
      x,
      y,
      w: zoneW,
      h: zoneH,
      rotationDeg: 0,
    })

    const machines = Array.isArray(z?.machines) ? z.machines : []
    const cols = 4
    const size = 0.095
    const pad = 0.02

    machines.slice(0, 16).forEach((m, mi) => {
      const r = Math.floor(mi / cols)
      const c = mi % cols

      const mx = clamp01(x + pad + c * (size + 0.015))
      const my = clamp01(y + 0.08 + r * (size + 0.02))

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
