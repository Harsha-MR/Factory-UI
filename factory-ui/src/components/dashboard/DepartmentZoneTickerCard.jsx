import { useEffect, useMemo, useState } from 'react'

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function computeMachineOeePct(machine) {
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
  return oee * 100
}

function deptBadge(severity) {
  if (severity === 'CRITICAL') return { cls: 'bg-red-100 text-red-700', text: 'CRITICAL' }
  if (severity === 'ACTION_REQUIRED') return { cls: 'bg-yellow-100 text-yellow-800', text: 'ATTENTION' }
  return { cls: 'bg-emerald-100 text-emerald-700', text: 'OK' }
}

function statusRowClass(status) {
  if (status === 'DOWN') return 'bg-red-600 text-white'
  if (status === 'IDLE') return 'bg-amber-500 text-white'
  if (status === 'RUNNING') return 'bg-emerald-600 text-white'
  return 'bg-slate-600 text-white'
}

function abbreviateMe(raw) {
  const s = String(raw || '').trim()
  const num = s.match(/(\d+)/)
  if (num) return `ME-${Number.parseInt(num[1], 10)}`

  // fallback: first 2 letters upper
  const prefix = s.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase()
  return prefix ? `ME-${prefix}` : 'ME'
}

function zoneLabel(i) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let n = i
  let out = ''
  do {
    out = letters[n % 26] + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `Zone ${out}`
}

function machinesHashKey(list) {
  const items = Array.isArray(list) ? list : []
  let h = 0
  for (const m of items) {
    const s = String(m?.id ?? m?.machineId ?? '')
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000000007
  }
  return `${items.length}-${h}`
}

function ZoneTicker({ zoneName, machines, onMachineClick }) {
  const list = useMemo(() => (Array.isArray(machines) ? machines : []), [machines])
  const visibleRows = 4
  const rowH = 40 // px (matches h-10)
  const rowGap = 8 // px (matches gap-2)
  const stepPx = rowH + rowGap
  const containerH = visibleRows * rowH + (visibleRows - 1) * rowGap
  const shouldTick = list.length > visibleRows

  const [items, setItems] = useState(() => list)
  const [offsetRows, setOffsetRows] = useState(0)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    if (!shouldTick) return
    if (items.length <= visibleRows) return

    const stepMs = 1000
    const animMs = 320

    const id = window.setInterval(() => {
      // Animate one full row up (first item fully leaves view)
      setAnimate(true)
      setOffsetRows(1)

      // After animation finishes, rotate items and snap back to 0 without animation.
      window.setTimeout(() => {
        setAnimate(false)
        setItems((prev) => {
          if (!Array.isArray(prev) || prev.length <= 1) return prev
          const [head, ...rest] = prev
          return [...rest, head]
        })
        setOffsetRows(0)
      }, animMs)
    }, stepMs)

    return () => window.clearInterval(id)
  }, [items.length, shouldTick])

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-lg font-semibold text-slate-900">{zoneName}</div>

      <div className="mt-3 overflow-hidden" style={{ height: containerH }}>
        <div
          className="flex flex-col gap-2"
          style={{
            transform: `translateY(-${offsetRows * stepPx}px)`,
            transition: animate ? 'transform 320ms ease' : 'none',
          }}
        >
          {items.map((m, i) => {
            const oee = computeMachineOeePct(m)
            const short = abbreviateMe(m?.name || m?.id)
            const clickable = typeof onMachineClick === 'function'

            return (
              <div
                key={`${m?.id || i}-${i}`}
                className={
                  `flex h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold ${statusRowClass(
                    m?.status,
                  )} ` + (clickable ? 'cursor-pointer' : '')
                }
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={
                  clickable
                    ? (e) => {
                        e.stopPropagation()
                        onMachineClick(m)
                      }
                    : undefined
                }
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onMachineClick(m)
                        }
                      }
                    : undefined
                }
              >
                <span className="truncate">{short}</span>
                <span className="tabular-nums">
                  {oee == null ? '—' : `${oee.toFixed(1)}%`}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function DepartmentZoneTickerCard({
  id,
  name,
  summary,
  zones,
  machines,
  onClick,
  onMachineClick,
  bodyMaxHeightClass,
}) {
  const list = useMemo(() => (Array.isArray(machines) ? machines : []), [machines])
  const total = list.length
  const active = useMemo(() => list.filter((m) => m?.status === 'RUNNING').length, [list])
  const { cls: badgeCls, text: badgeText } = deptBadge(summary?.severity || 'OK')

  const z = useMemo(() => {
    if (Array.isArray(zones) && zones.length) {
      return zones.map((zone, idx) => ({
        id: zone?.id || `z-${idx}`,
        name: zone?.name || zoneLabel(idx),
        machines: zone?.machines || [],
      }))
    }

    // fallback: chunk into zones of 4
    const out = []
    for (let i = 0; i < list.length; i += 4) {
      out.push({
        id: `z-${out.length}`,
        name: zoneLabel(out.length),
        machines: list.slice(i, i + 4),
      })
    }
    return out
  }, [list, zones])

  const clickable = typeof onClick === 'function'
  const maxH = bodyMaxHeightClass || 'max-h-[60vh]'

  return (
    <div
      data-department-id={id || undefined}
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
          <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${badgeCls}`}>
            <span className="inline-block h-2 w-2 rounded-full bg-current opacity-60" />
            <span>{badgeText}</span>
          </div>
        </div>
      </div>

      {/* {id ? <div className="mt-1 text-sm text-slate-500">ID: {id}</div> : null} */}

      <div className="mt-1 text-sm font-medium text-slate-600 sm:hidden">
        <span className="text-slate-500">Active:</span> {active} / {total} machines
      </div>

      <div className={`mt-4 ${maxH} overflow-y-auto pr-1`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {z.map((zone, idx) => (
            <ZoneTicker
              key={`${zone.id || idx}-${machinesHashKey(zone.machines)}`}
              zoneName={zone.name || zoneLabel(idx)}
              machines={zone.machines}
              onMachineClick={onMachineClick}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
