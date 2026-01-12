import seed from '../mock/factoryHierarchy.json'

const NETWORK_MS = 350

// In-memory "live" copy (this mimics real-world changing state)
let live = structuredClone(seed)
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
        for (const z of d.layout.zones) {
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

  setInterval(() => {
    mutateSomeMachineStatuses()
  }, tickMs)
}

export async function getFactories() {
  await delay(NETWORK_MS)
  return live.factories.map(({ id, name }) => ({ id, name }))
}

export async function getPlantsByFactory(factoryId) {
  await delay(NETWORK_MS)
  const f = findFactory(factoryId)
  if (!f) return []
  return f.plants.map(({ id, name }) => ({ id, name }))
}

export async function getDepartmentsByPlant(plantId) {
  await delay(NETWORK_MS)
  const found = findPlant(plantId)
  if (!found) return []
  return found.plant.departments.map(({ id, name }) => ({ id, name }))
}

export async function getDepartmentLayout(departmentId) {
  await delay(NETWORK_MS)
  const found = findDepartment(departmentId)
  if (!found) throw new Error(`Department not found: ${departmentId}`)

  // Return a copy to avoid UI accidentally mutating live state
  return {
    department: { id: found.department.id, name: found.department.name },
    layout: structuredClone(found.department.layout),
    meta: { simulated: true, fetchedAt: new Date().toISOString() },
  }
}

export function resetLiveData() {
  live = structuredClone(seed)
}
