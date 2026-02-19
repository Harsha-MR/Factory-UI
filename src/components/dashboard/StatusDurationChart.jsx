import { useEffect, useRef, useState } from 'react'

function StatusDurationChart({ chartData }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Convert minutes to HH:MM:SS format
  const formatDuration = (minutes) => {
    const totalSeconds = Math.floor(minutes * 60)
    const hours = Math.floor(totalSeconds / 3600)
    const mins = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // Always show these 4 statuses
  const requiredStatuses = ['running', 'idle', 'off', 'breakdown']
  
  // Merge chartData with required statuses
  const getCompleteStatusData = () => {
    const statusMap = new Map()
    
    // Initialize all required statuses with 0 duration
    requiredStatuses.forEach(status => {
      statusMap.set(status.toLowerCase(), {
        status: status.toLowerCase(),
        status_name: status.charAt(0).toUpperCase() + status.slice(1),
        duration: 0,
        percent: 0
      })
    })
    
    // Update with actual data from chartData
    if (chartData && Array.isArray(chartData)) {
      chartData.forEach(item => {
        const status = item.status.toLowerCase()
        if (requiredStatuses.includes(status)) {
          statusMap.set(status, item)
        }
      })
    }
    
    return Array.from(statusMap.values())
  }
  
  const completeStatusData = getCompleteStatusData()

  // Status color mapping
  const getStatusColor = (status) => {
    const colorMap = {
      running: '#548237',
      idle: '#f7c030',
      off: '#b0b0b0',
      breakdown: '#dc2626',
      maintenance: '#8b5cf6',
      interlock: '#8b5cf6',
    }
    return colorMap[status.toLowerCase()] || '#9ca3af'
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    
    // Set canvas size to match container with max width (reduced for legend space)
    const size = Math.min(rect.width * 0.45, 120)
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    
    ctx.scale(dpr, dpr)

    const centerX = size / 2
    const centerY = size / 2
    const baseOuterRadius = size * 0.4
    const innerRadius = size * 0.25

    let startAngle = -Math.PI / 2

    // Draw segments only for statuses with non-zero percent
    completeStatusData.forEach((item, index) => {
      if (item.percent === 0) return // Skip zero-percent segments
      
      const angle = (item.percent / 100) * 2 * Math.PI
      const endAngle = startAngle + angle

      const isHovered = hoveredSegment === index
      // Add pop-up effect when hovered (increase radius by 8%)
      const outerRadius = isHovered ? baseOuterRadius * 1.08 : baseOuterRadius

      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true)
      ctx.closePath()

      ctx.fillStyle = getStatusColor(item.status)
      ctx.globalAlpha = isHovered ? 1 : 0.9
      ctx.fill()

      // Add stroke for better visibility
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = isHovered ? 3 : 2
      ctx.stroke()

      startAngle = endAngle
    })

    ctx.globalAlpha = 1
  }, [completeStatusData, hoveredSegment])

  const handleMouseMove = (e) => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const size = Math.min(containerRef.current.getBoundingClientRect().width * 0.45, 120)
    const centerX = size / 2
    const centerY = size / 2
    const outerRadius = size * 0.4 * 1.08 // Account for max hover expansion
    const innerRadius = size * 0.25

    const dx = x - centerX
    const dy = y - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)

    // Check if mouse is within the donut ring
    if (distance >= innerRadius && distance <= outerRadius) {
      let angle = Math.atan2(dy, dx)
      if (angle < 0) angle += 2 * Math.PI
      
      // Adjust for starting at top (-PI/2)
      angle = (angle + Math.PI / 2) % (2 * Math.PI)

      let currentAngle = 0
      for (let i = 0; i < completeStatusData.length; i++) {
        if (completeStatusData[i].percent === 0) continue // Skip zero segments
        
        const segmentAngle = (completeStatusData[i].percent / 100) * 2 * Math.PI
        if (angle >= currentAngle && angle < currentAngle + segmentAngle) {
          setHoveredSegment(i)
          
          // Calculate tooltip position with edge detection
          const containerRect = containerRef.current.getBoundingClientRect()
          let tooltipX = e.clientX - containerRect.left
          let tooltipY = e.clientY - containerRect.top

          // Adjust for tooltip width (approx 200px) and height (approx 80px)
          if (tooltipX + 200 > containerRect.width) {
            tooltipX = containerRect.width - 210
          }
          if (tooltipY + 80 > containerRect.height) {
            tooltipY = tooltipY - 90
          }

          setTooltipPos({ x: tooltipX + 10, y: tooltipY + 10 })
          return
        }
        currentAngle += segmentAngle
      }
    }

    setHoveredSegment(null)
  }

  const handleMouseLeave = () => {
    setHoveredSegment(null)
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-full overflow-hidden p-2">
      <div className="flex items-center gap-6">
        {/* Chart - Left Column */}
        <div className="flex-shrink-0">
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="cursor-pointer transition-transform duration-200"
          />
        </div>

        {/* Legend - Right Column with times */}
        <div className="flex-1 flex flex-col gap-2">
          {completeStatusData.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 cursor-pointer px-2 py-1 rounded hover:bg-slate-50 transition-colors"
              onMouseEnter={() => setHoveredSegment(index)}
              onMouseLeave={() => setHoveredSegment(null)}
            >
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: getStatusColor(item.status) }}
                />
                <span className="text-xs font-medium text-slate-700 capitalize whitespace-nowrap">
                  {item.status_name || item.status}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-900 tabular-nums">
                {formatDuration(item.duration)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredSegment !== null && completeStatusData[hoveredSegment] && completeStatusData[hoveredSegment].percent > 0 && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-lg"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className="text-xs font-semibold text-slate-900 capitalize">
            {completeStatusData[hoveredSegment].status_name || completeStatusData[hoveredSegment].status}
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Duration: {formatDuration(completeStatusData[hoveredSegment].duration)}
          </div>
          <div className="text-xs font-medium text-slate-900">
            {completeStatusData[hoveredSegment].percent.toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  )
}

export default StatusDurationChart
