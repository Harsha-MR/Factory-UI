import { useEffect, useMemo, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import { nanoid } from 'nanoid'
import { ELEMENT_TYPES, clamp01, normalizeLayout } from './layoutTypes'
import { MachineGlyph, TransporterIcon } from './icons'
import { useWheelZoom } from './useWheelZoom'

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function pxToNorm(px, total) {
  if (!Number.isFinite(px) || !Number.isFinite(total) || total <= 0) return 0
  return clamp01(px / total)
}

function normToPx(norm, total) {
  if (!Number.isFinite(norm) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round(clamp01(norm) * total)
}

function elementLabel(el, machineById) {
  if (el.type === ELEMENT_TYPES.MACHINE) {
    const m = machineById.get(String(el.machineId))
    return m?.name || el.label || 'Machine'
  }
  return el.label || el.type
}

export default function DepartmentFloorLayoutEditor({
  department,
  initialLayout,
  onCancel,
  onSave,
  onReset,
  zoom: zoomProp,
  onZoomChange,
}) {
  const containerRef = useRef(null)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const [isPanning, setIsPanning] = useState(false)

  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 })

  const [draft, setDraft] = useState(() => normalizeLayout(initialLayout))
  const [selectedId, setSelectedId] = useState('')
  const [placingMachineId, setPlacingMachineId] = useState('')
  const [zoneName, setZoneName] = useState('Zone')

  const machineList = useMemo(() => {
    const out = []
    for (const z of department?.zones || []) {
      for (const m of z?.machines || []) out.push(m)
    }
    return out
  }, [department])

  const machineById = useMemo(() => {
    const map = new Map()
    for (const m of machineList) map.set(String(m.id), m)
    return map
  }, [machineList])

  const selected = useMemo(
    () => draft.elements.find((e) => String(e.id) === String(selectedId)) || null,
    [draft, selectedId],
  )

  const bgStyle = draft?.background?.src
    ? {
        backgroundImage: `url(${draft.background.src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : null

  const { zoom, pan, setPan, resetZoom } = useWheelZoom({
    ref: containerRef,
    zoom: zoomProp,
    onZoomChange,
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setCanvasSize({ w: rect.width || 1, h: rect.height || 1 })
    }

    update()

    // Keep editor responsive while resizing.
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update)
      ro.observe(el)
    }

    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
      if (ro) ro.disconnect()
    }
  }, [])

  const updateElement = (id, patch) => {
    setDraft((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }

  const deleteSelected = () => {
    if (!selectedId) return
    setDraft((prev) => ({
      ...prev,
      elements: prev.elements.filter((e) => e.id !== selectedId),
    }))
    setSelectedId('')
  }

  const addElement = (partial) => {
    const id = nanoid()
    const base = {
      id,
      x: 0.12,
      y: 0.12,
      w: 0.18,
      h: 0.14,
      rotationDeg: 0,
      label: '',
      ...partial,
    }

    setDraft((prev) => ({ ...prev, elements: [...prev.elements, base] }))
    setSelectedId(id)
  }

  const addZone = () => {
    addElement({ type: ELEMENT_TYPES.ZONE, label: zoneName || 'Zone', w: 0.28, h: 0.22 })
  }

  const addWalkway = () => {
    addElement({ type: ELEMENT_TYPES.WALKWAY, label: 'Walkway', w: 0.32, h: 0.12 })
  }

  const addTransporter = () => {
    addElement({ type: ELEMENT_TYPES.TRANSPORTER, label: 'Transporter', w: 0.18, h: 0.12 })
  }

  const addMachine = () => {
    const id = placingMachineId || (machineList[0] ? String(machineList[0].id) : '')
    if (!id) return
    addElement({ type: ELEMENT_TYPES.MACHINE, machineId: id, w: 0.12, h: 0.12 })
  }

  const onUploadBackground = async (file) => {
    if (!file) return
    const src = await readFileAsDataUrl(file)
    setDraft((prev) => ({ ...prev, background: { type: 'dataUrl', src } }))
  }

  const onUploadAsset = async (kind, file) => {
    if (!file) return
    const src = await readFileAsDataUrl(file)
    setDraft((prev) => ({
      ...prev,
      assets: { ...prev.assets, [kind]: src },
    }))
  }

  const onDragStop = (id, d) => {
    const { w, h } = canvasSize
    updateElement(id, {
      x: pxToNorm(d.x, w),
      y: pxToNorm(d.y, h),
    })
  }

  const onResizeStop = (id, ref, position) => {
    const { w, h } = canvasSize
    updateElement(id, {
      w: pxToNorm(ref.offsetWidth, w),
      h: pxToNorm(ref.offsetHeight, h),
      x: pxToNorm(position.x, w),
      y: pxToNorm(position.y, h),
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
      <div className="rounded-xl border bg-white p-3">
        <div className="text-sm font-semibold text-slate-900">Customize layout</div>
        <div className="mt-1 text-xs text-slate-500">Drag and resize items on the floor.</div>

        <div className="mt-3 space-y-3">
          <div className="rounded-lg border p-2">
            <div className="text-xs font-semibold text-slate-700">Background</div>
            <div className="mt-2 flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onUploadBackground(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => setDraft((prev) => ({ ...prev, background: null }))}
              >
                Clear background
              </button>
            </div>
          </div>

          <div className="rounded-lg border p-2">
            <div className="text-xs font-semibold text-slate-700">Built-in icons (optional)</div>
            <div className="mt-2 space-y-2">
              <label className="block text-xs text-slate-600">
                Machine icon
                <input
                  className="mt-1 block w-full"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onUploadAsset('machineIcon', e.target.files?.[0] || null)}
                />
              </label>
              <label className="block text-xs text-slate-600">
                Transporter icon
                <input
                  className="mt-1 block w-full"
                  type="file"
                  accept="image/*"
                  onChange={(e) => onUploadAsset('transporterIcon', e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border p-2">
            <div className="text-xs font-semibold text-slate-700">Add items</div>

            <div className="mt-2 flex items-center gap-2">
              <input
                className="w-full rounded-md border px-2 py-1 text-sm"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="Zone name"
              />
              <button
                type="button"
                className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={addZone}
              >
                + Zone
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={addWalkway}
              >
                + Walkway
              </button>
              <button
                type="button"
                className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={addTransporter}
              >
                + Transporter
              </button>
            </div>

            <div className="mt-2">
              <div className="text-xs text-slate-600">Machine</div>
              <div className="mt-1 flex items-center gap-2">
                <select
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={placingMachineId}
                  onChange={(e) => setPlacingMachineId(e.target.value)}
                >
                  <option value="">Select machine…</option>
                  {machineList.map((m) => (
                    <option key={m.id} value={String(m.id)}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  onClick={addMachine}
                  disabled={!placingMachineId && machineList.length === 0}
                >
                  + Machine
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-2">
            <div className="text-xs font-semibold text-slate-700">Selected</div>
            {selected ? (
              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold text-slate-900">{elementLabel(selected, machineById)}</div>

                {selected.type !== ELEMENT_TYPES.MACHINE ? (
                  <label className="block text-xs text-slate-600">
                    Label
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={selected.label || ''}
                      onChange={(e) => updateElement(selected.id, { label: e.target.value })}
                    />
                  </label>
                ) : (
                  <label className="block text-xs text-slate-600">
                    Machine binding
                    <select
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={String(selected.machineId || '')}
                      onChange={(e) => updateElement(selected.id, { machineId: e.target.value })}
                    >
                      {machineList.map((m) => (
                        <option key={m.id} value={String(m.id)}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                  onClick={deleteSelected}
                >
                  Delete item
                </button>
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-500">Click an item on the floor to edit it.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={onReset}
            >
              Reset
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
              onClick={() => onSave(draft)}
            >
              Save layout
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-slate-900">Floor</div>
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-xl border bg-slate-50"
          style={{ height: '60vh', maxHeight: 700, minHeight: 360 }}
          onMouseDown={() => setSelectedId('')}
        >
          <div
            className="absolute inset-0 z-0"
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => {
              // Start panning only when dragging the empty floor (this layer).
              if (e.button !== 0) return
              e.preventDefault()
              e.stopPropagation()

              isPanningRef.current = true
              setIsPanning(true)
              panStartRef.current = {
                x: e.clientX,
                y: e.clientY,
                panX: pan.x,
                panY: pan.y,
              }

              const onMove = (ev) => {
                if (!isPanningRef.current) return
                const dx = ev.clientX - panStartRef.current.x
                const dy = ev.clientY - panStartRef.current.y
                setPan({
                  x: panStartRef.current.panX + dx,
                  y: panStartRef.current.panY + dy,
                })
              }

              const onUp = () => {
                isPanningRef.current = false
                setIsPanning(false)
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
              }

              window.addEventListener('mousemove', onMove)
              window.addEventListener('mouseup', onUp)
            }}
          />

          <div
            className="absolute inset-0 z-10"
            style={{
              ...bgStyle,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0px 0px',
            }}
          >
            {!bgStyle ? (
              <div
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(148,163,184,0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.15) 1px, transparent 1px)',
                  backgroundSize: '36px 36px',
                }}
              />
            ) : null

            }

            {draft.elements.map((el) => {
            const { w, h } = canvasSize
            const pxW = Math.max(24, normToPx(el.w, w))
            const pxH = Math.max(24, normToPx(el.h, h))
            const pxX = normToPx(el.x, w)
            const pxY = normToPx(el.y, h)

            const isSelected = el.id === selectedId

            const content =
              el.type === ELEMENT_TYPES.ZONE ? (
                <div className="h-full w-full rounded-lg border border-slate-200 bg-white/70 p-2 text-xs font-semibold text-slate-800">
                  {el.label || 'Zone'}
                </div>
              ) : el.type === ELEMENT_TYPES.WALKWAY ? (
                <div className="h-full w-full rounded-md border border-dashed border-slate-300 bg-slate-100/60" />
              ) : el.type === ELEMENT_TYPES.TRANSPORTER ? (
                <div className="flex h-full w-full items-center justify-center rounded-lg border border-slate-200 bg-white/70 text-slate-700">
                  {el.iconSrc || draft?.assets?.transporterIcon ? (
                    <img
                      src={el.iconSrc || draft?.assets?.transporterIcon}
                      alt="Transporter"
                      className="h-full w-full object-contain p-1"
                    />
                  ) : (
                    <TransporterIcon className="h-full w-full p-1" />
                  )}
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full border border-slate-200 bg-white/70 text-slate-700">
                  {draft?.assets?.machineIcon ? (
                    <img src={draft.assets.machineIcon} alt="Machine" className="h-7 w-7 object-contain" />
                  ) : (
                    <MachineGlyph className="h-7 w-7" />
                  )}
                </div>
              )

            return (
              <Rnd
                key={el.id}
                size={{ width: pxW, height: pxH }}
                position={{ x: pxX, y: pxY }}
                bounds="parent"
                scale={zoom}
                onDragStart={(e) => {
                  e.stopPropagation()
                  setSelectedId(el.id)
                }}
                onDragStop={(e, d) => {
                  e.stopPropagation()
                  onDragStop(el.id, d)
                }}
                onResizeStart={(e) => {
                  e.stopPropagation()
                  setSelectedId(el.id)
                }}
                onResizeStop={(e, dir, ref, delta, pos) => {
                  e.stopPropagation()
                  onResizeStop(el.id, ref, pos)
                }}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  setSelectedId(el.id)
                }}
                enableResizing={{
                  top: true,
                  right: true,
                  bottom: true,
                  left: true,
                  topRight: true,
                  bottomRight: true,
                  bottomLeft: true,
                  topLeft: true,
                }}
                style={{
                  outline: isSelected ? '2px solid rgb(16 185 129)' : 'none',
                  borderRadius: el.type === ELEMENT_TYPES.MACHINE ? 9999 : 12,
                }}
              >
                {content}
              </Rnd>
            )
            })}
          </div>

          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-2">
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
        </div>
      </div>
    </div>
  )
}
