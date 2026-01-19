import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDepartmentLayout, getDepartmentsByPlant } from '../services/mockApi'

import DepartmentFloorLayoutViewer from '../components/layout/DepartmentFloorLayoutViewer'
import DepartmentFloorLayoutEditor from '../components/layout/DepartmentFloorLayoutEditor'
import { createDefaultLayoutForDepartment } from '../components/layout/defaultLayout'
import {
  deleteDepartmentCustomLayout,
  saveDepartmentCustomLayout,
} from '../services/layoutStorage'

function deptBadge(severity) {
  if (severity === 'CRITICAL') return { cls: 'bg-red-100 text-red-700', text: 'CRITICAL' }
  if (severity === 'ACTION_REQUIRED') return { cls: 'bg-yellow-100 text-yellow-800', text: 'ATTENTION' }
  return { cls: 'bg-emerald-100 text-emerald-700', text: 'OK' }
}

export default function DepartmentLayoutPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId } = useParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deptResult, setDeptResult] = useState(null)
  const [editingLayout, setEditingLayout] = useState(false)
  const [editorSeedLayout, setEditorSeedLayout] = useState(null)

  const [autoRotateEnabled, setAutoRotateEnabled] = useState(false)
  const [autoRotateSeconds, setAutoRotateSeconds] = useState(10)
  const [plantDepartments, setPlantDepartments] = useState([])

  const plantName = location.state?.plantName || ''

  const allMachines = useMemo(() => {
    const zones = deptResult?.department?.zones
    if (!Array.isArray(zones)) return []
    const list = []
    for (const z of zones) {
      for (const m of z?.machines || []) list.push(m)
    }
    return list
  }, [deptResult])

  const allMachinesCounts = useMemo(() => {
    const counts = { RUNNING: 0, IDLE: 0, DOWN: 0 }
    for (const m of allMachines) {
      if (m?.status === 'RUNNING') counts.RUNNING++
      else if (m?.status === 'IDLE') counts.IDLE++
      else if (m?.status === 'DOWN') counts.DOWN++
    }
    return counts
  }, [allMachines])

  const effectiveLayout = useMemo(() => {
    const dept = deptResult?.department
    if (!dept) return null
    return deptResult?.customLayout || createDefaultLayoutForDepartment(dept)
  }, [deptResult])

  useEffect(() => {
    if (!departmentId) return
    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const result = await getDepartmentLayout(departmentId)
        if (!cancelled) setDeptResult(result)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load department layout')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId])

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!departmentId) return
    if (editingLayout) return
    let cancelled = false

    const intervalId = setInterval(async () => {
      try {
        const result = await getDepartmentLayout(departmentId)
        if (!cancelled) setDeptResult(result)
      } catch {
        // keep last known data
      }
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [departmentId, editingLayout])

  useEffect(() => {
    const plantId = deptResult?.plant?.id
    if (!autoRotateEnabled || !plantId) return

    let cancelled = false

    ;(async () => {
      try {
        const depts = await getDepartmentsByPlant(String(plantId))
        if (!cancelled) setPlantDepartments(Array.isArray(depts) ? depts : [])
      } catch {
        if (!cancelled) setPlantDepartments([])
      }
    })()

    return () => {
      cancelled = true
    }
  }, [autoRotateEnabled, deptResult?.plant?.id])

  useEffect(() => {
    if (!autoRotateEnabled) return
    if (editingLayout) return
    if (!deptResult?.plant?.id) return
    if (!Array.isArray(plantDepartments) || plantDepartments.length < 2) return

    const currentId = String(departmentId)
    const idx = plantDepartments.findIndex((d) => String(d?.id) === currentId)
    const next = plantDepartments[(idx >= 0 ? idx + 1 : 0) % plantDepartments.length]
    if (!next?.id) return

    const seconds = Math.max(1, Number(autoRotateSeconds) || 10)
    const timer = setTimeout(() => {
      navigate(`/departments/${next.id}`, {
        state: {
          ...(location.state || {}),
          fromDashboard: location.state?.fromDashboard || true,
          plantName: deptResult?.plant?.name || plantName || '',
        },
      })
    }, seconds * 1000)

    return () => clearTimeout(timer)
  }, [
    autoRotateEnabled,
    autoRotateSeconds,
    editingLayout,
    plantDepartments,
    departmentId,
    navigate,
    location.state,
    deptResult?.plant?.id,
    deptResult?.plant?.name,
    plantName,
  ])

  const layoutCtx = useMemo(() => {
    return {
      factoryId: deptResult?.factory?.id || '',
      plantId: deptResult?.plant?.id || '',
      departmentId: departmentId || '',
    }
  }, [deptResult, departmentId])

  const onStartCustomizeLayout = () => {
    setAutoRotateEnabled(false)
    const base = deptResult?.customLayout || createDefaultLayoutForDepartment(deptResult?.department)
    setEditorSeedLayout(base)
    setEditingLayout(true)
  }

  const onCancelCustomizeLayout = () => {
    setEditingLayout(false)
    setEditorSeedLayout(null)
  }

  const onSaveCustomizeLayout = (layout) => {
    saveDepartmentCustomLayout(layoutCtx, layout)
    setDeptResult((prev) => (prev ? { ...prev, customLayout: layout } : prev))
    setEditingLayout(false)
    setEditorSeedLayout(null)
  }

  const onResetCustomizeLayout = () => {
    deleteDepartmentCustomLayout(layoutCtx)
    setDeptResult((prev) => (prev ? { ...prev, customLayout: null } : prev))
    setEditingLayout(false)
    setEditorSeedLayout(null)
  }

  const onBack = () => {
    if (location.state?.fromDashboard) {
      navigate(-1)
      return
    }
    navigate('/dashboard?factoryId=f1&plantId=p1&show=1')
  }

  const onOpenMachine = (m) => {
    if (!m?.id) return
    navigate(`/departments/${departmentId}/machines/${m.id}`,
      {
        state: {
          backgroundLocation: location,
          machine: m,
          context: { department: deptResult?.department?.name || `Department ${departmentId}`, plant: plantName },
          fetchedAt: deptResult?.meta?.fetchedAt || location.state?.departmentsFetchedAt || '',
        },
      },
    )
  }

  if (loading && !deptResult) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Department</h1>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
        <div className="rounded border bg-white p-4 text-sm text-slate-600">Loading...</div>
      </div>
    )
  }

  if (error && !deptResult) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Department</h1>
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  if (!deptResult) return null

  const { cls: badgeCls, text: badgeText } = deptBadge(deptResult?.summary?.severity || 'OK')

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold text-slate-900">{deptResult.department.name}</div>
            <div className="mt-1 text-sm text-slate-500">ID: {deptResult.department.id}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden text-sm font-medium text-slate-600 sm:block">
              <span className="text-slate-500">Active:</span> {allMachinesCounts.RUNNING} / {allMachines.length} machines
            </div>

            <button
              type="button"
              className="rounded-lg border px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={onBack}
            >
              Back
            </button>

            <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${badgeCls}`}>
              <span className="inline-block h-2 w-2 rounded-full bg-current opacity-60" />
              <span>{badgeText}</span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-slate-900">Department floor layout</div>
              <div className="text-xs text-slate-500">
                Use mouse wheel to zoom. Hover icons for details. Click a machine icon to open details.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!editingLayout ? (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={autoRotateEnabled}
                      onChange={(e) => setAutoRotateEnabled(e.target.checked)}
                    />
                    Auto-scroll
                  </label>
                  <select
                    className="rounded-lg border px-2.5 py-1 text-xs text-slate-700"
                    value={String(autoRotateSeconds)}
                    disabled={!autoRotateEnabled}
                    onChange={(e) => setAutoRotateSeconds(Number(e.target.value))}
                    title="Auto-scroll between departments"
                  >
                    <option value="5">5s</option>
                    <option value="10">10s</option>
                    <option value="15">15s</option>
                    <option value="20">20s</option>
                  </select>

                  <button
                    type="button"
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={onStartCustomizeLayout}
                  >
                    {deptResult?.customLayout ? 'Edit layout' : 'Customize layout'}
                  </button>
                  {deptResult?.customLayout ? (
                    <button
                      type="button"
                      className="rounded-lg border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      onClick={onResetCustomizeLayout}
                    >
                      Reset
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            {editingLayout ? (
              <DepartmentFloorLayoutEditor
                department={deptResult.department}
                initialLayout={editorSeedLayout}
                onCancel={onCancelCustomizeLayout}
                onSave={onSaveCustomizeLayout}
                onReset={onResetCustomizeLayout}
              />
            ) : (
              <DepartmentFloorLayoutViewer
                layout={effectiveLayout}
                department={deptResult?.department}
                onMachineClick={onOpenMachine}
              />
            )}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Auto-refresh is enabled (updates every 5 seconds){editingLayout ? ' — paused while editing layout.' : '.'}
          </div>
        </div>
      </div>
    </div>
  )
}
