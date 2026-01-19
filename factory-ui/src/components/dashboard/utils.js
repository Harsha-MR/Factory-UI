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

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

export function computeMachineOeePct(machine) {
  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}

  const planned = Number(time.plannedProductionTime ?? 0)
  const runtime = Number(time.runTime ?? 0)
  const idealCycleTime = Number(prod.idealCycleTime ?? 0)
  const totalParts = Number(prod.totalPartsProduced ?? 0)
  const goodParts = Number(prod.goodParts ?? 0)

  if (!Number.isFinite(planned) || planned <= 0) return null

  const availability = planned > 0 ? runtime / planned : 0
  const performance = runtime > 0 ? (idealCycleTime * totalParts) / runtime : 0
  const quality = totalParts > 0 ? goodParts / totalParts : 0
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)
  return clampPct(oee * 100)
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
