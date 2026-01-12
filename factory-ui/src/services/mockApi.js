import seed from '../mock/factoryHierarchy.json'

const NETWORK_MS = 350

// In-memory "live" copy (this mimics real-world changing state)
let live = structuredClone(seed)
let simStarted = false

const STATUSES = ['RUNNING', 'WARNING', 'DOWN', 'OFFLINE', 'MAINTENANCE']

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

  // Change 1..3 machines per tick
  const changes = Math.min(3, Math.max(1, Math.floor(Math.random() * 3) + 1))

  for (let i = 0; i < changes; i++) {
    const m = machines[Math.floor(Math.random() * machines.length)]
    const next = STATUSES[Math.floor(Math.random() * STATUSES.length)]
    m.status = next
    m.updatedAt = new Date().toISOString()
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
