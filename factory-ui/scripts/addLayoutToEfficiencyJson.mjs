import fs from 'node:fs/promises'
import path from 'node:path'

const INPUT = path.resolve('public', 'mock', 'factory_efficiency_data.json')

function ensureNumber(n, fallback) {
  const v = Number(n)
  return Number.isFinite(v) ? v : fallback
}

function addLayout(seed) {
  const zonePad = 40
  const zoneW = 520
  const zoneH = 300
  const zoneGapX = 40
  const zoneGapY = 40

  const machineR = 18
  const machineGapX = 64
  const machineGapY = 56
  const machinePadX = 70
  const machinePadY = 70

  for (const f of seed.factories || []) {
    for (const p of f.plants || []) {
      for (const d of p.departments || []) {
        const zones = d.zones || d.layout?.zones || []

        // place zones in a 2-column grid
        const cols = 2
        zones.forEach((z, zi) => {
          if (z == null) return

          const col = zi % cols
          const row = Math.floor(zi / cols)

          z.x = ensureNumber(z.x, zonePad + col * (zoneW + zoneGapX))
          z.y = ensureNumber(z.y, zonePad + row * (zoneH + zoneGapY))
          z.width = ensureNumber(z.width, zoneW)
          z.height = ensureNumber(z.height, zoneH)

          const machines = z.machines || []

          const perRow = Math.max(1, Math.floor((z.width - machinePadX * 2) / machineGapX))
          machines.forEach((m, mi) => {
            if (m == null) return
            const c = mi % perRow
            const r = Math.floor(mi / perRow)

            // store center point for SVG circle
            m.x = ensureNumber(m.x, z.x + machinePadX + c * machineGapX)
            m.y = ensureNumber(m.y, z.y + machinePadY + r * machineGapY)

            // optional sizing metadata
            m.r = ensureNumber(m.r, machineR)
          })
        })

        // keep existing schema key
        if (d.layout?.zones && !d.zones) d.zones = d.layout.zones
      }
    }
  }

  return seed
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : INPUT
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : inputPath

  const raw = await fs.readFile(inputPath, 'utf-8')
  const json = JSON.parse(raw)

  if (!json?.factories) throw new Error('Unexpected JSON format: missing factories[]')

  const next = addLayout(json)
  await fs.writeFile(outputPath, JSON.stringify(next, null, 2), 'utf-8')

  // eslint-disable-next-line no-console
  console.log(`Wrote layout metadata to: ${outputPath}`)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
