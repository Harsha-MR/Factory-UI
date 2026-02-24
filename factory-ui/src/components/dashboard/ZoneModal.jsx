import { useEffect, useMemo, useRef, useState } from 'react'
import MachineCard from './MachineCard'

export default function ZoneModal({
  zone,
  zones,
  selectedZoneId,
  onSelectZone,
  onClose,
  fetchedAt,
}) {
  const activeZoneButtonRef = useRef(null)
  const [statusFilter, setStatusFilter] = useState('ALL') // ALL | RUNNING | IDLE | DOWN

  const safeZones = useMemo(() => (Array.isArray(zones) ? zones : []), [zones])
  const machines = useMemo(
    () => (Array.isArray(zone?.machines) ? zone.machines : []),
    [zone]
  )

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const statusCounts = useMemo(() => {
    const counts = { RUNNING: 0, IDLE: 0, DOWN: 0 }
    for (const m of machines) {
      if (m?.status === 'RUNNING') counts.RUNNING++
      else if (m?.status === 'IDLE') counts.IDLE++
      else if (m?.status === 'DOWN') counts.DOWN++
    }
    return counts
  }, [machines])

  const filteredMachines = useMemo(() => {
    if (statusFilter === 'ALL') return machines
    return machines.filter((m) => m?.status === statusFilter)
  }, [machines, statusFilter])

  function filterBtnClass(isActive) {
    return (
      'rounded-full border px-3 py-1 text-xs font-semibold transition ' +
      (isActive
        ? 'border-black bg-black text-white'
        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')
    )
  }

  useEffect(() => {
    const el = activeZoneButtonRef.current
    if (!el) return

    if (!zone) return

    requestAnimationFrame(() => {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    })
  }, [selectedZoneId, safeZones.length, zone])

  if (!zone) return null

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative mx-auto mt-6 flex h-[90vh] w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg bg-white shadow-xl sm:mt-10 sm:w-[90vw] sm:max-w-none">
        <div className="border-b p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{zone.name}</div>
              <div className="text-xs text-gray-500">Machines: {machines.length}</div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={filterBtnClass(statusFilter === 'RUNNING')}
                onClick={() => setStatusFilter('RUNNING')}
              >
                RUNNING ({statusCounts.RUNNING})
              </button>
              <button
                type="button"
                className={filterBtnClass(statusFilter === 'IDLE')}
                onClick={() => setStatusFilter('IDLE')}
              >
                IDLE ({statusCounts.IDLE})
              </button>
              <button
                type="button"
                className={filterBtnClass(statusFilter === 'DOWN')}
                onClick={() => setStatusFilter('DOWN')}
              >
                DOWN ({statusCounts.DOWN})
              </button>

              <button
                type="button"
                className="ml-1 rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>
          </div>

          {safeZones.length > 1 ? (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-gray-600">Zones</div>
                <div className="text-[11px] text-gray-400">Scroll to view more</div>
              </div>

              <div className="mt-2 -mx-1 overflow-x-auto px-1">
                <div className="flex min-w-max gap-2">
                  {safeZones.map((z) => {
                    const isActive = z.id === selectedZoneId
                    return (
                      <button
                        key={z.id}
                        type="button"
                        ref={isActive ? activeZoneButtonRef : undefined}
                        onClick={() => {
                          setStatusFilter('ALL')
                          onSelectZone?.(z.id)
                        }}
                        className={
                          `rounded-md border px-3 py-2 text-left text-sm transition ` +
                          (isActive
                            ? 'border-black bg-black text-white'
                            : 'border-gray-200 bg-white hover:bg-gray-50')
                        }
                        aria-current={isActive ? 'true' : undefined}
                        aria-label={`Select zone ${z.name}`}
                      >
                        <div className="max-w-[12rem] truncate font-medium">{z.name}</div>
                        <div className={`text-[11px] ${isActive ? 'text-white/80' : 'text-gray-500'}`}>
                          Machines: {z.machines?.length ?? 0}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredMachines.map((m) => (
              <MachineCard
                key={m.id}
                machine={m}
                context={{ zone: zone.name }}
                fetchedAt={fetchedAt}
                variant="full"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
