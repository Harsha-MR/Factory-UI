import { useRef, useState } from 'react'
import { statusColor } from './utils'

export default function MachineDot({ machine }) {
  const buttonRef = useRef(null)
  const [align, setAlign] = useState('center') // 'left' | 'center' | 'right'

  const updatedAtText = machine.updatedAt ? new Date(machine.updatedAt).toLocaleString() : '—'

  function updateAlign() {
    const el = buttonRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth || 0
    const edgeThreshold = 220

    if (rect.left < edgeThreshold) setAlign('left')
    else if (vw - rect.right < edgeThreshold) setAlign('right')
    else setAlign('center')
  }

  const tooltipAlignClass =
    align === 'left'
      ? 'left-0 translate-x-0'
      : align === 'right'
        ? 'right-0 translate-x-0'
        : 'left-1/2 -translate-x-1/2'

  return (
    <div className="group relative">
      <button
        type="button"
        ref={buttonRef}
        className={`h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6 rounded-full ${statusColor(machine.status)} ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-black/20`}
        aria-label={`Machine ${machine.name || machine.id} status ${machine.status}`}
        onMouseEnter={updateAlign}
        onFocus={updateAlign}
      />

      <div
        className={`pointer-events-none absolute top-full z-20 mt-2 w-max rounded-md bg-gray-900 px-2.5 py-2 text-[11px] leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 ${tooltipAlignClass}`}
        style={{ maxWidth: 'min(18rem, calc(100vw - 1.5rem))' }}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${statusColor(machine.status)}`} />
          <div className="font-semibold">{machine.name || machine.id}</div>
        </div>
        <div className="mt-1 text-white/90">Status: {machine.status}</div>
        <div className="text-white/70">Updated: {updatedAtText}</div>
      </div>
    </div>
  )
}
