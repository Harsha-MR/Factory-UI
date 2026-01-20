import { useMemo, useRef, useState } from 'react'
import { ELEMENT_TYPES } from './layoutTypes'
import { MachineGlyph, TransporterIcon } from './icons'
import { computeMachineOeePct } from '../dashboard/utils'
import { useWheelZoom } from './useWheelZoom'

function statusStyle(status) {
  if (status === 'DOWN') return { tintBg: 'bg-red-500', glyphText: 'text-red-600' }
  if (status === 'IDLE') return { tintBg: 'bg-amber-500', glyphText: 'text-amber-600' }
  if (status === 'WARNING') return { tintBg: 'bg-yellow-500', glyphText: 'text-yellow-600' }
  if (status === 'OFFLINE') return { tintBg: 'bg-slate-400', glyphText: 'text-slate-500' }
  if (status === 'MAINTENANCE') return { tintBg: 'bg-purple-500', glyphText: 'text-purple-600' }
  return { tintBg: 'bg-emerald-500', glyphText: 'text-emerald-600' }
}

function pct(n) {
  return `${Math.round(n * 10000) / 100}%`
}

export default function DepartmentFloorLayoutViewer({
  layout,
  department,
  onMachineClick,
  zoom: zoomProp,
  onZoomChange,
}) {
  const containerRef = useRef(null)
  const { zoom, pan, resetZoom } = useWheelZoom({ ref: containerRef, zoom: zoomProp, onZoomChange })
  const [hover, setHover] = useState(null)

  const machineById = useMemo(() => {
    const map = new Map()
    for (const z of department?.zones || []) {
      for (const m of z?.machines || []) {
        map.set(String(m.id), m)
      }
    }
    return map
  }, [department])

  const bgStyle = layout?.background?.src
    ? {
        backgroundImage: `url(${layout.background.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : null

  const elements = Array.isArray(layout?.elements) ? layout.elements : []

  const machineIconSrc = layout?.assets?.machineIcon || '/icons/machine.svg'
  const transporterIconSrc = layout?.assets?.transporterIcon || '/icons/transporter.svg'

  const onMove = (e) => {
    if (!hover) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover((prev) =>
      prev
        ? {
            ...prev,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          }
        : prev,
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border bg-slate-50"
      style={{ height: '52vh', maxHeight: 560, minHeight: 320 }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <div
        className="absolute inset-0"
        style={{
          ...bgStyle,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0px 0px',
        }}
      >
        {/* subtle grid when no background */}
        {!bgStyle ? (
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)',
              backgroundSize: '36px 36px',
            }}
          />
        ) : null}

        {elements.map((el) => {
        const style = {
          left: pct(el.x),
          top: pct(el.y),
          width: pct(el.w),
          height: pct(el.h),
          transform: el.rotationDeg ? `rotate(${el.rotationDeg}deg)` : undefined,
        }

        if (el.type === ELEMENT_TYPES.ZONE) {
          return (
            <div
              key={el.id}
              className="absolute rounded-lg border border-slate-200 bg-white/60 p-2 backdrop-blur-[1px]"
              style={style}
              title={el.label || 'Zone'}
            >
              <div className="text-xs font-semibold text-slate-800">{el.label || 'Zone'}</div>
            </div>
          )
        }

        if (el.type === ELEMENT_TYPES.WALKWAY) {
          return (
            <div
              key={el.id}
              className="absolute rounded-md bg-black/35 ring-1 ring-black/25"
              style={style}
              title={el.label || 'Walkway'}
            />
          )
        }

        if (el.type === ELEMENT_TYPES.TRANSPORTER) {
          return (
            <div
              key={el.id}
              className="absolute flex items-center justify-center rounded-lg border border-slate-200 bg-white/70 text-slate-700"
              style={style}
              title={el.label || 'Transporter'}
            >
              {el.iconSrc || transporterIconSrc ? (
                <img
                  src={el.iconSrc || transporterIconSrc}
                  alt={el.label || 'Transporter'}
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <TransporterIcon className="h-full w-full p-1" />
              )}
            </div>
          )
        }

        if (el.type === ELEMENT_TYPES.MACHINE) {
          const machine = machineById.get(String(el.machineId))
          const clickable = typeof onMachineClick === 'function' && !!machine
          const ui = statusStyle(machine?.status)
          const displayName = (el.label || machine?.name || el.machineId || 'Machine').toString()
          const oee = machine ? computeMachineOeePct(machine) : null

          const perMachineIcon = el.iconSrc || null

          return (
            <div
              key={el.id}
              className={
                'absolute flex items-center justify-center ' +
                (clickable ? 'cursor-pointer transition hover:drop-shadow-md' : '')
              }
              style={style}
              onClick={
                clickable
                  ? (e) => {
                      e.stopPropagation()
                      onMachineClick(machine)
                    }
                  : undefined
              }
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                setHover({
                  id: el.id,
                  kind: 'machine',
                  name: displayName,
                  status: machine?.status || 'UNKNOWN',
                  oee,
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                })
              }}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative flex h-full w-full items-center justify-center">
                {(perMachineIcon || machineIconSrc) ? (
                  <div className="relative isolate h-full w-full">
                    <img
                      src={perMachineIcon || machineIconSrc}
                      alt="Machine"
                      className="h-full w-full object-contain"
                    />
                    <div
                      className={`pointer-events-none absolute inset-0 ${ui.tintBg} opacity-40 mix-blend-multiply`}
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <MachineGlyph className={`h-7 w-7 ${ui.glyphText}`} />
                )}
              </div>
            </div>
          )
        }

        return null
        })}
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-2">
        <div className="rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 backdrop-blur">
          Zoom: {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          className="rounded-md border bg-white/80 px-2 py-1 text-xs text-slate-700 hover:bg-white"
          onClick={resetZoom}
        >
          Reset
        </button>
      </div>

      {hover ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
        >
          <div className="max-w-[260px] rounded-lg border bg-white/95 p-2 text-xs text-slate-800 shadow-lg">
            <div className="font-semibold">{hover.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-slate-600">
              <span>Status: {hover.status}</span>
              <span>•</span>
              <span>OEE: {hover.oee == null ? '—' : `${hover.oee.toFixed(1)}%`}</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500">Click to open machine details</div>
          </div>
        </div>
      ) : null}

      {elements.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="rounded-lg border bg-white/80 p-3 text-sm text-slate-700 backdrop-blur">
            No machines/zones to display yet.
          </div>
        </div>
      ) : null}
    </div>
  )
}
