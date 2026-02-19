import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

/**
 * Custom Tooltip to show hour range and part count
 */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0]
  // Calculate hour range for tooltip
  const hourRaw = data.payload.hour
  let startHour = 0, endHour = 0
  let hourLabel = ''

  // Handle numeric and string hour
  if (typeof hourRaw === 'number') {
    endHour = hourRaw
    startHour = hourRaw === 0 ? 23 : endHour - 1
  } else if (typeof hourRaw === 'string') {
    // If hour is string like '07:00', parse hour
    const h = parseInt(hourRaw, 10)
    endHour = h
    startHour = h === 0 ? 23 : h - 1
  }

  // Format as HH:00 - HH:00
  const pad = (n) => String(n).padStart(2, '0')
  hourLabel = `${pad(startHour)}:00 - ${pad(endHour)}:00`

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3 shadow-lg">
      <p className="text-xs font-bold text-slate-700"> 
        Time: {hourLabel}</p>
      <p className="mt-1 text-sm font-bold text-blue-600">
        Total Parts: {data.value} {data.value === 1 ? 'part' : 'parts'}
      </p>
    </div>
  )
}


export default function HourlyPartCountChart({ hours, partCounts, totalParts }) {
  // Transform data for recharts
  const chartData = hours.map((hour, index) => ({
    hour,
    parts: partCounts[index] || 0
  }))

  // Custom tick formatter to show hours in a readable format
  const formatXAxis = (value) => {
    return value // Already in HH:00 format
  }

  return (
    <div className="rounded-xl bg-white ">
      <div className="flex items-center justify-between gap-2 border-b py-2.5 px-4 text-sm font-semibold text-slate-700">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span>Hourly Part Count</span>
        </div>
        <div className="rounded-md bg-blue-50 px-3 py-1">
          <span className="text-xs text-slate-600">Total Parts: </span>
          <span className="text-sm font-bold text-blue-600">{totalParts}</span>
        </div>
      </div>

      <div style={{ height: '230px' }}>
        <ResponsiveContainer width="100%" height="100%" >
          <BarChart
            data={chartData}
            margin={{ top: 15, right: 0, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={formatXAxis}
              angle={0}
              textAnchor="end"
              height={40}
              stroke="#cbd5e1"
              label={{
                value: 'Time',
                position: 'insideBottom',
                offset: 8,
                style: { fontSize: 13, fill: '#64748b', fontWeight: 500 },
              }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              stroke="#cbd5e1"
              label={{
                value: 'Part Count',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 13, fill: '#64748b', fontWeight: 500 },
                offset: 23,
              }}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
              wrapperStyle={{ outline: 'none', zIndex: 1000 }}
              position={{ y: 0 }}
              allowEscapeViewBox={{ x: false, y: true }}
            />
            <Bar
              dataKey="parts"
              fill="#3b82f6"
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              label={{
                position: 'top',
                fill: '#64748b',
                fontSize: 10,
                fontWeight: 600,
                formatter: (value) => (value > 0 ? value : ''),
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Mobile-friendly legend */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-500 lg:hidden">
        <div className="h-3 w-3 rounded-sm bg-blue-500"></div>
        <span>Part Count per Hour</span>
      </div>
    </div>
  )
}
