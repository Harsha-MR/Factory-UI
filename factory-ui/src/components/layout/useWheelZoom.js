import { useEffect, useMemo, useState } from 'react'

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

/**
 * Wheel zoom helper for a "world" layer scaled via CSS transform.
 * - `zoom`: scale factor
 * - `origin`: CSS transform-origin string (e.g. "120px 80px")
 */
export function useWheelZoom({
  ref,
  minZoom = 0.1,
  maxZoom = 2.0,
  step = 0.1,
} = {}) {
  const [zoom, setZoom] = useState(1)
  const [originPx, setOriginPx] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const el = ref?.current
    if (!el) return

    const onWheel = (e) => {
      // Only zoom when user is intentionally scrolling the canvas.
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setOriginPx({ x, y })

      // Trackpads send small deltas; mouse wheels bigger. Normalize by sign.
      const dir = e.deltaY > 0 ? -1 : 1
      setZoom((z) => clamp(z * (1 + dir * step), minZoom, maxZoom))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, minZoom, maxZoom, step])

  const origin = useMemo(() => `${originPx.x}px ${originPx.y}px`, [originPx])

  const resetZoom = () => {
    setZoom(1)
    setOriginPx({ x: 0, y: 0 })
  }

  return { zoom, origin, resetZoom }
}
