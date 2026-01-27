import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { nanoid } from 'nanoid'
import { getDepartmentLayout } from '../services/mockApi'

import DepartmentFloor3DViewer from '../components/layout/DepartmentFloor3DViewer'
import { createDefaultLayoutForDepartment } from '../components/layout/defaultLayout'
import { ELEMENT_TYPES, normalizeLayout } from '../components/layout/layoutTypes'
import {
  deleteDepartmentCustomLayout,
  fetchDepartmentCustomLayoutVersions,
  saveDepartmentCustomLayout,
} from '../services/layoutStorage'

const MODEL_LIBRARY = {
  floor: [
    { label: 'Default floor', url: '/models/floor-model.glb' },
  ],
  [ELEMENT_TYPES.MACHINE]: [
    { label: 'Machine', url: '/models/machine.glb' },
  ],
  [ELEMENT_TYPES.TRANSPORTER]: [
    { label: 'Transporter', url: '/models/transporter.glb' },
    { label: 'Tranporter (alt filename)', url: '/models/tranporter.glb' },
  ],
}

function typeLabel(t) {
  if (t === ELEMENT_TYPES.FLOOR) return 'Floor'
  if (t === ELEMENT_TYPES.MACHINE) return 'Machine'
  if (t === ELEMENT_TYPES.ZONE) return 'Zone'
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
  const [showMachineLabels, setShowMachineLabels] = useState(true)
  const [machineStatusVisibility, setMachineStatusVisibility] = useState({
    RUNNING: true,
    WARNING: true,
    DOWN: true,
    MAINTENANCE: true,
    OFFLINE: true,
  })

  const [activeTool, setActiveTool] = useState('select')
  const [selectedId, setSelectedId] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [toast, setToast] = useState(null)

  const [layoutVersions, setLayoutVersions] = useState({ current: null, previous: null })
  const [layoutView, setLayoutView] = useState('current')

  const plantName = location.state?.plantName || ''

  const layoutCtx = useMemo(() => {
    return {
      factoryId: deptResult?.factory?.id || '',
      plantId: deptResult?.plant?.id || '',
      departmentId: departmentId || '',
    }
  }, [deptResult, departmentId])

  useEffect(() => {
    const v = location.state?.layoutView
    if (v === 'previous' || v === 'current') setLayoutView(v)
  }, [location.state?.layoutView])

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

        const versions = await fetchDepartmentCustomLayoutVersions({
          factoryId: result?.factory?.id || '',
          plantId: result?.plant?.id || '',
          departmentId: departmentId || '',
        })
        setLayoutVersions(versions)

        const requested = location.state?.layoutView
        const initialView = requested === 'previous' ? 'previous' : 'current'
        setLayoutView(initialView)

        const base =
          (initialView === 'previous' ? versions?.previous : versions?.current) ||
          result?.customLayout ||
          createDefaultLayoutForDepartment(result?.department)
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
    if (!layoutCtx?.departmentId) return
    let cancelled = false
    ;(async () => {
      const versions = await fetchDepartmentCustomLayoutVersions(layoutCtx)
      if (!cancelled) setLayoutVersions(versions)
    })()
    return () => {
      cancelled = true
    }
  }, [layoutCtx])

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

  useEffect(() => {
    const t = location.state?.toast
    if (!t?.ts) return

    setToast({
      kind: t.kind || 'success',
      message: t.message || 'Saved',
      ts: t.ts,
    })

    const timer = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(timer)
  }, [location.state?.toast?.ts])

  const machineMetaById = useMemo(() => {
    const zones = deptResult?.department?.zones || []
    const out = {}
    for (const z of zones) {
      for (const m of z?.machines || []) {
        if (!m) continue
        const id = String(m.id || '')
        if (!id) continue
        out[id] = {
          ...m,
          id,
          name: m?.name || id,
          status: m?.status || 'RUNNING',
        }
      }
    }
    return out
  }, [deptResult])

  const onOpenMachineDetails = (machineId) => {
    const mid = String(machineId || '')
    if (!mid) return
    const m = machineMetaById?.[mid] || null
    if (!m?.id) return

    navigate(`/departments/${departmentId}/machines/${m.id}`,
      {
        state: {
          backgroundLocation: location,
          machine: m,
          context: {
            department: deptResult?.department?.name || `Department ${departmentId}`,
            plant: deptResult?.plant?.name || plantName,
          },
          fetchedAt: deptResult?.meta?.fetchedAt || '',
        },
      },
    )
  }

  const onCancel = () => {
    // With the 2D department page removed, prefer going back to where the user came from.
    // If this page was opened directly, fall back to the dashboard.
    if (location.state?.fromDashboard) {
      navigate(-1)
      return
    }

    navigate('/dashboard')
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
    setLayoutView('current')
    // Stay on the 3D layout route after saving.
    navigate(`/departments/${departmentId}/layout-3d`, {
      replace: true,
      state: {
        ...(location.state || {}),
        layoutView: 'current',
        toast: {
          kind: 'success',
          message: 'Department layout saved',
          ts: Date.now(),
        },
      },
    })
  }

  const onReset = () => {
    deleteDepartmentCustomLayout(layoutCtx)
    const base = createDefaultLayoutForDepartment(deptResult?.department)
    setDraft(withThreeDDefaults(base))
    setLayoutVersions({ current: null, previous: null })
    setLayoutView('current')
  }

  const applyLayoutView = (next) => {
    const v = next === 'previous' ? 'previous' : 'current'
    setLayoutView(v)
    const chosen = v === 'previous' ? layoutVersions?.previous : layoutVersions?.current
    const base = chosen || deptResult?.customLayout || createDefaultLayoutForDepartment(deptResult?.department)
    setDraft(withThreeDDefaults(base))
    setSelectedId('')
    setActiveTool('select')
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

  const neutralBtnClass = isFullscreen
    ? 'rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50'
    : 'rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-900'

  const floorScale = Number(draft?.threeD?.floorModelScale) || 1

  const placeableElements = (draft?.elements || []).filter((e) =>
    [
      ELEMENT_TYPES.FLOOR,
      ELEMENT_TYPES.MACHINE,
      ELEMENT_TYPES.ZONE,
      ELEMENT_TYPES.WALKWAY,
      ELEMENT_TYPES.TRANSPORTER,
    ].includes(e?.type),
  )
  const selectedElement = selectedId
    ? (draft?.elements || []).find((e) => String(e?.id) === String(selectedId))
    : null

  return (
    <div className="space-y-3">
      <div
        ref={fullscreenRef}
        className={
          isFullscreen
            ? 'relative h-screen w-screen bg-white p-4 flex flex-col'
            : 'relative rounded-2xl border bg-slate-950 p-4 shadow-sm'
        }
      >
        {toast ? (
          <div className="absolute right-4 top-4 z-[9999]">
            <div
              className={
                toast.kind === 'success'
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 shadow-sm'
                  : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm'
              }
              role="status"
              aria-live="polite"
            >
              {toast.message}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={isFullscreen ? 'text-2xl font-semibold text-slate-900' : 'text-2xl font-semibold text-slate-100'}>
              3D Layout — {deptResult?.department?.name || `Department ${departmentId}`}
            </div>
            <div className={isFullscreen ? 'mt-1 text-sm text-slate-500' : 'mt-1 text-sm text-slate-400'}>
              Plant: {deptResult?.plant?.name || plantName || '—'}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={
                isFullscreen
                  ? 'mr-1 inline-flex items-center gap-1 rounded-lg border bg-white px-1 py-1'
                  : 'mr-1 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950/40 px-1 py-1'
              }
              title="Switch between saved layouts"
            >
              <button
                type="button"
                className={
                  layoutView === 'current'
                    ? (isFullscreen
                        ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white'
                        : 'rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white')
                    : (isFullscreen
                        ? 'rounded-md px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50'
                        : 'rounded-md px-2.5 py-1 text-xs text-slate-200 hover:bg-white/5')
                }
                onClick={() => applyLayoutView('current')}
              >
                Current
              </button>
              <button
                type="button"
                className={
                  layoutView === 'previous'
                    ? (isFullscreen
                        ? 'rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white'
                        : 'rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold text-white')
                    : (isFullscreen
                        ? 'rounded-md px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50'
                        : 'rounded-md px-2.5 py-1 text-xs text-slate-200 hover:bg-white/5')
                }
                onClick={() => applyLayoutView('previous')}
                disabled={!layoutVersions?.previous}
                title={layoutVersions?.previous ? 'View previous saved layout' : 'No previous saved layout yet'}
              >
                Previous
              </button>
            </div>

            <button
              type="button"
              className={neutralBtnClass}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
            
            <button
              type="button"
              className={neutralBtnClass}
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
              : 'mt-4 flex justify-center'
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
                    activeTool === 'add:floor'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Add floor"
                  onClick={() => setActiveTool('add:floor')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M7 9h10M7 12h10M7 15h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={
                    activeTool === 'add:zone'
                      ? 'grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white'
                      : 'grid h-10 w-10 place-items-center rounded-lg border bg-white text-slate-700 hover:bg-slate-50'
                  }
                  title="Add zone"
                  onClick={() => setActiveTool('add:zone')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                    <path d="M8 10h8M8 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
                    activeTool === 'add:floor'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('add:floor')}
                >
                  Add floor
                </button>

                <button
                  type="button"
                  className={
                    activeTool === 'add:zone'
                      ? 'rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white'
                      : 'rounded-lg border px-3 py-2 text-xs text-slate-700 hover:bg-slate-50'
                  }
                  onClick={() => setActiveTool('add:zone')}
                >
                  Add zone
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
                <div className="mt-2 text-[11px] text-slate-500">
                  Floor is a 2D white overlay rectangle. Use “Add floor”, then click + drag + release.
                </div>

                <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
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

                  <div className="mt-3 rounded-lg border bg-slate-50 p-2">
                    <div className="text-[11px] font-semibold text-slate-700">Rotation</div>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[
                        { label: 'Top', deg: 0 },
                        { label: 'Right', deg: 90 },
                        { label: 'Down', deg: 180 },
                        { label: 'Left', deg: 270 },
                      ].map((r) => (
                        <button
                          key={r.label}
                          type="button"
                          className={
                            Number(selectedElement.rotationDeg || 0) === r.deg
                              ? 'rounded-md bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white'
                              : 'rounded-md border bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50'
                          }
                          onClick={() => {
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    elements: (prev.elements || []).map((x) =>
                                      String(x.id) === String(selectedElement.id)
                                        ? { ...x, rotationDeg: r.deg }
                                        : x,
                                    ),
                                  }
                                : prev,
                            )
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <label className="mt-2 block text-[11px] text-slate-600">
                      Degrees
                      <input
                        className="mt-1 w-full rounded-md border bg-white px-2 py-1 text-xs"
                        inputMode="numeric"
                        value={String(Number(selectedElement.rotationDeg || 0))}
                        onChange={(e) => {
                          const value = clamp(e.target.value, -360, 360)
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  elements: (prev.elements || []).map((x) =>
                                    String(x.id) === String(selectedElement.id)
                                      ? { ...x, rotationDeg: value }
                                      : x,
                                  ),
                                }
                              : prev,
                          )
                        }}
                      />
                    </label>
                  </div>

                  {selectedElement.type === ELEMENT_TYPES.ZONE ? (
                    <>
                      <label className="mt-2 block text-xs text-slate-600">
                        Fill color
                        <select
                          className="mt-1 w-full rounded-lg border px-2 py-1 text-xs text-slate-700"
                          value={selectedElement.color || 'dark-green'}
                          onChange={(e) => {
                            const value = e.target.value
                            setDraft((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    elements: (prev.elements || []).map((x) =>
                                      String(x.id) === String(selectedElement.id) ? { ...x, color: value } : x,
                                    ),
                                  }
                                : prev,
                            )
                          }}
                        >
                          <option value="dark-green">Dark green</option>
                          <option value="orange">Orange</option>
                          <option value="yellow">Yellow</option>
                        </select>
                      </label>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block text-xs text-slate-600">
                          Width
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                            inputMode="decimal"
                            value={String(Number(selectedElement.w ?? 0.2).toFixed(3))}
                            onChange={(e) => {
                              const value = clamp(e.target.value, 0.02, 1)
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map((x) =>
                                        String(x.id) === String(selectedElement.id) ? { ...x, w: value } : x,
                                      ),
                                    }
                                  : prev,
                              )
                            }}
                          />
                        </label>
                        <label className="block text-xs text-slate-600">
                          Height
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                            inputMode="decimal"
                            value={String(Number(selectedElement.h ?? 0.12).toFixed(3))}
                            onChange={(e) => {
                              const value = clamp(e.target.value, 0.02, 1)
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map((x) =>
                                        String(x.id) === String(selectedElement.id) ? { ...x, h: value } : x,
                                      ),
                                    }
                                  : prev,
                              )
                            }}
                          />
                        </label>
                      </div>
                    </>
                  ) : selectedElement.type === ELEMENT_TYPES.WALKWAY ? (
                    <>
                      <div className="mt-2 text-xs text-slate-600">Walkway overlay (black fill)</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block text-xs text-slate-600">
                          Width
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                            inputMode="decimal"
                            value={String(Number(selectedElement.w ?? 0.25).toFixed(3))}
                            onChange={(e) => {
                              const value = clamp(e.target.value, 0.02, 1)
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map((x) =>
                                        String(x.id) === String(selectedElement.id) ? { ...x, w: value } : x,
                                      ),
                                    }
                                  : prev,
                              )
                            }}
                          />
                        </label>
                        <label className="block text-xs text-slate-600">
                          Height
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1 text-xs"
                            inputMode="decimal"
                            value={String(Number(selectedElement.h ?? 0.06).toFixed(3))}
                            onChange={(e) => {
                              const value = clamp(e.target.value, 0.02, 1)
                              setDraft((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      elements: (prev.elements || []).map((x) =>
                                        String(x.id) === String(selectedElement.id) ? { ...x, h: value } : x,
                                      ),
                                    }
                                  : prev,
                              )
                            }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}

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
          ) : null}

          <div
            style={isFullscreen ? { paddingLeft: 320, height: '100%' } : undefined}
            className={isFullscreen ? 'h-full' : 'w-full lg:w-[90%]'}
          >
            {!isFullscreen ? (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={showMachineMarkers}
                      onChange={(e) => setShowMachineMarkers(e.target.checked)}
                    />
                    Show machines
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={showMachineLabels}
                      onChange={(e) => setShowMachineLabels(e.target.checked)}
                    />
                    Show labels
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {['RUNNING', 'WARNING', 'DOWN', 'MAINTENANCE', 'OFFLINE'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={
                        machineStatusVisibility?.[s]
                          ? 'rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-100'
                          : 'rounded-full border border-slate-800 bg-transparent px-3 py-1 text-xs text-slate-400'
                      }
                      onClick={() =>
                        setMachineStatusVisibility((prev) => ({
                          ...(prev || {}),
                          [s]: !prev?.[s],
                        }))
                      }
                      title={`Toggle ${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <DepartmentFloor3DViewer
              modelUrl={draft?.threeD?.floorModelUrl || '/models/floor-model.glb'}
              scale={floorScale}
              autoRotate={!!draft?.threeD?.floorModelAutoRotate}
              elements={draft?.elements || []}
              showMachineMarkers={showMachineMarkers}
              showMachineLabels={showMachineLabels}
              machineMetaById={machineMetaById}
              onOpenMachineDetails={!isFullscreen ? onOpenMachineDetails : undefined}
              machineStatusVisibility={machineStatusVisibility}
              fullScreen={isFullscreen}
              activeTool={isFullscreen ? activeTool : 'select'}
              selectedId={isFullscreen ? selectedId : ''}
              onSelectElement={
                isFullscreen
                  ? (id) => {
                      setSelectedId(String(id || ''))
                      setActiveTool('select')
                    }
                  : undefined
              }
              onAddElement={
                isFullscreen
                  ? (type, pos) => {
                      const t = String(type)
                      const newId = nanoid(8)
                      const defaultModelUrl = MODEL_LIBRARY[t]?.[0]?.url
                      const label = `${typeLabel(t)} ${newId.slice(0, 4)}`

                      const defaultsForType = () => {
                        if (t === ELEMENT_TYPES.FLOOR) {
                          return { w: 0.9, h: 0.9 }
                        }
                        if (t === ELEMENT_TYPES.ZONE) {
                          return { w: 0.35, h: 0.22, color: 'dark-green' }
                        }
                        if (t === ELEMENT_TYPES.WALKWAY) {
                          return { w: 0.3, h: 0.06 }
                        }
                        return { w: 0.12, h: 0.12, scale: 1, modelUrl: defaultModelUrl }
                      }

                      const defaults = defaultsForType()

                      // Viewer can pass either a center point ({x,y}) or a drag-sized rect ({x,y,w,h}).
                      const isDragRect = pos && typeof pos === 'object' && Number.isFinite(Number(pos.w)) && Number.isFinite(Number(pos.h))
                      const rawX = pos?.x ?? 0.5
                      const rawY = pos?.y ?? 0.5

                      const x = isDragRect
                        ? clamp(rawX, 0, 1)
                        : t === ELEMENT_TYPES.FLOOR || t === ELEMENT_TYPES.ZONE || t === ELEMENT_TYPES.WALKWAY
                          ? clamp(rawX - (Number(defaults.w) || 0) / 2, 0, 1)
                          : rawX

                      const y = isDragRect
                        ? clamp(rawY, 0, 1)
                        : t === ELEMENT_TYPES.FLOOR || t === ELEMENT_TYPES.ZONE || t === ELEMENT_TYPES.WALKWAY
                          ? clamp(rawY - (Number(defaults.h) || 0) / 2, 0, 1)
                          : rawY

                      const w = isDragRect ? clamp(pos?.w, 0.02, 1) : defaults.w
                      const h = isDragRect ? clamp(pos?.h, 0.02, 1) : defaults.h
                      const color = t === ELEMENT_TYPES.ZONE ? (pos?.color || defaults.color || 'dark-green') : undefined
                      const rotationDeg = Number.isFinite(Number(pos?.rotationDeg)) ? Number(pos.rotationDeg) : 0

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
                                  x,
                                  y,
                                  ...defaults,
                                  w,
                                  h,
                                  rotationDeg,
                                  ...(color ? { color } : null),
                                },
                              ],
                            }
                          : prev,
                      )
                      setSelectedId(newId)
                      setActiveTool('select')
                    }
                  : undefined
              }
              onMoveElement={
                isFullscreen
                  ? (id, patch) => {
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
                    }
                  : undefined
              }
              onUpdateElement={
                isFullscreen
                  ? (id, patch) => {
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
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  )
}
