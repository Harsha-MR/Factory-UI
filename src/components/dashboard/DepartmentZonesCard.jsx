import { useMemo } from 'react'
import { sortMachinesByStatus } from './utils'

function statusUi(status) {
  const s = String(status || '').toUpperCase()
  if (s === 'DOWN') {
    return {
      dot: 'bg-red-500',
      label: 'Down',
      bubbleBg: 'bg-red-50',
      bubbleRing: 'ring-red-100',
    }
  }
  if (s === 'IDLE') {
    return {
      dot: 'bg-amber-400',
      label: 'Idle',
      bubbleBg: 'bg-amber-50',
      bubbleRing: 'ring-amber-100',
    }
  }
  if (s === 'MAINTENANCE') {
    return {
      dot: 'bg-purple-500',
      label: 'Maintenance',
      bubbleBg: 'bg-purple-50',
      bubbleRing: 'ring-purple-100',
    }
  }
  if (s === 'OFFLINE') {
    return {
      dot: 'bg-gray-400',
      label: 'Offline',
      bubbleBg: 'bg-gray-50',
      bubbleRing: 'ring-gray-100',
    }
  }
  return {
    dot: 'bg-emerald-500',
    label: 'Running',
    bubbleBg: 'bg-emerald-50',
    bubbleRing: 'ring-emerald-100',
  }
}

function deptBadge(severity) {
  if (severity === 'CRITICAL') return { cls: 'bg-red-100 text-red-700', text: 'CRITICAL' }
  if (severity === 'ACTION_REQUIRED') return { cls: 'bg-yellow-100 text-yellow-800', text: 'ATTENTION' }
  return { cls: 'bg-emerald-100 text-emerald-700', text: 'OK' }
}

function zoneLabel(i) {
  // Zone A..Z, AA..AZ, BA..
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let n = i
  let out = ''
  do {
    out = letters[n % 26] + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `Zone ${out}`
}

function chunk4(list) {
  const out = []
  for (let i = 0; i < list.length; i += 4) out.push(list.slice(i, i + 4))
  return out
}

function abbreviateMachineName(raw) {
  const name = String(raw || '').trim()
  if (!name) return 'MA'

  // Match: "Machine 1", "Machine-1", "MACHINE_01" -> MA-1
  const m = name.match(/\bmachine\b\s*[-_]?\s*(\d+)/i)
  if (m) return `MA-${Number.parseInt(m[1], 10)}`

  // Generic: take an uppercase prefix + trailing number
  const parts = name.split(/\s*[-_\s]+\s*/).filter(Boolean)
  const head = parts[0] || name
  const last = parts[parts.length - 1] || ''
  const numMatch = last.match(/(\d+)/)

  const isAllCapsShort = /^[A-Z0-9]{2,4}$/.test(head)
  const prefix = isAllCapsShort ? head : head.slice(0, 2).toUpperCase()

  if (numMatch) return `${prefix}-${Number.parseInt(numMatch[1], 10)}`
  return prefix
}

function toSeconds(value, unitHint = 'seconds') {
  if (value == null || value === '') return NaN
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN
    const n = Math.max(0, value)
    if (unitHint === 'minutes') return n * 60
    if (unitHint === 'hours') return n * 3600
    return n
  }
  const str = String(value).trim()
  if (!str) return NaN
  const hhmmss = str.match(/^(\d+):(\d{1,2}):(\d{1,2})$/)
  if (hhmmss) {
    const h = Number(hhmmss[1] || 0)
    const m = Number(hhmmss[2] || 0)
    const s = Number(hhmmss[3] || 0)
    if ([h, m, s].some((x) => !Number.isFinite(x) || x < 0)) return NaN
    return h * 3600 + m * 60 + s
  }
  const numeric = Number(str)
  if (Number.isFinite(numeric)) {
    const n = Math.max(0, numeric)
    if (unitHint === 'minutes') return n * 60
    if (unitHint === 'hours') return n * 3600
    return n
  }
  return NaN
}

function formatDuration(seconds) {
  const totalSec = Math.max(0, Math.round(Number(seconds) || 0))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

function machineDowntimeSeconds(machine) {
  const tm = machine?.timeMetrics || {}
  const breakdownSec = toSeconds(tm?.breakdownTime, 'seconds')
  if (Number.isFinite(breakdownSec) && breakdownSec >= 0) return breakdownSec
  const downSec = toSeconds(tm?.downTime, 'seconds')
  if (Number.isFinite(downSec) && downSec >= 0) return downSec
  const offSec = toSeconds(tm?.total_off, 'hours')
  if (Number.isFinite(offSec) && offSec >= 0) return offSec
  return 0
}

function MachineBubble({ machine, onClick }) {
  const ui = statusUi(machine?.status)
  const clickable = typeof onClick === 'function'
  const name = machine?.name || machine?.id || 'Machine'
  const shortName = abbreviateMachineName(name)
  const downtimeSeconds = machineDowntimeSeconds(machine)
  const downtimeText = formatDuration(downtimeSeconds)

  return (
    <div
      className={
        `flex h-20 w-20 flex-col items-center justify-center rounded-full ${ui.bubbleBg} ring-1 ${ui.bubbleRing} ` +
        (clickable ? 'cursor-pointer transition hover:shadow-sm' : '')
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onClick()
              }
            }
          : undefined
      }
      title={name}
    >
      <div className="max-w-[4.5rem] truncate text-xs font-semibold text-slate-800">{shortName}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
        <span className={`h-2.5 w-2.5 rounded-full ${ui.dot}`} />
        <span>Downtime {downtimeText}</span>
      </div>
    </div>
  )
}

export default function DepartmentZonesCard({
  id,
  name,
  zones,
  machines,
  summary,
  onBack,
  onClick,
  onMachineClick,
  bodyMaxHeightClass,
}) {
  const list = useMemo(() => (Array.isArray(machines) ? machines : []), [machines])
  const total = list.length
  const active = useMemo(() => list.filter((m) => String(m?.status || '').toUpperCase() === 'RUNNING').length, [list])

  const { cls: badgeCls, text: badgeText } = deptBadge(summary?.severity || 'OK')

  const resolvedZones = useMemo(() => {
    const z = Array.isArray(zones) ? zones : []
    if (z.length) {
      return z.map((zone, idx) => ({
        id: zone?.id || `z-${idx}`,
        name: zone?.name || zoneLabel(idx),
        machines: sortMachinesByStatus(Array.isArray(zone?.machines) ? zone.machines : []),
      }))
    }

    // Fallback: older callers that only provide a flat machines list.
    const chunks = chunk4(list)
    return chunks.map((group, idx) => ({
      id: `z-${idx}`,
      name: zoneLabel(idx),
      machines: sortMachinesByStatus(group),
    }))
  }, [list, zones])

  const clickable = typeof onClick === 'function'
  const maxH = bodyMaxHeightClass || 'max-h-[60vh]'

  return (
    <div
      className={
        'rounded-2xl border bg-white p-4 shadow-sm ' +
        (clickable ? 'cursor-pointer transition hover:shadow-md' : '')
      }
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 text-2xl font-semibold text-slate-900">{name}</div>

        <div className="hidden text-sm font-medium text-slate-600 sm:block">
          <span className="text-slate-500">Active:</span> {active} / {total} machines
        </div>

        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              type="button"
              className="rounded-lg border px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>
          ) : null}

          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${badgeCls}`}>
            <span className="inline-block h-2 w-2 rounded-full bg-current opacity-60" />
            <span>{badgeText}</span>
          </div>
        </div>
      </div>

      {id ? <div className="mt-1 text-sm text-slate-500">ID: {id}</div> : null}

      <div className="mt-1 text-sm font-medium text-slate-600 sm:hidden">
        <span className="text-slate-500">Active:</span> {active} / {total} machines
      </div>

      <div className={`mt-4 ${maxH} overflow-y-auto pr-1`}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {resolvedZones.map((z) => (
            <div key={z.id} className="rounded-xl border bg-white p-3">
              <div className="text-lg font-semibold text-slate-900">{z.name}</div>
              <div className="mt-3 flex flex-wrap gap-3">
                {z.machines.map((m) => (
                  <MachineBubble
                    key={m.id}
                    machine={m}
                    onClick={
                      typeof onMachineClick === 'function'
                        ? () => onMachineClick(m)
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
