const STORAGE_KEY = 'factory-ui:hierarchy'

function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function getLocalHierarchy() {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  const parsed = safeJsonParse(raw)
  return parsed && typeof parsed === 'object' ? parsed : null
}

export function hasLocalHierarchy() {
  return !!getLocalHierarchy()
}

export function saveLocalHierarchy(root) {
  if (typeof localStorage === 'undefined') return
  if (!root || typeof root !== 'object') throw new Error('Invalid hierarchy root')
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root))
}

export function clearLocalHierarchy() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
