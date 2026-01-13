const NETWORK_MS = 350

const SEED_URL = '/mock/factory_efficiency_data.json'

let seedCache = null
let seedPromise = null

// In-memory "live" copy (this mimics real-world changing state)
let live = null
let simStarted = false

const STATUSES = ['RUNNING', 'WARNING', 'DOWN', 'OFFLINE', 'MAINTENANCE']

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function nextStatus(current) {
  const idx = STATUSES.indexOf(current)
  if (idx < 0) return STATUSES[0]
  return STATUSES[(idx + 1) % STATUSES.length]
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
  if (seedCache) return seedCache
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    const res = await fetch(SEED_URL, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(
        `Failed to load factoryHierarchy (${res.status} ${res.statusText})`,
      )
    }

    const json = await res.json()
    seedCache = json
    return seedCache
  })()

  try {
    return await seedPromise
  } finally {
    seedPromise = null
  }
}

async function ensureLive() {
  if (live) return
  const seed = await loadSeed()
  live = structuredClone(seed)
  normalizeHierarchy(live)
}

function findFactory(factoryId) {
  return live.factories.find((f) => f.id === factoryId) || null
}

function findPlant(plantId) {
  for (const f of live.factories) {
    const p = f.plants.find((x) => x.id === plantId)
    if (p) return { factory: f, plant: p }
  }
  return null
}

function findDepartment(departmentId) {
  for (const f of live.factories) {
    for (const p of f.plants) {
      const d = p.departments.find((x) => x.id === departmentId)
      if (d) return { factory: f, plant: p, department: d }
    }
  }
  return null
}

function getAllMachines() {
  const machines = []
  for (const f of live.factories) {
    for (const p of f.plants) {
      for (const d of p.departments) {
        for (const z of d.zones || []) {
          for (const m of z.machines) machines.push(m)
        }
      }
    }
  }
  return machines
}

function mutateSomeMachineStatuses() {
  const machines = getAllMachines()
  if (machines.length === 0) return

  // Change enough machines per tick so it is clearly visible to humans.
  // ~15% of all machines, but bounded.
  const changes = Math.min(60, Math.max(12, Math.floor(machines.length * 0.15)))
  shuffleInPlace(machines)

  const now = new Date().toISOString()
  for (let i = 0; i < Math.min(changes, machines.length); i++) {
    const m = machines[i]
    m.status = nextStatus(m.status)
    m.updatedAt = now
  }
}

export function startLiveSimulation({ tickMs = 2000 } = {}) {
  if (simStarted) return
  simStarted = true

  ;(async () => {
    await ensureLive()
    setInterval(() => {
      mutateSomeMachineStatuses()
    }, tickMs)
  })()
}

export async function getFactories() {
  await ensureLive()
  await delay(NETWORK_MS)
  return live.factories.map(({ id, name }) => ({ id, name }))
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
  return found.plant.departments.map(({ id, name }) => ({ id, name }))
}

export async function getDepartmentLayout(departmentId) {
  await ensureLive()
  await delay(NETWORK_MS)
  const found = findDepartment(departmentId)
  if (!found) throw new Error(`Department not found: ${departmentId}`)

  // Return a copy to avoid UI accidentally mutating live state
  return {
    department: {
      id: found.department.id,
      name: found.department.name,
      zones: structuredClone(found.department.zones || []),
    },
    meta: { simulated: true, fetchedAt: new Date().toISOString() },
  }
}

export function resetLiveData() {
  live = seedCache ? structuredClone(seedCache) : null
  if (live) normalizeHierarchy(live)
}
