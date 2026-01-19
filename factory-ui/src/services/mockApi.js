const NETWORK_MS = 200

const API_BASE = String(import.meta?.env?.VITE_API_BASE || '').trim()

function apiUrl(path) {
  const p = String(path || '')
  if (!p.startsWith('/')) throw new Error(`apiUrl expects an absolute path starting with '/': ${p}`)
  return API_BASE ? `${API_BASE}${p}` : p
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(path) {
  const res = await fetch(apiUrl(path), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let msg = `Request failed (${res.status} ${res.statusText})`
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      // ignore
    }
    throw new Error(msg)
  }
  return res.json()
}

export async function getFactories() {
  await delay(NETWORK_MS)
  return fetchJson('/api/factories')
}

export async function getPlantsByFactory(factoryId) {
  await delay(NETWORK_MS)
  if (!factoryId) return []
  return fetchJson(`/api/factories/${encodeURIComponent(factoryId)}/plants`)
}

export async function getDepartmentsByPlant(plantId) {
  await delay(NETWORK_MS)
  if (!plantId) return []
  return fetchJson(`/api/plants/${encodeURIComponent(plantId)}/departments`)
}

export async function getDepartmentLayout(departmentId) {
  await delay(NETWORK_MS)
  if (!departmentId) throw new Error('Missing departmentId')
  return fetchJson(`/api/departments/${encodeURIComponent(departmentId)}/layout`)
}

export async function getMachinesSnapshot() {
  await delay(NETWORK_MS)
  return fetchJson('/api/machines/snapshot')
}

export function resetLiveData() {
  // no-op (data source is MongoDB)
}
