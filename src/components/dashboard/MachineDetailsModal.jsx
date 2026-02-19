import { useEffect, useMemo, useState } from 'react'
import { clampPct, formatRelativeTime, formatTimestamp } from './utils'
import HourlyPartCountChart from './HourlyPartCountChart'
import StatusDurationChart from './StatusDurationChart'
import MachineGanttChart from './MachineGanttChart'
import { fetchHourlyPartCount, getLastNDates } from '../../services/partCountApi'
import { fetchMachineDetails } from '../../services/clientApi'

function clamp01(n) {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

function computeMachineKpis(machine) {
  // If machine has pre-calculated OEE metrics from API, use them directly
  if (machine?.oeeMetrics) {
    const metrics = machine.oeeMetrics
    const prod = machine?.productionMetrics || {}
    
    return {
      availabilityPct: clampPct(metrics.availability),
      performancePct: clampPct(metrics.performance),
      qualityPct: clampPct(metrics.quality),
      oeePct: clampPct(metrics.oee),
      totalParts: Number(prod.totalPartsProduced ?? 0),
      goodParts: Number(prod.goodParts ?? 0),
    }
  }
  
  // Otherwise, calculate from time and production metrics
  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}

  const planned = Number(time.plannedProductionTime ?? 0)
  const runtime = Number(time.runTime ?? 0)
  const idealCycleTime = Number(prod.idealCycleTime ?? 0)
  const totalParts = Number(prod.totalPartsProduced ?? 0)
  const goodParts = Number(prod.goodParts ?? 0)

  const availability = planned > 0 ? runtime / planned : 0
  const performance = runtime > 0 ? (idealCycleTime * totalParts) / runtime : 0
  const quality = totalParts > 0 ? goodParts / totalParts : 0
  const oee = clamp01(availability) * clamp01(performance) * clamp01(quality)

  return {
    availabilityPct: clampPct(availability * 100),
    performancePct: clampPct(performance * 100),
    qualityPct: clampPct(quality * 100),
    oeePct: clampPct(oee * 100),
    totalParts,
    goodParts,
  }
}

function formatDuration(seconds) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s < 0) return '—'
  const totalMin = Math.floor(s / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60

  if (h <= 0) return `${m}m`
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function statusBadge(status) {
  if (status === 'DOWN') return { cls: 'bg-red-600 text-white', label: 'DOWN' }
  if (status === 'IDLE') return { cls: 'bg-yellow-500 text-white', label: 'IDLE' }
  if (status === 'RUNNING') return { cls: 'bg-emerald-600 text-white', label: 'RUNNING' }
  if (status === 'MAINTENANCE') return { cls: 'bg-blue-500 text-white', label: 'INTERLOCK' }
  if (status === 'OFFLINE') return { cls: 'bg-gray-500 text-white', label: 'OFF' }
  return { cls: 'bg-slate-600 text-white', label: status || 'UNKNOWN' }
}

function DonutGauge({ valuePct }) {
  const size = 90
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = clampPct(valuePct)
  const dash = (v / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id="mdm_oee" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#mdm_oee)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

export default function MachineDetailsModal({ machine, context, fetchedAt, onClose }) {
  const [hourlyData, setHourlyData] = useState(null)
  const [loadingHourlyData, setLoadingHourlyData] = useState(false)
  const [fullMachineData, setFullMachineData] = useState(null)
  const [loadingMachineData, setLoadingMachineData] = useState(false)
  const [ganttData, setGanttData] = useState(null)
  const [loadingGanttData, setLoadingGanttData] = useState(false)
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date().toISOString())
  const [, setTick] = useState(0) // Force re-render for live time updates

  // Debug: Log machine and context objects
  useEffect(() => {
    console.log('🔍 Machine object:', machine)
    console.log('🔍 Context object:', context)
  }, [machine, context])

  // Update "Status Since" display every 5 seconds
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setTick(prev => prev + 1)
  //   }, 5000) // Update every 5 seconds

  //   return () => clearInterval(interval)
  // }, [])

  // Fetch full machine details including Shift_List
  useEffect(() => {
    const deviceID = machine?.deviceId || machine?.deviceName || machine?.id
    const custID = context?.customerId || context?.customer?.id || 'GPBUM'
    
    if (!deviceID || !custID) {
      console.log('⚠️ Missing deviceID or custID for machine details')
      return
    }
    
    let cancelled = false
    
    ;(async () => {
      try {
        setLoadingMachineData(true)
        console.log('🔍 Fetching full machine details:', { custID, deviceID })
        const data = await fetchMachineDetails(custID, deviceID)
        
        if (!cancelled) {
          console.log('✅ Full machine data loaded:', data)
          setFullMachineData(data)
        }
      } catch (error) {
        console.error('❌ Failed to fetch machine details:', error)
      } finally {
        if (!cancelled) {
          setLoadingMachineData(false)
        }
      }
    })()
    
    return () => {
      cancelled = true
    }
  }, [machine?.deviceId, machine?.deviceName, machine?.id, context?.customerId, context?.customer?.id])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // Fetch hourly part count data
  useEffect(() => {
    const deviceID = machine?.deviceId || machine?.deviceName || machine?.id
    const custID = context?.customerId || context?.customer?.id || 'GPBUM'
    
    console.log('🔍 Extracted for hourly data:', { deviceID, custID, machineId: machine?.id, machineName: machine?.name })
    console.log('🔍 Full machine object:', machine)
    console.log('🔍 Full context object:', context)
    
    if (!deviceID) {
      console.log('⚠️ No deviceID found for hourly part count')
      console.log('⚠️ Available machine properties:', Object.keys(machine || {}))
      return
    }
    
    if (!custID || custID === 'GPBUM') {
      console.log('⚠️ Using fallback custID: GPBUM')
    }
    
    let cancelled = false
    
    ;(async () => {
      try {
        setLoadingHourlyData(true)
        const dates = getLastNDates(3)
        console.log('🔍 Fetching hourly data for:', { custID, deviceID, dates })
        const data = await fetchHourlyPartCount(custID, deviceID, dates)
        
        if (!cancelled) {
          console.log('✅ Hourly data loaded:', data)
          console.log('✅ Has partcountDetails?', !!data?.partcountDetails)
          console.log('✅ Hour array:', data?.partcountDetails?.hour)
          console.log('✅ Partcount array:', data?.partcountDetails?.partcount)
          setHourlyData(data)
        }
      } catch (error) {
        console.error('❌ Failed to fetch hourly part count:', error)
        console.error('❌ Error details:', error.response?.data || error.message)
        // Silently fail - chart is optional enhancement
      } finally {
        if (!cancelled) {
          setLoadingHourlyData(false)
        }
      }
    })()
    
    return () => {
      cancelled = true
    }
  }, [machine?.deviceId, machine?.deviceName, machine?.id, context?.customerId, context?.customer?.id])

  // Fetch gantt chart data for status duration
  useEffect(() => {
    const deviceID = machine?.deviceId || machine?.deviceName || machine?.id
    const custID = context?.customerId || context?.customer?.id || 'GUK7F'
    
    if (!deviceID || !custID) {
      console.log('⚠️ Missing deviceID or custID for gantt chart')
      return
    }
    
    let cancelled = false
    
    ;(async () => {
      try {
        setLoadingGanttData(true)
        const response = await fetch(import.meta.env.VITE_GANTT_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-functions-key': import.meta.env.VITE_GANTT_API_KEY
          },
          body: JSON.stringify({ custID, deviceID })
        })
        
        if (!response.ok) throw new Error('Failed to fetch gantt chart data')
        
        const data = await response.json()
        
        if (!cancelled) {
          console.log('✅ Gantt chart data loaded:', data)
          console.log('✅ Has overall_status?', !!data?.overall_status)
          console.log('✅ overall_status length:', data?.overall_status?.length)
          setGanttData(data)
        }
      } catch (error) {
        console.error('❌ Failed to fetch gantt chart data:', error)
      } finally {
        if (!cancelled) {
          setLoadingGanttData(false)
        }
      }
    })()
    
    return () => {
      cancelled = true
    }
  }, [machine?.deviceId, machine?.deviceName, machine?.id, context?.customerId, context?.customer?.id])

  // Auto-refresh all data every 60 seconds to keep modal showing live data
  useEffect(() => {
    const deviceID = machine?.deviceId || machine?.deviceName || machine?.id
    const custID = context?.customerId || context?.customer?.id || 'GPBUM'
    
    if (!deviceID || !custID) {
      return
    }

    const refreshAllData = async () => {
      try {
        console.log('🔄 Auto-refreshing machine modal data...')
        
        // Refresh full machine details
        const machineData = await fetchMachineDetails(custID, deviceID)
        setFullMachineData(machineData)
        
        // Refresh hourly part count
        const dates = getLastNDates(3)
        const hourlyDataResult = await fetchHourlyPartCount(custID, deviceID, dates)
        setHourlyData(hourlyDataResult)
        
        // Refresh gantt chart
        const ganttResponse = await fetch(import.meta.env.VITE_GANTT_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-functions-key': import.meta.env.VITE_GANTT_API_KEY
          },
          body: JSON.stringify({ custID, deviceID })
        })
        
        if (ganttResponse.ok) {
          const ganttDataResult = await ganttResponse.json()
          console.log('✅ Auto-refresh gantt data:', ganttDataResult)
          console.log('✅ Has overall_status?', !!ganttDataResult?.overall_status)
          setGanttData(ganttDataResult)
        }
        
        // Update refresh timestamp
        setLastRefreshTime(new Date().toISOString())
        
        console.log('✅ Auto-refresh completed')
      } catch (error) {
        console.error('❌ Auto-refresh failed:', error)
        // Silently fail for auto-refresh
      }
    }

    // Set up interval for 60-second refresh
    const intervalId = setInterval(refreshAllData, 60000) // 60 seconds

    return () => clearInterval(intervalId)
  }, [machine?.deviceId, machine?.deviceName, machine?.id, context?.customerId, context?.customer?.id])

  const name = machine?.name || machine?.id || 'Machine'
  const machineId = machine?.id || '—'
  const status = machine?.status || 'UNKNOWN'
  const { cls: statusCls, label: statusLabel } = statusBadge(status)

  const time = machine?.timeMetrics || {}
  const prod = machine?.productionMetrics || {}
  const shift = machine?.shiftInfo || {}

  // Use the most recent update time from either machine data, full machine data, or last refresh
  const updatedAtIso = fullMachineData?.updatedAt || lastRefreshTime || fetchedAt || machine?.updatedAt
  const updatedAtText = formatRelativeTime(updatedAtIso)
  const updatedAtFull = formatTimestamp(updatedAtIso)

  const kpis = useMemo(() => computeMachineKpis(machine), [machine])

  const plannedSec = Number(time.plannedProductionTime ?? NaN)
  const runSec = Number(time.runTime ?? 0)
  const idleSec = Number(time.idleTime ?? 0)
  const breakdownSec = Number(time.breakdownTime ?? 0)
  const offSec = Number(time.offTime ?? 0)

  const plannedSafe = Number.isFinite(plannedSec) && plannedSec > 0 ? plannedSec : null
  const denom = plannedSafe || Math.max(1, runSec + idleSec + breakdownSec + offSec)

  const seg = {
    run: clampPct((runSec / denom) * 100),
    idle: clampPct((idleSec / denom) * 100),
    breakdown: clampPct((breakdownSec / denom) * 100),
    off: clampPct((offSec / denom) * 100),
  }

  // Use hourly data part count if available, otherwise fall back to production metrics
  const totalParts = hourlyData?.partcount ? Number(hourlyData.partcount) : Number(prod.totalPartsProduced ?? 0)
  const goodParts = Number(prod.goodParts ?? totalParts)
  const rejectedParts = Number(prod.rejectedParts ?? Math.max(0, totalParts - goodParts))
  const rejectedPct = totalParts > 0 ? (rejectedParts / totalParts) * 100 : 0

  // Find current shift from Shift_List based on current time
  const shiftList = fullMachineData?.Shift_List || fullMachineData?.shiftList || machine?.Shift_List || machine?.shiftList || []
  let currentShift = null
  console.log('🔍 Shift_List:', shiftList)
  console.log('🔍 Full machine data:', fullMachineData)
  if (Array.isArray(shiftList) && shiftList.length > 0) {
    const now = new Date()
    console.log('🕐 Current time:', now.toLocaleTimeString())
    for (const shift of shiftList) {
      if (!shift.startTime || !shift.endTime) continue
      // Parse times (format: HH:MM:SS or HH:MM)
      const startParts = shift.startTime.split(':').map(Number)
      const endParts = shift.endTime.split(':').map(Number)
      const startHour = startParts[0]
      const startMin = startParts[1]
      const endHour = endParts[0]
      const endMin = endParts[1]
      
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMin, 0)
      let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endHour, endMin, 0)
      
      // Handle overnight shift using endNextDayFlag
      if (shift.endNextDayFlag === true) {
        end.setDate(end.getDate() + 1)
      }
      
      console.log(`🔍 Checking ${shift.shiftName}: ${start.toLocaleTimeString()} - ${end.toLocaleTimeString()}, Match: ${now >= start && now < end}`)
      
      if (now >= start && now < end) {
        currentShift = shift
        console.log('✅ Current shift found:', currentShift)
        break
      }
    }
  }
  if (!currentShift) {
    console.log('⚠️ No matching shift found for current time')
  }


  if (!machine) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 "
        aria-label="Close"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-auto flex h-[calc(100vh-2rem)] w-[calc(100%-1.5rem)] max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:h-[95vh]"
      >
        <div className="flex items-start justify-between gap-4 border-b p-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {name} <span className="text-slate-400">|</span>{' '}
              {/* <span className="text-sm font-medium text-slate-500">ID: {machineId}</span> */}
              <span className="text-sm font-medium text-slate-600">{context?.department || 'Department'}</span>
              {context?.plant ? (
                <>
                  <span className="text-slate-400">&nbsp;&nbsp;</span>
                  <span className="text-sm font-medium text-slate-600">{context.plant}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* <button
              type="button"
              className="rounded-md border bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Notifications"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button> */}
            {/* <button
              type="button"
              className="rounded-md border bg-white p-2 text-slate-500 hover:bg-slate-50"
              aria-label="Mute"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 9v6" />
                <path d="M21 9v6" />
                <path d="M4 9h4l5-4v14l-5-4H4z" />
              </svg>
            </button> */}
            <button
              type="button"
              className="rounded-md border bg-red-600 p-2 text-white hover:bg-red-300 hover:text-black"
              aria-label="Close"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 lg:p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
            {/* LEFT COLUMN */}
            <div className="flex flex-col gap-3 lg:gap-2">
              {/* Current Status */}
              <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z" />
                    <path d="M19.4 15a7.96 7.96 0 0 0 .1-1 7.96 7.96 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l-.4-2.6H9.1L8.7 7a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0-.1 1c0 .34.03.67.1 1l-2 1.5 2 3.5 2.4-1c.52.4 1.09.74 1.7 1l.4 2.6h5.8l.4-2.6c.61-.26 1.18-.6 1.7-1l2.4 1 2-3.5-2-1.5Z" />
                  </svg>
                  <span>Current Status</span>

                  <div className="ml-auto flex items-center gap-2">
                    <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-xs font-semibold ${statusCls}`}>
                      <span className="inline-block h-2 w-2 rounded-full bg-white/80 animate-blink-strong" />
                      <span>{statusLabel}</span>
                    </div>
                    {status === 'DOWN' ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1 text-xs font-semibold text-white"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 9v4" />
                          <path d="M12 17h.01" />
                          <path d="M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
                        </svg>
                        HERE
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="p-3">
                  <div className="rounded-lg border bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <div>
                      <span className="mt-0.5 text-slate font-semibold">Status Since : </span>
                      <span className="mt-0.5">{updatedAtText}</span>
                    </div>
                   

                    {currentShift && (
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded bg-blue-100 px-2 py-1 font-semibold text-blue-700">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M8 2v4" />
                            <path d="M16 2v4" />
                            <rect width="18" height="18" x="3" y="4" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                          Shift: {currentShift.shiftName || currentShift.name || '—'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 font-medium text-slate-700">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 6v6l4 2" />
                          </svg>
                          {currentShift.startTime} - {currentShift.endTime}
                        </span>
                      </div>
                    )}

                    {/* <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-slate-500">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">{shift?.shiftId ? 'Shift' : '—'}</div>
                            <div className="font-semibold text-slate-900">{shift?.shiftId || '—'}</div>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 text-slate-500">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                              <path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0Z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Operator</div>
                            <div className="font-semibold text-slate-900">{shift?.operatorName || '—'}</div>
                          </div>
                        </div>
                    </div> */}
                  </div>
                </div>
              </div>

              {/* Time Breakdown */}
              {/* <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 8v4l3 3" />
                    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span>Time Breakdown</span>
                </div>

                <div className="p-3">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="flex h-full w-full">
                      <div className="h-full bg-sky-500" style={{ width: `${seg.run}%` }} />
                      <div className="h-full bg-amber-400" style={{ width: `${seg.idle}%` }} />
                      <div className="h-full bg-indigo-600" style={{ width: `${seg.breakdown}%` }} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
                      <span className="text-slate-600">Run Time:</span>
                      <span className="ml-auto font-semibold text-slate-900">{formatDuration(runSec)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="text-slate-600">Idle Time:</span>
                      <span className="ml-auto font-semibold text-red-600">{formatDuration(idleSec)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                      <span className="text-slate-600">Breakdown Time:</span>
                      <span className="ml-auto font-semibold text-slate-900">{formatDuration(breakdownSec)}</span>
                    </div>
                  </div>

                  {plannedSafe ? (
                    <div className="mt-2 text-xs text-slate-500">Planned: {formatDuration(plannedSafe)}</div>
                  ) : null}
                </div>
              </div> */}

              {/* Hourly Part Count Chart */}
              {hourlyData && hourlyData.partcountDetails ? (
                <div className="rounded-xl border bg-white" style={{ minHeight: '290px' }}>
                  <HourlyPartCountChart
                    hours={hourlyData.partcountDetails.hour || []}
                    partCounts={hourlyData.partcountDetails.partcount || []}
                    totalParts={hourlyData.partcount || 0}
                  />
                </div>
              ) : loadingHourlyData ? (
                <div className="rounded-xl border bg-white p-8">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading hourly data...</span>
                  </div>
                </div>
              ) : hourlyData ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-800">Chart data structure unexpected. Check console for details.</p>
                  <p className="text-xs text-amber-600 mt-1">Data received but missing partcountDetails.</p>
                </div>
              ) : null}
            </div>

            

            {/* RIGHT COLUMN */}
            <div className="flex flex-col gap-3 lg:gap-2">
              {/* OEE */}
              <div className="rounded-xl border bg-white h-43">
                <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5 text-sm font-semibold text-slate-700">
                  <span>OEE</span>
                  <div className="text-xs text-slate-500">Updated: {updatedAtFull}</div>
                </div>

                <div className="grid grid-cols-2 gap-4 p-2">
                  <div>
                    {/* <div className="text-2xl font-semibold text-orange-700">{kpis.oeePct.toFixed(1)}%</div> */}
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                        <span className="text-slate-600">Availability</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.availabilityPct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                        <span className="text-slate-600">Performance</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.performancePct.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        <span className="text-slate-600">Quality</span>
                        <span className="ml-auto font-semibold text-slate-900">{kpis.qualityPct.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 6v6l4 2" />
                        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <span>{formatDuration(time?.breakdownTime ?? null)}</span>
                    </div> */}
                  </div>

                  <div className="flex items-center justify-center">
                    <div className="relative">
                      <DonutGauge valuePct={kpis.oeePct} />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="text-lg font-semibold text-slate-900">{kpis.oeePct.toFixed(1)}%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Machine Power Metrics */}

              {fullMachineData?.total_energy !== undefined || fullMachineData?.powerUnitCost !== undefined ? (
                <div className="rounded-xl border bg-white">
                  <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" />
                    </svg>
                    <span>Machine Power Metrics</span>
                  </div>

                  <div className="p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 text-yellow-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        <span className="text-slate-600">Total Energy:</span>
                        <span className="font-semibold text-slate-900">
                          {fullMachineData?.total_energy !== undefined 
                            ? `${Number(fullMachineData.total_energy).toFixed(2)} kWh` 
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg
                          className="h-4 w-4 text-orange-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <span className="text-slate-600">Energy Cost:</span>
                        <span className="font-semibold text-slate-900">
                          {fullMachineData?.powerUnitCost !== undefined 
                            ? `₹${Number(fullMachineData.powerUnitCost).toFixed(2)}` 
                            : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : loadingMachineData ? (
                <div className="rounded-xl border bg-white p-8">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading power data...</span>
                  </div>
                </div>
              ) : null}

              {/* Status Duration Chart */}
              {ganttData && ganttData.chart_data ? (
                <div className="rounded-xl border bg-white " style={{ minHeight: '200px' }}>
                  <div className="flex items-center gap-2 border-b px-4 py-2 text-sm font-semibold text-slate-700">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 8v4l3 3" />
                      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>Status Duration</span>
                  </div>

                  <StatusDurationChart chartData={ganttData.chart_data} />
                </div>
              ) : loadingGanttData ? (
                <div className="rounded-xl border bg-white p-8">
                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Loading status data...</span>
                  </div>
                </div>
              ) : null}

              {/* Breakdown */}
              {/* <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span>Breakdown</span>
                  <span className="ml-2 font-medium text-slate-500">{machine?.breakdown?.code || machine?.breakdownCode || '—'}</span>
                </div>

                <div className="space-y-2 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Reason Code:</span>
                    <span className="text-slate-700">{machine?.breakdown?.reason || machine?.breakdownReason || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Duration:</span>
                    <span className="font-semibold text-red-600">{formatDuration(breakdownSec)}</span>
                  </div>
                </div>
              </div> */}

              {/* Upcoming Maintenance */}
              {/* <div className="rounded-xl border bg-white">
                <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-slate-700">
                  <span>Upcoming Maintenance</span>
                </div>

                <div className="p-4 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Last Maintenance:</span>
                    <span>{machine?.maintenance?.lastAt ? formatTimestamp(machine.maintenance.lastAt) : '—'}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-slate-500">Next Maintenance:</span>
                    <span>{machine?.maintenance?.nextAt ? formatTimestamp(machine.maintenance.nextAt) : '—'}</span>
                  </div>
                </div>
              </div> */}
            </div>
          </div>

          {/* GANTT CHART - Full Width */}
          {ganttData && ganttData.overall_status && ganttData.overall_status.length > 0 ? (
            <div className="mt-3 lg:mt-2">
              <MachineGanttChart 
                overallStatus={ganttData.overall_status} 
                shiftList={shiftList}
              />
            </div>
          ) : loadingGanttData ? (
            <div className="mt-3 rounded-xl border bg-white p-8 lg:mt-4">
              <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading timeline...</span>
              </div>
            </div>
          ) : ganttData ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 lg:mt-4">
              <p className="text-sm text-amber-800">Timeline data is not available. Check console for API response.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
