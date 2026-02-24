import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getDepartmentLayout } from '../services/mockApi'
import { MachineDetailsModal } from '../components/dashboard'

function flattenMachinesFromDepartment(department) {
  const zones = department?.zones
  if (!Array.isArray(zones)) return []
  const list = []
  for (const z of zones) {
    for (const m of z?.machines || []) list.push(m)
  }
  return list
}

export default function MachineModalRoutePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { departmentId, machineId } = useParams()

  const stateMachine = location.state?.machine || null
  const stateContext = location.state?.context || null
  const stateFetchedAt = location.state?.fetchedAt || ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fallbackMachine, setFallbackMachine] = useState(null)
  const [fallbackFetchedAt, setFallbackFetchedAt] = useState('')

  useEffect(() => {
    if (stateMachine) return
    if (!departmentId || !machineId) return

    let cancelled = false

    ;(async () => {
      try {
        setError('')
        setLoading(true)
        const result = await getDepartmentLayout(departmentId)
        if (cancelled) return

        const all = flattenMachinesFromDepartment(result?.department)
        const found = all.find((m) => String(m?.id) === String(machineId)) || null
        setFallbackMachine(found)
        setFallbackFetchedAt(result?.meta?.fetchedAt || '')
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load machine')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [departmentId, machineId, stateMachine])

  const machine = stateMachine || fallbackMachine
  const fetchedAt = stateFetchedAt || fallbackFetchedAt

  const close = () => {
    // If this modal was opened from a page using backgroundLocation, go back.
    if (location.state?.backgroundLocation) {
      navigate(-1)
      return
    }
    // Direct URL entry: fall back to department page.
    navigate(`/departments/${departmentId}/layout-3d`)
  }

  const modalContext = useMemo(() => {
    if (stateContext) return stateContext
    return { department: `Department ${departmentId}`, plant: '' }
  }, [stateContext, departmentId])

  if (loading && !machine) {
    return (
      <MachineDetailsModal
        machine={{ id: machineId, name: `Machine ${machineId}`, status: 'RUNNING' }}
        context={modalContext}
        fetchedAt={fetchedAt}
        onClose={close}
      />
    )
  }

  if (error && !machine) {
    return (
      <MachineDetailsModal
        machine={{ id: machineId, name: `Machine ${machineId}`, status: 'DOWN' }}
        context={modalContext}
        fetchedAt={fetchedAt}
        onClose={close}
      />
    )
  }

  return (
    <MachineDetailsModal
      machine={machine}
      context={modalContext}
      fetchedAt={fetchedAt}
      onClose={close}
    />
  )
}
