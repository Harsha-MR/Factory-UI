export function statusColor(status) {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-500'
    case 'IDLE':
      return 'bg-yellow-400'
    case 'WARNING':
      return 'bg-yellow-500'
    case 'DOWN':
      return 'bg-red-500'
    case 'OFFLINE':
      return 'bg-gray-400'
    case 'MAINTENANCE':
      return 'bg-blue-500'
    default:
      return 'bg-slate-400'
  }
}

export function statusSoftBg(status) {
  switch (status) {
    case 'RUNNING':
      return 'bg-green-500/10'
    case 'IDLE':
      return 'bg-yellow-400/10'
    case 'WARNING':
      return 'bg-yellow-500/10'
    case 'DOWN':
      return 'bg-red-500/10'
    case 'OFFLINE':
      return 'bg-gray-500/10'
    case 'MAINTENANCE':
      return 'bg-blue-500/10'
    default:
      return 'bg-slate-500/10'
  }
}

export function clampPct(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '—'
  const t = new Date(isoString).getTime()
  if (!Number.isFinite(t)) return '—'

  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec} seconds ago`

  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`

  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`

  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}

export function formatTimestamp(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleString()
}

function toNum(v) {
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : null
}

/**
 * Computes OEE% from common machine metrics (Availability * Performance * Quality).
 * Returns a number in [0, 100] or null when insufficient data.
 */
export function computeMachineOeePct(machine) {
  const plannedProductionTime = toNum(machine?.plannedProductionTime)
  const runTime = toNum(machine?.runTime)
  const idealCycleTime = toNum(machine?.idealCycleTime)
  const totalPartsProduced = toNum(machine?.totalPartsProduced)
  const goodParts = toNum(machine?.goodParts)

  if (
    plannedProductionTime == null ||
    runTime == null ||
    idealCycleTime == null ||
    totalPartsProduced == null ||
    goodParts == null
  ) {
    return null
  }

  if (plannedProductionTime <= 0 || runTime <= 0 || totalPartsProduced <= 0) return null

  const availability = runTime / plannedProductionTime
  const performance = (idealCycleTime * totalPartsProduced) / runTime
  const quality = goodParts / totalPartsProduced

  const oee = availability * performance * quality * 100
  return clampPct(oee)
}
