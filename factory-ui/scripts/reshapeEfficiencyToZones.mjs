import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const filePath = path.join(root, 'public', 'mock', 'factory_efficiency_data.json')

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function parseMachineNumber(machine) {
  const raw = machine?.machineName ?? machine?.name ?? machine?.machineId ?? machine?.id ?? ''
  const m = String(raw).match(/(\d+)/)
  return m ? Number.parseInt(m[1], 10) : null
}

function nextMachineId(existingIds) {
  let n = 1
  while (existingIds.has(`m${n}`)) n++
  return `m${n}`
}

function ensureAtLeastMachines(list, minCount) {
  const machines = Array.isArray(list) ? list : []
  const out = deepClone(machines)

  const ids = new Set(out.map((m) => m.machineId ?? m.id).filter(Boolean))
  const usedNums = new Set(out.map(parseMachineNumber).filter((n) => Number.isFinite(n)))

  // Use a stable template
  const template = out[0] || {
    status: 'RUNNING',
    timeMetrics: {
      plannedProductionTime: 28800,
      runTime: 20000,
      idleTime: 5000,
      breakdownTime: 0,
      offTime: 3800,
    },
    productionMetrics: {
      idealCycleTime: 1.2,
      actualCycleTime: 1.5,
      totalPartsProduced: 8000,
      goodParts: 7700,
      rejectedParts: 300,
    },
    shiftInfo: { shiftId: 'SH1', operatorName: 'Operator-1' },
  }

  let maxNum = 0
  for (const n of usedNums) maxNum = Math.max(maxNum, n)

  while (out.length < minCount) {
    maxNum += 1
    const machineId = nextMachineId(ids)
    ids.add(machineId)

    const cloned = deepClone(template)
    cloned.machineId = machineId
    cloned.machineName = `Machine-${maxNum}`

    // vary status a bit
    const mod = maxNum % 10
    cloned.status = mod === 0 ? 'DOWN' : mod === 3 ? 'IDLE' : 'RUNNING'

    // slightly vary metrics
    if (cloned.timeMetrics) {
      cloned.timeMetrics.runTime = Math.max(0, cloned.timeMetrics.runTime - (maxNum % 7) * 200)
      cloned.timeMetrics.idleTime = Math.max(0, cloned.timeMetrics.idleTime + (maxNum % 5) * 150)
      cloned.timeMetrics.breakdownTime = cloned.status === 'DOWN' ? 1200 : 0
    }
    if (cloned.productionMetrics) {
      cloned.productionMetrics.totalPartsProduced = Math.max(0, cloned.productionMetrics.totalPartsProduced + (maxNum % 9) * 300)
      cloned.productionMetrics.goodParts = Math.max(0, cloned.productionMetrics.totalPartsProduced - (maxNum % 4) * 120)
      cloned.productionMetrics.rejectedParts = Math.max(0, cloned.productionMetrics.totalPartsProduced - cloned.productionMetrics.goodParts)
    }

    if (!cloned.shiftInfo) cloned.shiftInfo = { shiftId: 'SH1', operatorName: 'Operator-1' }
    cloned.shiftInfo.operatorName = `Operator-${(maxNum % 60) + 1}`

    out.push(cloned)
  }

  return out
}

function splitIntoTwoZones(machines) {
  const list = Array.isArray(machines) ? machines : []

  // Ensure >10 machines per zone => at least 22 total
  const ensured = ensureAtLeastMachines(list, 22)

  // Split roughly evenly, but each zone must have >= 11
  const half = Math.max(11, Math.floor(ensured.length / 2))
  const aCount = Math.min(ensured.length - 11, Math.max(11, half))
  const zoneA = ensured.slice(0, aCount)
  const zoneB = ensured.slice(aCount)

  // If zoneB < 11, move some from A
  while (zoneB.length < 11 && zoneA.length > 11) {
    zoneB.unshift(zoneA.pop())
  }

  return { zoneA, zoneB }
}

function reshape(json) {
  const out = deepClone(json)
  const factories = out.factories || []

  for (const f of factories) {
    for (const p of f.plants || []) {
      for (const d of p.departments || []) {
        const deptId = d.departmentId ?? d.id

        // Source machines from existing department.machines if present; otherwise flatten any existing zones.
        let machines = d.machines
        if (!Array.isArray(machines)) {
          const fromZones = []
          for (const z of d.zones || []) {
            for (const m of z?.machines || []) fromZones.push(m)
          }
          machines = fromZones
        }

        const { zoneA, zoneB } = splitIntoTwoZones(machines)

        d.zones = [
          { id: `${deptId}-z1`, name: 'Zone A', machines: zoneA },
          { id: `${deptId}-z2`, name: 'Zone B', machines: zoneB },
        ]

        // Enforce hierarchy: department -> zones -> machines
        delete d.machines
        delete d.layout
      }
    }
  }

  return out
}

const raw = fs.readFileSync(filePath, 'utf8')
const json = JSON.parse(raw)
const next = reshape(json)

fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + '\n', 'utf8')
console.log('Updated:', filePath)
