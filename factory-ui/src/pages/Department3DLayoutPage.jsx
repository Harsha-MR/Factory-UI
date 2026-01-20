import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { getDepartmentLayout } from '../services/mockApi'

import DepartmentFloor3DViewer from '../components/layout/DepartmentFloor3DViewer'
import { createDefaultLayoutForDepartment } from '../components/layout/defaultLayout'
import { ELEMENT_TYPES, normalizeLayout } from '../components/layout/layoutTypes'
import {
  deleteDepartmentCustomLayout,
  saveDepartmentCustomLayout,
} from '../services/layoutStorage'

const MODEL_LIBRARY = {
  floor: [
    { label: 'Default floor', url: '/models/floor-model.glb' },
  ],
  [ELEMENT_TYPES.MACHINE]: [
    { label: 'Machine', url: '/models/machine.glb' },
  ],
  [ELEMENT_TYPES.WALKWAY]: [
    { label: 'Walkway', url: '/models/walkway.glb' },
  ],
  [ELEMENT_TYPES.TRANSPORTER]: [
    { label: 'Transporter', url: '/models/transporter.glb' },
    { label: 'Tranporter (alt filename)', url: '/models/tranporter.glb' },
  ],
}

function typeLabel(t) {
  if (t === ELEMENT_TYPES.MACHINE) return 'Machine'
  if (t === ELEMENT_TYPES.WALKWAY) return 'Walkway'
  if (t === ELEMENT_TYPES.TRANSPORTER) return 'Transporter'
  return String(t || '')
}

function clamp(n, min, max) {
  const v = Number(n)
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

function withThreeDDefaults(layout) {
  const normalized = normalizeLayout(layout)
  const threeD = normalized.threeD && typeof normalized.threeD === 'object' ? normalized.threeD : {}

  return {
    ...normalized,
    threeD: {
      floorModelUrl: threeD.floorModelUrl || '/models/floor-model.glb',
      floorModelScale: Number.isFinite(Number(threeD.floorModelScale)) ? Number(threeD.floorModelScale) : 1,
      floorModelAutoRotate: !!threeD.floorModelAutoRotate,
    },
  }
}

export default function Department3DLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId } = useParams()

  const fullscreenRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deptResult, setDeptResult] = useState(null)
  const [draft, setDraft] = useState(null)
  const [showMachineMarkers, setShowMachineMarkers] = useState(true)

  const [activeTool, setActiveTool] = useState('select')
  const [selectedId, setSelectedId] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const plantName = location.state?.plantName || ''

  useEffect(() => {
    if (!departmentId) return
    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const result = await getDepartmentLayout(departmentId)
        if (cancelled) return

        setDeptResult(result)

        const base = result?.customLayout || createDefaultLayoutForDepartment(result?.department)
        setDraft(withThreeDDefaults(base))
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load department')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId])

  useEffect(() => {
    const onFsChange = () => {
      const isFs = typeof document !== 'undefined' && !!document.fullscreenElement
      setIsFullscreen(isFs)
      if (!isFs) setActiveTool('select')
    }
    document.addEventListener('fullscreenchange', onFsChange)
    onFsChange()
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const layoutCtx = useMemo(() => {
    return {
      factoryId: deptResult?.factory?.id || '',
      plantId: deptResult?.plant?.id || '',
      departmentId: departmentId || '',
    }
  }, [deptResult, departmentId])

  const onCancel = () => {
    navigate(`/departments/${departmentId}`, { state: location.state || {} })
  }

  const toggleFullscreen = async () => {
    try {
      const el = fullscreenRef.current
      if (!el || typeof document === 'undefined') return

      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      if (typeof el.requestFullscreen === 'function') {
        await el.requestFullscreen()
      }
    } catch {
      // ignore (fullscreen may be blocked by browser settings)
    }
  }

  const onSave = () => {
    if (!draft) return
    saveDepartmentCustomLayout(layoutCtx, draft)
    navigate(`/departments/${departmentId}`, { state: location.state || {} })
  }

  const onReset = () => {
    deleteDepartmentCustomLayout(layoutCtx)
    const base = createDefaultLayoutForDepartment(deptResult?.department)
    setDraft(withThreeDDefaults(base))
  }

  if (loading && !draft) {
    return (
      <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading 3D editor…</div>
    )
  }

  if (error && !draft) {
    return (
      <div className="rounded border bg-white p-4">
        <div className="text-sm text-red-600">{error}</div>
        <button
          type="button"
          className="mt-3 rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    )
  }

  if (!draft) return null

  const floorScale = Number(draft?.threeD?.floorModelScale) || 1

  const placeableElements = (draft?.elements || []).filter((e) =>
    [ELEMENT_TYPES.MACHINE, ELEMENT_TYPES.WALKWAY, ELEMENT_TYPES.TRANSPORTER].includes(e?.type),
  )
  const selectedElement = selectedId
    ? placeableElements.find((e) => String(e.id) === String(selectedId))
    : null

  return (
    <div className="space-y-3">
      <div
        ref={fullscreenRef}
        className={
          isFullscreen
            ? 'relative h-screen w-screen bg-white p-4 flex flex-col'
            : 'rounded-2xl border bg-white p-4 shadow-sm'
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-slate-900">
              3D Layout — {deptResult?.department?.name || `Department ${departmentId}`}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Plant: {deptResult?.plant?.name || plantName || '—'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
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
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={onSave}
            >
              Save
            </button>
          </div>
        </div>

        <div
          className={
            isFullscreen
              ? 'relative mt-4 flex-1 min-h-0'
              : 'mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]'
          }
        >
          {isFullscreen ? (
            <div className="absolute left-0 top-0 z-20 flex h-full w-[320px] overflow-hidden border-r bg-white/95">
              <div className="flex w-14 flex-col items-center gap-2 border-r bg-slate-50/80 py-3">
                <button
                  type="button"
                  className={
                    activeTool === 'select'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Select / Move"
                  onClick={() => setActiveTool('select')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 3l6.5 15 1.9-5.1L18 11 5 3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  className={
                    activeTool === 'add:machine'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Add machine"
                  onClick={() => setActiveTool('add:machine')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M4 8h16v10H4V8z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path d="M8 8V5h8v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={
                    activeTool === 'add:walkway'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Add walkway"
                  onClick={() => setActiveTool('add:walkway')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 18V6m14 12V6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M7 12h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="2 3"
                    />
                  </svg>
                </button>

                <button
                  type="button"
                  className={
                    activeTool === 'add:transporter'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Add transporter"
                  onClick={() => setActiveTool('add:transporter')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M3 16V8h11v8H3z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14 11h4l3 3v2h-7v-5z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="h-full flex-1 overflow-auto p-3">
                <div className="text-sm font-semibold text-slate-900">Tools</div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={
                    activeTool === 'select'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('select')}
                >
                  Select / Move
                </button>
                <button
                  type="button"
                  className={
                    activeTool === 'add:machine'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('add:machine')}
                >
                  Add machine
                </button>
                <button
                  type="button"
                  className={
                    activeTool === 'add:walkway'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('add:walkway')}
                >
                  Add walkway
                </button>
                <button
                  type="button"
                  className={
                    activeTool === 'add:transporter'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('add:transporter')}
                >
                  Add transporter
                </button>
              </div>

              <div className="mt-4 rounded-lg border p-2">
                <div className="text-xs font-semibold text-slate-700">Floor</div>
                <div className="mt-2 text-[11px] text-slate-500">Model</div>
                <select
                  className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                  value={draft?.threeD?.floorModelUrl || '/models/floor-model.glb'}
                  onChange={(e) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            threeD: {
                              ...(prev.threeD || {}),
                              floorModelUrl: e.target.value,
                            },
                          }
                        : prev,
                    )
                  }
                >
                  {MODEL_LIBRARY.floor.map((m) => (
                    <option key={m.url} value={m.url}>
                      {m.label} ({m.url})
                    </option>
                  ))}
                </select>

                <label className="mt-3 block text-xs text-slate-600">
                  Scale
                  <input
                    className="mt-2 w-full"
                    type="range"
                    min="0.25"
                    max="10"
                    step="0.05"
                    value={String(floorScale)}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              threeD: {
                                ...(prev.threeD || {}),
                                floorModelScale: Number(e.target.value),
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </label>

                <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={!!draft?.threeD?.floorModelAutoRotate}
                    onChange={(e) =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              threeD: {
                                ...(prev.threeD || {}),
                                floorModelAutoRotate: e.target.checked,
                              },
                            }
                          : prev,
                      )
                    }
                  />
                  Auto-rotate
                </label>
              </div>

              <div className="mt-3 rounded-lg border p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-700">Placed items</div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={showMachineMarkers}
                      onChange={(e) => setShowMachineMarkers(e.target.checked)}
                    />
                    Show
                  </label>
                </div>

                <div className="mt-2 max-h-[180px] space-y-1 overflow-auto">
                  {placeableElements.length ? (
                    placeableElements.map((el) => (
                      <button
                        key={String(el.id)}
                        type="button"
                        className={
                          String(selectedId) === String(el.id)
                            ? 'w-full rounded-md bg-sky-50 px-2 py-1 text-left text-xs text-sky-800'
                            : 'w-full rounded-md px-2 py-1 text-left text-xs text-slate-700 hover:bg-slate-50'
                        }
                        onClick={() => {
                          setSelectedId(String(el.id))
                          setActiveTool('select')
                        }}
                      >
                        <div className="font-medium">{el.label || `${typeLabel(el.type)} ${String(el.id).slice(0, 4)}`}</div>
                        <div className="text-[11px] text-slate-500">{typeLabel(el.type)}</div>
                      </button>
                    ))
                  ) : (
                    <div className="text-[11px] text-slate-500">No items yet. Use Add buttons above.</div>
                  )}
                </div>
              </div>

              {selectedElement ? (
                <div className="mt-3 rounded-lg border p-2">
                  <div className="text-xs font-semibold text-slate-700">Selected</div>
                  <div className="mt-1 text-[11px] text-slate-500">{typeLabel(selectedElement.type)}</div>

                  <label className="mt-2 block text-xs text-slate-600">
                    Name
                    <input
                      className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                      value={selectedElement.label || ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                elements: (prev.elements || []).map((x) =>
                                  String(x.id) === String(selectedElement.id) ? { ...x, label: value } : x,
                                ),
                              }
                            : prev,
                        )
                      }}
                    />
                  </label>

                  <label className="mt-2 block text-xs text-slate-600">
                    Model
                    <select
                      className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                      value={selectedElement.modelUrl || MODEL_LIBRARY[selectedElement.type]?.[0]?.url || ''}
                      onChange={(e) => {
                        const value = e.target.value
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                elements: (prev.elements || []).map((x) =>
                                  String(x.id) === String(selectedElement.id) ? { ...x, modelUrl: value } : x,
                                ),
                              }
                            : prev,
                        )
                      }}
                    >
                      {(MODEL_LIBRARY[selectedElement.type] || []).map((m) => (
                        <option key={m.url} value={m.url}>
                          {m.label} ({m.url})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="mt-2 block text-xs text-slate-600">
                    Scale
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className="w-full"
                        type="range"
                        min="0.1"
                        max="10"
                        step="0.05"
                        value={String(clamp(selectedElement.scale ?? 1, 0.1, 10))}
                        onChange={(e) => {
                          const value = clamp(e.target.value, 0.01, 50)
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  elements: (prev.elements || []).map((x) =>
                                    String(x.id) === String(selectedElement.id) ? { ...x, scale: value } : x,
                                  ),
                                }
                              : prev,
                          )
                        }}
                      />
                      <input
                        className="w-20 rounded-lg border px-2 py-1 text-xs"
                        inputMode="decimal"
                        value={String(Number(selectedElement.scale ?? 1).toFixed(2))}
                        onChange={(e) => {
                          const value = clamp(e.target.value, 0.01, 50)
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  elements: (prev.elements || []).map((x) =>
                                    String(x.id) === String(selectedElement.id) ? { ...x, scale: value } : x,
                                  ),
                                }
                              : prev,
                          )
                        }}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">
                      Tip: you can also scale with the gizmo in the 3D view.
                    </div>
                  </label>

                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                    onClick={() => {
                      const id = String(selectedElement.id)
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              elements: (prev.elements || []).filter((x) => String(x.id) !== id),
                            }
                          : prev,
                      )
                      setSelectedId('')
                      setActiveTool('select')
                    }}
                  >
                    Delete selected
                  </button>
                </div>
              ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white p-3">
              <div className="text-sm font-semibold text-slate-900">3D settings</div>
              <div className="mt-1 text-xs text-slate-500">
                Use the scale slider if the GLB looks too small/large.
              </div>

              <div className="mt-3 space-y-3">
                <div className="rounded-lg border p-2">
                  <div className="text-xs font-semibold text-slate-700">Floor model</div>
                  <div className="mt-2 text-xs text-slate-600 break-all">{draft?.threeD?.floorModelUrl}</div>

                  <label className="mt-3 block text-xs text-slate-600">
                    Scale: {floorScale.toFixed(2)}x
                    <input
                      className="mt-2 w-full"
                      type="range"
                      min="0.25"
                      max="10"
                      step="0.05"
                      value={String(floorScale)}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                threeD: {
                                  ...(prev.threeD || {}),
                                  floorModelScale: Number(e.target.value),
                                },
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!draft?.threeD?.floorModelAutoRotate}
                      onChange={(e) =>
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                threeD: {
                                  ...(prev.threeD || {}),
                                  floorModelAutoRotate: e.target.checked,
                                },
                              }
                            : prev,
                        )
                      }
                    />
                    Auto-rotate
                  </label>
                </div>

                <div className="rounded-lg border p-2">
                  <div className="text-xs font-semibold text-slate-700">Machines</div>
                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={showMachineMarkers}
                      onChange={(e) => setShowMachineMarkers(e.target.checked)}
                    />
                    Show draggable machine markers
                  </label>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Tip: use Full screen to access add/scale tools.
                  </div>
                </div>
              </div>
            </div>
          )}

          <div
            style={isFullscreen ? { paddingLeft: 320, height: '100%' } : undefined}
            className={isFullscreen ? 'h-full' : undefined}
          >
            <DepartmentFloor3DViewer
              modelUrl={draft?.threeD?.floorModelUrl || '/models/floor-model.glb'}
              scale={floorScale}
              autoRotate={!!draft?.threeD?.floorModelAutoRotate}
              elements={draft?.elements || []}
              showMachineMarkers={showMachineMarkers}
              fullScreen={isFullscreen}
              activeTool={activeTool}
              selectedId={selectedId}
              onSelectElement={(id) => {
                setSelectedId(String(id || ''))
                setActiveTool('select')
              }}
              onAddElement={(type, pos) => {
                const t = String(type)
                const newId = nanoid(8)
                const defaultModelUrl = MODEL_LIBRARY[t]?.[0]?.url
                const label = `${typeLabel(t)} ${newId.slice(0, 4)}`

                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        elements: [
                          ...(prev.elements || []),
                          {
                            id: newId,
                            type: t,
                            label,
                            x: pos?.x ?? 0.5,
                            y: pos?.y ?? 0.5,
                            w: 0.12,
                            h: 0.12,
                            scale: 1,
                            modelUrl: defaultModelUrl,
                          },
                        ],
                      }
                    : prev,
                )
                setSelectedId(newId)
                setActiveTool('select')
              }}
              onMoveElement={(id, patch) => {
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        elements: (prev.elements || []).map((e) =>
                          String(e.id) === String(id) ? { ...e, ...patch } : e,
                        ),
                      }
                    : prev,
                )
              }}
              onUpdateElement={(id, patch) => {
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        elements: (prev.elements || []).map((e) =>
                          String(e.id) === String(id) ? { ...e, ...patch } : e,
                        ),
                      }
                    : prev,
                )
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
