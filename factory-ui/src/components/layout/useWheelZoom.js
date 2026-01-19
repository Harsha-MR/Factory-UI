import { useEffect, useMemo, useState } from 'react'

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n))
}

export function useWheelZoom({ ref, min = 0.6, max = 2.6, step = 0.12, initial = 1 }) {
  const [zoom, setZoom] = useState(initial)
  const [origin, setOrigin] = useState('50% 50%')

  useEffect(() => {
    const el = ref?.current
    if (!el) return

    const onWheel = (e) => {
      // Zoom only when pointer is over the layout.
      e.preventDefault()

      const rect = el.getBoundingClientRect()
      const x = rect.width ? ((e.clientX - rect.left) / rect.width) * 100 : 50
      const y = rect.height ? ((e.clientY - rect.top) / rect.height) * 100 : 50
      setOrigin(`${clamp(x, 0, 100)}% ${clamp(y, 0, 100)}%`)

      setZoom((z) => {
        const dir = e.deltaY > 0 ? -1 : 1
        const next = z * (1 + dir * step)
        return clamp(next, min, max)
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, min, max, step])

  return useMemo(
    () => ({ zoom, setZoom, origin, resetZoom: () => setZoom(initial) }),
    [zoom, origin, initial],
  )
}
