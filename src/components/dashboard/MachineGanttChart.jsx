import { useEffect, useRef, useState } from 'react'

/**
 * MachineGanttChart - Displays machine status over time as a timeline/Gantt chart
 * 
 * @param {Array} overallStatus - Array of status objects from API response
 * @param {Array} shiftList - Array of shift timings to mark on the chart
 */
export default function MachineGanttChart({ overallStatus, shiftList }) {
  const containerRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 50 })
  const [zoom, setZoom] = useState(1) // 1 = full 24 hours, higher = zoomed in
  const [panOffset, setPanOffset] = useState(0) // Offset in seconds for panning
  const [mouseX, setMouseX] = useState(0) // Track mouse position for zoom center

  // Handle window resize
  useEffect(() => {
    if (!containerRef.current) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: 50,
        })
      }
    })

    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  if (!overallStatus || !Array.isArray(overallStatus) || overallStatus.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">No Gantt chart data available</p>
      </div>
    )
  }

  // Parse time string (HH:MM:SS) to seconds since midnight
  const parseTimeToSeconds = (timeStr) => {
    const [hours, minutes, seconds] = timeStr.split(':').map(Number)
    return hours * 3600 + minutes * 60 + seconds
  }

  // Get time range - full 24-hour cycle from first instance start time
  // If start is 6:00:00, end will be 5:59:59 (24 hours later)
  const getTimeRange = () => {
    // Find the earliest start time from data
    let minTime = Infinity

    overallStatus.forEach((item) => {
      if (item.fromTo) {
        const [startStr] = item.fromTo.split(' - ')
        const start = parseTimeToSeconds(startStr)
        minTime = Math.min(minTime, start)
      }
    })

    // Default to full day (00:00:00 to 23:59:59)
    if (minTime === Infinity) {
      return { start: 0, end: 86399 }
    }

    // End time is 24 hours minus 1 second from start (full day cycle)
    return { start: minTime, end: minTime + 86399 }
  }

  // Format seconds to HH:MM:SS
  const formatSecondsToTime = (seconds) => {
    const h = Math.floor(seconds / 3600) % 24
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const timeRange = getTimeRange()
  const totalDuration = timeRange.end - timeRange.start

  // Calculate visible time range based on zoom and pan
  const getVisibleTimeRange = () => {
    const visibleDuration = totalDuration / zoom
    let start = timeRange.start + panOffset
    let end = start + visibleDuration
    
    // Clamp to valid range
    if (start < timeRange.start) {
      start = timeRange.start
      end = start + visibleDuration
    }
    if (end > timeRange.end) {
      end = timeRange.end
      start = end - visibleDuration
    }
    
    return { start, end }
  }

  const visibleTimeRange = getVisibleTimeRange()
  const visibleDuration = visibleTimeRange.end - visibleTimeRange.start

  // Generate time markers based on zoom level
  const generateTimeMarkers = () => {
    const markers = []
    
    // Calculate appropriate interval based on zoom
    // Zoom 1 (24h) = 2 hour intervals (7200s)
    // Zoom 288 (max, 5min view) = 1 min intervals (60s)
    let interval = 7200 // 2 hours default
    
    if (zoom > 200) {
      interval = 60 // 1 minute
    } else if (zoom > 120) {
      interval = 120 // 2 minutes
    } else if (zoom > 80) {
      interval = 300 // 5 minutes
    } else if (zoom > 48) {
      interval = 600 // 10 minutes
    } else if (zoom > 24) {
      interval = 900 // 15 minutes
    } else if (zoom > 12) {
      interval = 1800 // 30 minutes
    } else if (zoom > 8) {
      interval = 3600 // 1 hour
    }
    
    // Always add start time at 0%
    markers.push({
      time: visibleTimeRange.start,
      position: 0,
      label: formatSecondsToTime(visibleTimeRange.start),
      isEdge: 'start',
    })
    
    // Add intermediate markers
    const startInterval = Math.ceil(visibleTimeRange.start / interval) * interval
    
    for (let time = startInterval; time < visibleTimeRange.end; time += interval) {
      if (time > visibleTimeRange.start) {
        const position = ((time - visibleTimeRange.start) / visibleDuration) * 100
        markers.push({
          time,
          position,
          label: formatSecondsToTime(time),
          isEdge: false,
        })
      }
    }
    
    // Always add end time at 100%
    markers.push({
      time: visibleTimeRange.end,
      position: 100,
      label: formatSecondsToTime(visibleTimeRange.end),
      isEdge: 'end',
    })
    
    // Filter out overlapping labels (keep labels at least 70px apart)
    // HH:MM:SS format is ~60-65px wide, so we need at least 70px spacing
    const minSpacing = 70 // pixels
    const filteredMarkers = [markers[0]] // Always keep start
    
    for (let i = 1; i < markers.length - 1; i++) {
      const lastKept = filteredMarkers[filteredMarkers.length - 1]
      const current = markers[i]
      
      // Calculate pixel distance (assuming container width)
      const pixelDist = Math.abs(current.position - lastKept.position) * (dimensions.width / 100)
      
      if (pixelDist >= minSpacing) {
        filteredMarkers.push(current)
      }
    }
    
    // Handle end marker - prioritize showing it
    if (markers.length > 1) {
      const lastMarker = markers[markers.length - 1]
      const lastKept = filteredMarkers[filteredMarkers.length - 1]
      
      // Calculate distance from end to last kept marker
      const pixelDist = Math.abs(lastMarker.position - lastKept.position) * (dimensions.width / 100)
      
      if (pixelDist >= minSpacing) {
        // Enough space, just add end marker
        filteredMarkers.push(lastMarker)
      } else if (filteredMarkers.length > 1) {
        // Not enough space: remove last intermediate marker to make room for end
        filteredMarkers.pop()
        filteredMarkers.push(lastMarker)
      } else {
        // Only start marker exists, check if we have space for end
        if (pixelDist >= minSpacing * 0.8) {
          // Allow slightly closer spacing if only start and end
          filteredMarkers.push(lastMarker)
        }
      }
    }
    
    return filteredMarkers
  }

  // Generate shift markers (skip the first shift)
  const generateShiftMarkers = () => {
    if (!shiftList || !Array.isArray(shiftList)) return []

    const markers = []
    const today = new Date()

    shiftList.forEach((shift, index) => {
      if (!shift.startTime) return
      if (index === 0) return // Skip the first shift

      const [h, m, s = 0] = shift.startTime.split(':').map(Number)
      const shiftStartSeconds = h * 3600 + m * 60 + s

      if (shiftStartSeconds >= visibleTimeRange.start && shiftStartSeconds <= visibleTimeRange.end) {
        const position = ((shiftStartSeconds - visibleTimeRange.start) / visibleDuration) * 100
        const shiftTime = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : ''
        markers.push({
          time: shiftStartSeconds,
          position,
          label: `${shift.shiftName || shift.name || 'Shift'}${shiftTime}`,
        })
      }
    })

    return markers
  }

  const timeMarkers = generateTimeMarkers()
  const shiftMarkers = generateShiftMarkers()

  // Handle mouse move for tooltip
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const relativeX = (x / rect.width) * 100
    setMouseX(x) // Track mouse position for zoom

    // Find which segment the mouse is over
    let found = false
    for (const item of overallStatus) {
      if (!item.fromTo) continue

      const [startStr, endStr] = item.fromTo.split(' - ')
      const start = parseTimeToSeconds(startStr)
      const end = parseTimeToSeconds(endStr)
      
      // Check if segment is in visible range
      if (end < visibleTimeRange.start || start > visibleTimeRange.end) continue

      const startPos = ((start - visibleTimeRange.start) / visibleDuration) * 100
      const endPos = ((end - visibleTimeRange.start) / visibleDuration) * 100

      if (relativeX >= startPos && relativeX <= endPos) {
        // Calculate tooltip position (avoid edges)
        let tooltipX = e.clientX
        const tooltipWidth = 200 // Approximate tooltip width
        
        if (tooltipX + tooltipWidth > window.innerWidth - 20) {
          tooltipX = window.innerWidth - tooltipWidth - 20
        }
        if (tooltipX < 20) {
          tooltipX = 20
        }

        setTooltip({
          x: tooltipX,
          y: e.clientY - 80,
          status: item.name || 'Unknown',
          fromTo: item.fromTo,
          duration: item.value && item.value[3] ? item.value[3] : '—',
          color: item.itemStyle?.normal?.color || '#9ca3af',
        })
        found = true
        // Set cursor style
        e.currentTarget.style.cursor = 'pointer'
        break
      }
    }

    if (!found) {
      setTooltip(null)
      // Set blocked cursor for unmapped areas
      e.currentTarget.style.cursor = 'not-allowed'
    }
  }

  const handleMouseLeave = (e) => {
    setTooltip(null)
    // Reset cursor
    e.currentTarget.style.cursor = 'default'
  }

  // Handle mouse wheel zoom
  const handleWheel = (e) => {
    e.preventDefault()
    
    const delta = -Math.sign(e.deltaY)
    const zoomFactor = 1.2
    
    // Calculate new zoom (max zoom = 288 for 5-minute view, min = 1 for full day)
    // 86400 seconds (24h) / 288 = 300 seconds (5 minutes)
    let newZoom = delta > 0 ? zoom * zoomFactor : zoom / zoomFactor
    newZoom = Math.max(1, Math.min(288, newZoom))
    
    if (newZoom === zoom) return // No change
    
    // Calculate mouse position in time (seconds)
    const rect = e.currentTarget.getBoundingClientRect()
    const mouseXRel = (mouseX / rect.width)
    const mouseTimeInVisible = visibleTimeRange.start + mouseXRel * visibleDuration
    
    // Calculate new visible duration
    const newVisibleDuration = totalDuration / newZoom
    
    // Calculate new pan offset to keep mouse position centered
    const newStart = mouseTimeInVisible - mouseXRel * newVisibleDuration
    const newPanOffset = Math.max(0, Math.min(totalDuration - newVisibleDuration, newStart - timeRange.start))
    
    setZoom(newZoom)
    setPanOffset(newPanOffset)
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold text-slate-700">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 7v10" />
          <path d="M12 7v10" />
          <path d="M16 7v10" />
        </svg>
        <span>Machine Status Timeline</span>
        
      </div>

      <div className="p-4" ref={containerRef}>
        {/* Gantt chart bar */}
        <div
          className="relative rounded-lg border bg-slate-100"
          style={{ height: '35px' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}          onWheel={handleWheel}        >
          {/* Shift markers - with higher z-index to appear above status bars */}
          {shiftMarkers.map((marker, idx) => (
            <div
              key={`shift-${idx}`}
              className="absolute top-0 bottom-0 w-px bg-red-500 z-10"
              style={{ left: `${marker.position}%` }}
              title={marker.label}
            >
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {marker.label}
              </div>
            </div>
          ))}

          {/* Status segments */}
          {overallStatus.map((item, idx) => {
            if (!item.fromTo) return null

            const [startStr, endStr] = item.fromTo.split(' - ')
            const start = parseTimeToSeconds(startStr)
            const end = parseTimeToSeconds(endStr)
            
            // Skip if segment is outside visible range
            if (end < visibleTimeRange.start || start > visibleTimeRange.end) return null
            
            // Clip segment to visible range
            const clippedStart = Math.max(start, visibleTimeRange.start)
            const clippedEnd = Math.min(end, visibleTimeRange.end)

            const startPos = ((clippedStart - visibleTimeRange.start) / visibleDuration) * 100
            const width = ((clippedEnd - clippedStart) / visibleDuration) * 100

            const color = item.itemStyle?.normal?.color || '#9ca3af'

            return (
              <div
                key={item._id || idx}
                className="absolute top-0 bottom-0 transition-opacity hover:opacity-80"
                style={{
                  left: `${startPos}%`,
                  width: `${width}%`,
                  backgroundColor: color,
                  cursor: 'pointer',
                }}
              />
            )
          })}        
        </div>

        {/* Time axis labels (below chart) */}
        <div className="relative mt-2" style={{ height: '20px' }}>
          {timeMarkers.map((marker, idx) => (
            <div
              key={idx}
              className="absolute text-xs text-slate-500"
              style={{
                left: `${marker.position}%`,
                transform: marker.isEdge === 'start' ? 'translateX(0)' : 
                          marker.isEdge === 'end' ? 'translateX(-100%)' : 
                          'translateX(-50%)',
              }}
            >
              {marker.label}
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-[60] rounded-lg border border-slate-300 bg-white p-3 shadow-xl"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            pointerEvents: 'none',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="h-3 w-3 rounded"
              style={{ backgroundColor: tooltip.color }}
            />
            <span className="font-semibold text-slate-900">{tooltip.status}</span>
          </div>
          <div className="space-y-1 text-xs text-slate-600">
            <div>
              <span className="font-medium">Time: </span>
              <span>{tooltip.fromTo}</span>
            </div>
            <div>
              <span className="font-medium">Duration: </span>
              <span className="font-semibold text-slate-900">{tooltip.duration}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
