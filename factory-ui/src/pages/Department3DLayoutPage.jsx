import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

function mergeLayoutWithDepartment(layout, department) {
  const dept = department && typeof department === 'object' ? department : null
  const base = withThreeDDefaults(layout)

  // If we don't have department data, nothing to sync against.
  if (!dept) return base

  // Generate the current auto-layout from the department so we can borrow positions
  // for any newly-added zones/machines.
  const auto = withThreeDDefaults(createDefaultLayoutForDepartment(dept))

  const baseElements = Array.isArray(base.elements) ? base.elements : []
  const autoElements = Array.isArray(auto.elements) ? auto.elements : []

  const autoById = new Map(autoElements.map((e) => [String(e.id), e]))
  const autoMachineById = new Map(
    autoElements
      .filter((e) => e?.type === ELEMENT_TYPES.MACHINE && e?.machineId)
      .map((e) => [String(e.machineId), e]),
  )

  const hasFloor = baseElements.some((e) => e?.type === ELEMENT_TYPES.FLOOR)
  const existingZoneElementIds = new Set(
    baseElements.filter((e) => e?.type === ELEMENT_TYPES.ZONE).map((e) => String(e.id)),
  )
  const existingMachineIds = new Set(
    baseElements
      .filter((e) => e?.type === ELEMENT_TYPES.MACHINE && e?.machineId)
      .map((e) => String(e.machineId)),
  )

  const toAdd = []

  if (!hasFloor) {
    const floor = autoElements.find((e) => e?.type === ELEMENT_TYPES.FLOOR) || autoById.get('floor-1')
    if (floor) toAdd.push(floor)
  }

  const zones = Array.isArray(dept?.zones) ? dept.zones : []
  for (let zi = 0; zi < zones.length; zi += 1) {
    const z = zones[zi]
    const zoneId = String(z?.id || '').trim()
    if (!zoneId) continue

    // Our default layout uses ids like: `zone-${zone.id}`.
    const zoneElementId = `zone-${zoneId}`
    if (!existingZoneElementIds.has(zoneElementId)) {
      const fromAuto = autoById.get(zoneElementId)
      toAdd.push(
        fromAuto || {
          id: zoneElementId,
          type: ELEMENT_TYPES.ZONE,
          label: z?.name || `Zone ${zi + 1}`,
          x: 0.12,
          y: 0.12,
          w: 0.22,
          h: 0.18,
          rotationDeg: 0,
          color: 'dark-green',
        },
      )
    }

    const machines = Array.isArray(z?.machines) ? z.machines : []
    for (const m of machines) {
      const mid = String(m?.id || '').trim()
      if (!mid) continue
      if (existingMachineIds.has(mid)) continue

      const fromAuto = autoMachineById.get(mid)
      toAdd.push(
        fromAuto || {
          id: `machine-${mid}`,
          type: ELEMENT_TYPES.MACHINE,
          machineId: mid,
          x: 0.16,
          y: 0.16,
          w: 0.06,
          h: 0.06,
          rotationDeg: 0,
        },
      )
    }
  }

  if (!toAdd.length) return base

  // Normalize again to ensure any synthesized elements match expected shape.
  return withThreeDDefaults({
    ...base,
    elements: [...baseElements, ...toAdd],
  })
}

export default function Department3DLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId } = useParams()

  const fullscreenRef = useRef(null)
  const lastPointerRef = useRef({ x: 0.5, y: 0.5 })
  const toastTimerRef = useRef(0)

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
  const [machineForm, setMachineForm] = useState({ zoneName: '', machineName: '' })
  const [machineFormError, setMachineFormError] = useState('')
  const [pendingMachinePlacement, setPendingMachinePlacement] = useState(null)

  const [activeTool, setActiveTool] = useState('select')
  const [selectedId, setSelectedId] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  const requestedLayoutView = location.state?.layoutView
  const handlePointerPositionChange = useCallback((pos) => {
    if (!pos) return
    const x = clamp(pos.x, 0, 1)
    const y = clamp(pos.y, 0, 1)
    lastPointerRef.current = { x, y }
  }, [])

  const navToast = location.state?.toast

  const [toast, setToast] = useState(null)
  const pushToast = useCallback((payload) => {
    if (!payload) return
    setToast(payload)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2200)
  }, [])

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

        const initialView = requestedLayoutView === 'previous' ? 'previous' : 'current'
        setLayoutView(initialView)

        const base =
          (initialView === 'previous' ? versions?.previous : versions?.current) ||
          result?.customLayout ||
          createDefaultLayoutForDepartment(result?.department)
        setDraft(mergeLayoutWithDepartment(base, result?.department))
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load department')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId, requestedLayoutView])

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
    if (!pendingMachinePlacement) return
    if (activeTool === 'add:machine') return
    setPendingMachinePlacement(null)
  }, [activeTool, pendingMachinePlacement])

  useEffect(() => {
    if (!pendingMachinePlacement) return
    if (isFullscreen) return
    setPendingMachinePlacement(null)
  }, [isFullscreen, pendingMachinePlacement])

  useEffect(() => {
    if (!navToast?.ts) return
    pushToast({
      kind: navToast.kind || 'success',
      message: navToast.message || 'Saved',
      ts: navToast.ts,
    })
  }, [navToast, pushToast])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

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
          zoneName: z?.name || '',
        }
      }
    }

    const fallbackPlantId = layoutCtx?.plantId || ''
    const fallbackDepartmentId = layoutCtx?.departmentId || ''
    for (const el of draft?.elements || []) {
      if (!el || el.type !== ELEMENT_TYPES.MACHINE) continue
      const machineId = String(el.machineId || '').trim()
      if (!machineId || out[machineId]) continue

      const meta = el.meta && typeof el.meta === 'object' ? el.meta : {}
      out[machineId] = {
        id: machineId,
        name: meta.machineName || el.label || machineId,
        status: meta.status || 'RUNNING',
        zoneName: meta.zoneName || '',
        plantId: meta.plantId || fallbackPlantId,
        departmentId: meta.departmentId || fallbackDepartmentId,
      }
    }

    return out
  }, [deptResult, draft, layoutCtx])

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

  const addMachineFromSidebar = () => {
    if (!draft) {
      setMachineFormError('Layout is still loading. Please try again in a second.')
      return
    }

    if (pendingMachinePlacement) {
      setMachineFormError('Finish placing the current machine before adding another.')
      return
    }

    const zoneName = machineForm.zoneName.trim()
    const machineName = machineForm.machineName.trim()
    if (!zoneName || !machineName) {
      setMachineFormError('Enter both the zone name and machine name.')
      return
    }

    const machineId = `${layoutCtx?.departmentId || 'dept'}-${nanoid(6)}`
    const defaultModelUrl = MODEL_LIBRARY[ELEMENT_TYPES.MACHINE]?.[0]?.url || '/models/machine.glb'
    const pointer = lastPointerRef.current || { x: 0.5, y: 0.5 }

    setPendingMachinePlacement({
      machineId,
      machineName,
      zoneName,
      w: 0.08,
      h: 0.08,
      scale: 1,
      rotationDeg: 0,
      modelUrl: defaultModelUrl,
      meta: {
        plantId: layoutCtx?.plantId || '',
        departmentId: layoutCtx?.departmentId || '',
        zoneName,
        machineName,
        createdAt: new Date().toISOString(),
      },
      pointer,
    })

    setMachineForm({ zoneName: '', machineName: '' })
    setMachineFormError('')
    setActiveTool('add:machine')
    pushToast({
      kind: 'info',
      message: 'Move the cursor over the floor and click when the cyan preview aligns with your target spot.',
      ts: Date.now(),
    })
  }

  const applyLayoutView = (next) => {
    const v = next === 'previous' ? 'previous' : 'current'
    setLayoutView(v)
    const chosen = v === 'previous' ? layoutVersions?.previous : layoutVersions?.current
    const base = chosen || deptResult?.customLayout || createDefaultLayoutForDepartment(deptResult?.department)
    setDraft(mergeLayoutWithDepartment(base, deptResult?.department))
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
  const machinePlacementArmed = isFullscreen && activeTool === 'add:machine' && !!pendingMachinePlacement
  const viewerActiveTool = isFullscreen
    ? machinePlacementArmed
      ? 'add:machine'
      : activeTool === 'add:machine'
        ? 'select'
        : activeTool
    : 'select'

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

              {activeTool === 'add:machine' ? (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-xs font-semibold text-slate-800">Enter machine details</div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Plant and department IDs are filled in automatically.
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                    <div className="rounded-md bg-slate-50 px-2 py-1">
                      <span className="font-semibold">Plant ID:</span> {layoutCtx?.plantId || '—'}
                    </div>
                    <div className="rounded-md bg-slate-50 px-2 py-1">
                      <span className="font-semibold">Department ID:</span> {layoutCtx?.departmentId || '—'}
                    </div>
                  </div>

                  <label className="mt-3 block text-xs text-slate-600">
                    Zone name
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                      value={machineForm.zoneName}
                      onChange={(e) => {
                        const value = e.target.value
                        setMachineForm((prev) => ({ ...prev, zoneName: value }))
                        if (machineFormError) setMachineFormError('')
                      }}
                      placeholder="e.g. Assembly"
                    />
                  </label>

                  <label className="mt-2 block text-xs text-slate-600">
                    Machine name
                    <input
                      className="mt-1 w-full rounded-md border px-2 py-1 text-xs"
                      value={machineForm.machineName}
                      onChange={(e) => {
                        const value = e.target.value
                        setMachineForm((prev) => ({ ...prev, machineName: value }))
                        if (machineFormError) setMachineFormError('')
                      }}
                      placeholder="e.g. CNC-07"
                    />
                  </label>

                  {machineFormError ? (
                    <div className="mt-2 text-[11px] text-red-600">{machineFormError}</div>
                  ) : pendingMachinePlacement ? (
                    <div className="mt-2 text-[11px] text-emerald-600">
                      Placement armed for{' '}
                      <span className="font-semibold">{pendingMachinePlacement.machineName || 'Machine'}</span>. Move the cursor inside
                      the 3D canvas and click when the cyan preview is exactly where you want it.
                    </div>
                  ) : (
                    <div className="mt-2 text-[11px] text-slate-500">
                      Fill both fields, click "Add machine to canvas", then click on the highlighted preview inside the 3D view.
                    </div>
                  )}

                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    onClick={addMachineFromSidebar}
                    disabled={!machineForm.zoneName.trim() || !machineForm.machineName.trim() || !!pendingMachinePlacement}
                  >
                    Add machine to canvas
                  </button>
                </div>
              ) : null}

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
              onPointerPositionChange={isFullscreen ? handlePointerPositionChange : undefined}
              fullScreen={isFullscreen}
              activeTool={viewerActiveTool}
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
                      const machineSeed =
                        t === ELEMENT_TYPES.MACHINE && pendingMachinePlacement ? pendingMachinePlacement : null
                      const label = machineSeed?.machineName || `${typeLabel(t)} ${newId.slice(0, 4)}`

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
                        if (t === ELEMENT_TYPES.MACHINE) {
                          return {
                            w: machineSeed?.w ?? 0.12,
                            h: machineSeed?.h ?? 0.12,
                            scale: machineSeed?.scale ?? 1,
                            modelUrl: machineSeed?.modelUrl ?? defaultModelUrl,
                          }
                        }
                        if (t === ELEMENT_TYPES.TRANSPORTER) {
                          return { w: 0.18, h: 0.08, scale: 1, modelUrl: defaultModelUrl }
                        }
                        return { w: 0.12, h: 0.12, scale: 1, modelUrl: defaultModelUrl }
                      }

                      const defaults = defaultsForType()

                      const isDragRect =
                        pos && typeof pos === 'object' && Number.isFinite(Number(pos.w)) && Number.isFinite(Number(pos.h))
                      const rawX = clamp(pos?.x ?? 0.5, 0, 1)
                      const rawY = clamp(pos?.y ?? 0.5, 0, 1)

                      const baseW = Number(defaults.w)
                      const baseH = Number(defaults.h)
                      const fallbackW = Number.isFinite(baseW) && baseW > 0 ? baseW : 0.12
                      const fallbackH = Number.isFinite(baseH) && baseH > 0 ? baseH : 0.12

                      const finalW = clamp(isDragRect ? Number(pos?.w) : fallbackW, 0.02, 1)
                      const finalH = clamp(isDragRect ? Number(pos?.h) : fallbackH, 0.02, 1)

                      const shouldCenter =
                        !isDragRect &&
                        (t === ELEMENT_TYPES.FLOOR ||
                          t === ELEMENT_TYPES.ZONE ||
                          t === ELEMENT_TYPES.WALKWAY ||
                          t === ELEMENT_TYPES.MACHINE ||
                          t === ELEMENT_TYPES.TRANSPORTER)

                      const finalX = isDragRect
                        ? clamp(rawX, 0, 1 - finalW)
                        : shouldCenter
                          ? clamp(rawX - finalW / 2, 0, 1 - finalW)
                          : clamp(rawX, 0, 1 - finalW)

                      const finalY = isDragRect
                        ? clamp(rawY, 0, 1 - finalH)
                        : shouldCenter
                          ? clamp(rawY - finalH / 2, 0, 1 - finalH)
                          : clamp(rawY, 0, 1 - finalH)

                      const color = t === ELEMENT_TYPES.ZONE ? (pos?.color || defaults.color || 'dark-green') : undefined
                      const rotationDeg = Number.isFinite(Number(pos?.rotationDeg)) ? Number(pos.rotationDeg) : 0

                      const machineId =
                        t === ELEMENT_TYPES.MACHINE
                          ? machineSeed?.machineId || `${layoutCtx?.departmentId || 'dept'}-${nanoid(6)}`
                          : undefined
                      const machineMeta =
                        t === ELEMENT_TYPES.MACHINE
                          ? {
                              plantId: machineSeed?.meta?.plantId || layoutCtx?.plantId || '',
                              departmentId: machineSeed?.meta?.departmentId || layoutCtx?.departmentId || '',
                              zoneName: machineSeed?.meta?.zoneName || machineSeed?.zoneName || '',
                              machineName: machineSeed?.meta?.machineName || machineSeed?.machineName || label,
                              createdAt: machineSeed?.meta?.createdAt || new Date().toISOString(),
                            }
                          : null

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
                                  x: finalX,
                                  y: finalY,
                                  ...defaults,
                                  w: finalW,
                                  h: finalH,
                                  rotationDeg,
                                  ...(color ? { color } : null),
                                  ...(machineId ? { machineId } : null),
                                  ...(machineId ? { meta: machineMeta } : null),
                                },
                              ],
                            }
                          : prev,
                      )
                      setSelectedId(newId)
                      setActiveTool('select')
                      if (machineSeed) {
                        setPendingMachinePlacement(null)
                        pushToast({
                          kind: 'success',
                          message: 'Machine placed on the highlighted preview mark.',
                          ts: Date.now(),
                        })
                      }
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
