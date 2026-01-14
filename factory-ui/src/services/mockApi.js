const NETWORK_MS = 350

// const SEED_URL = '/mock/factoryHierarchy.json'
const SEED_URL = '/mock/factory_efficiency_data.json'

let seedCache = null
let seedPromise = null

const IS_DEV = !!import.meta?.env?.DEV

// In-memory "live" copy (this mimics real-world changing state)
let live = null

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function getDepartmentMachines(department) {
  const machines = []
  for (const z of department?.zones || []) {
    for (const m of z?.machines || []) machines.push(m)
  }
  return machines
}

function computeDepartmentSummary(department) {
  const machines = getDepartmentMachines(department)

  const counts = {
    total: machines.length,
    running: 0,
    down: 0,
    idle: 0,
    warning: 0,
    offline: 0,
    maintenance: 0,
    critical: 0,
  }

  let plannedProductionTime = 0
  let runTime = 0
  let idealTimeForOutput = 0

  let totalParts = 0
  let goodParts = 0

  let latestUpdatedAtMs = 0
  for (const m of machines) {
    switch (m.status) {
      case 'RUNNING':
        counts.running++
        break
      case 'DOWN':
        counts.down++
        counts.critical++
        break
      case 'IDLE':
        counts.idle++
        break
      case 'WARNING':
        counts.warning++
        break
      case 'OFFLINE':
        counts.offline++
        counts.critical++
        break
      case 'MAINTENANCE':
        counts.maintenance++
        counts.critical++
        break
      default:
        break
    }

    const tm = m.timeMetrics
    const pm = m.productionMetrics

    const mPlanned = Number(tm?.plannedProductionTime || 0)
    const mRun = Number(tm?.runTime || 0)
    plannedProductionTime += mPlanned
    runTime += mRun

    const idealCycleTime = Number(pm?.idealCycleTime || 0)
    const parts = Number(pm?.totalPartsProduced || 0)
    const good = Number(pm?.goodParts || 0)
    totalParts += parts
    goodParts += good

    // Used for performance numerator
    idealTimeForOutput += idealCycleTime * parts

    if (m.updatedAt) {
      const t = new Date(m.updatedAt).getTime()
      if (Number.isFinite(t)) latestUpdatedAtMs = Math.max(latestUpdatedAtMs, t)
    }
  }

  const availability = plannedProductionTime > 0 ? runTime / plannedProductionTime : 0
  const performance = runTime > 0 ? idealTimeForOutput / runTime : 0
  const quality = totalParts > 0 ? goodParts / totalParts : 0
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)

  const oeePct = clamp01(oee) * 100
  // Thresholds:
  // - OK (green): > 80
  // - ACTION REQUIRED (amber): 60..80
  // - CRITICAL (red): < 60
  const severity = oeePct < 60 ? 'CRITICAL' : oeePct <= 80 ? 'ACTION_REQUIRED' : 'OK'

  return {
    severity,
    oeePct,
    availabilityPct: clamp01(availability) * 100,
    performancePct: clamp01(performance) * 100,
    qualityPct: clamp01(quality) * 100,
    machines: counts,
    production: {
      goodParts,
      totalParts,
      delta: goodParts - totalParts,
    },
    updatedAt: latestUpdatedAtMs ? new Date(latestUpdatedAtMs).toISOString() : null,
  }
}

function coerceSeedToHierarchyShape(seed) {
  if (!seed?.factories) return { factories: [] }

  // Support both schemas:
  // - hierarchy: factories[].id/name/plants[].id/name/departments[].id/name/layout.zones
  // - efficiency: factories[].factoryId/factoryName/plants[].plantId/plantName/departments[].departmentId/departmentName/machines[]
  const firstFactory = seed.factories[0]
  const looksLikeEfficiency =
    !!firstFactory &&
    ('factoryId' in firstFactory ||
      'factoryName' in firstFactory ||
      'plants' in firstFactory)

  if (!looksLikeEfficiency) return seed

  const generatedAt = seed.generatedAt || new Date().toISOString()

  function ensureTwoZones(departmentId, zones, machinesFlat) {
    const z = Array.isArray(zones) ? zones : []
    if (z.length === 2) {
      // Ensure consistent naming
      const [a, b] = z
      return [
        { ...a, id: a.id ?? `${departmentId}-z1`, name: a.name ?? 'Zone A' },
        { ...b, id: b.id ?? `${departmentId}-z2`, name: b.name ?? 'Zone B' },
      ]
    }

    const ms = Array.isArray(machinesFlat) ? machinesFlat : []
    if (!ms.length) return z

    const half = Math.max(1, Math.ceil(ms.length / 2))
    const zoneA = ms.slice(0, half)
    const zoneB = ms.slice(half)

    return [
      { id: `${departmentId}-z1`, name: 'Zone A', machines: zoneA },
      { id: `${departmentId}-z2`, name: 'Zone B', machines: zoneB },
    ]
  }

  return {
    ...seed,
    generatedAt,
    factories: (seed.factories || []).map((f) => ({
      id: f.factoryId ?? f.id,
      name: f.factoryName ?? f.name,
      plants: (f.plants || []).map((p) => ({
        id: p.plantId ?? p.id,
        name: p.plantName ?? p.name,
        departments: (p.departments || []).map((d) => {
          const departmentId = d.departmentId ?? d.id
          const coerceMachine = (m) => ({
            ...m,
            id: m.machineId ?? m.id,
            name: m.machineName ?? m.name,
            status: m.status ?? 'RUNNING',
            updatedAt: m.updatedAt ?? generatedAt,
          })

          const machines = (d.machines || []).map(coerceMachine)

          const zonesRaw = d.zones || d.layout?.zones
          const zonesNormalized = Array.isArray(zonesRaw)
            ? zonesRaw.map((z, idx) => ({
                ...z,
                id: z.id ?? `${departmentId}-z-${idx}`,
                name: z.name ?? `Zone ${idx + 1}`,
                machines: (z.machines || []).map(coerceMachine),
              }))
            : null

          const machinesFromZones = zonesNormalized
            ? zonesNormalized.flatMap((z) => z.machines || [])
            : []

          // If the data doesn't include zones/layout, group machines into one zone.
          const zones = ensureTwoZones(
            departmentId,
            zonesNormalized,
            machines.length ? machines : machinesFromZones,
          )

          return {
            id: departmentId,
            name: d.departmentName ?? d.name,
            zones,
          }
        }),
      })),
    })),
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeHierarchy(root) {
  if (!root?.factories) return
  for (const f of root.factories) {
    for (const p of f.plants || []) {
      for (const d of p.departments || []) {
        if (d?.layout?.zones && !d.zones) d.zones = d.layout.zones
        if (d?.layout) delete d.layout
      }
    }
  }
}

async function loadSeed() {
  // In dev, the JSON file changes frequently; avoid serving stale cached data.
  if (seedCache && !IS_DEV) return seedCache
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    const res = await fetch(SEED_URL, {
      headers: { Accept: 'application/json' },
      cache: IS_DEV ? 'no-store' : 'default',
    })

    if (!res.ok) {
      throw new Error(
        `Failed to load seed data (${res.status} ${res.statusText})`,
      )
    }

    const json = await res.json()
    seedCache = coerceSeedToHierarchyShape(json)
    return seedCache
  })()

  try {
    return await seedPromise
  } finally {
    seedPromise = null
  }
}

async function ensureLive() {
  // In dev we want API calls to reflect the latest JSON file contents.
  // In prod we can cache in-memory.
  if (live && !IS_DEV) return
  const seed = await loadSeed()
  live = coerceSeedToHierarchyShape(structuredClone(seed))
  normalizeHierarchy(live)
}

function findFactory(factoryId) {
  return (live?.factories || []).find((f) => f.id === factoryId) || null
}

function findPlant(plantId) {
  for (const f of live?.factories || []) {
    const p = (f.plants || []).find((x) => x.id === plantId)
    if (p) return { factory: f, plant: p }
  }
  return null
}

function findDepartment(departmentId) {
  for (const f of live?.factories || []) {
    for (const p of f.plants || []) {
      const d = (p.departments || []).find((x) => x.id === departmentId)
      if (d) return { factory: f, plant: p, department: d }
    }
  }
  return null
}

export async function getFactories() {
  await ensureLive()
  await delay(NETWORK_MS)
  return (live?.factories || []).map(({ id, name }) => ({ id, name }))
}

export async function getPlantsByFactory(factoryId) {
  await ensureLive()
  await delay(NETWORK_MS)
  const f = findFactory(factoryId)
  if (!f) return []
  return f.plants.map(({ id, name }) => ({ id, name }))
}

export async function getDepartmentsByPlant(plantId) {
  await ensureLive()
  await delay(NETWORK_MS)
  const found = findPlant(plantId)
  if (!found) return []
  return found.plant.departments.map((d) => ({
    id: d.id,
    name: d.name,
    summary: computeDepartmentSummary(d),
    machines: structuredClone(getDepartmentMachines(d)),
    zones: structuredClone(d.zones || []),
  }))
}

export async function getDepartmentLayout(departmentId) {
  await ensureLive()
  await delay(NETWORK_MS)
  const found = findDepartment(departmentId)
  if (!found) throw new Error(`Department not found: ${departmentId}`)

  const summary = computeDepartmentSummary(found.department)

  // Return a copy to avoid UI accidentally mutating live state
  return {
    department: {
      id: found.department.id,
      name: found.department.name,
      zones: structuredClone(found.department.zones || []),
    },
    summary,
    meta: { simulated: false, fetchedAt: new Date().toISOString() },
  }
}

export async function getMachinesSnapshot() {
  await ensureLive()
  await delay(NETWORK_MS)

  const out = []
  for (const f of live?.factories || []) {
    for (const p of f.plants || []) {
      for (const d of p.departments || []) {
        const zones = d?.zones || []
        for (const z of zones) {
          for (const m of z?.machines || []) {
            out.push({
              factory: { id: f.id, name: f.name },
              plant: { id: p.id, name: p.name },
              department: { id: d.id, name: d.name },
              zone: { id: z?.id, name: z?.name },
              machine: structuredClone(m),
            })
          }
        }
      }
    }
  }

  return out
}

export function resetLiveData() {
  live = seedCache ? structuredClone(seedCache) : null
  if (live) normalizeHierarchy(live)
}
