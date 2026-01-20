import { useEffect, useRef, useState } from 'react'

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

/**
 * Wheel zoom helper for a "world" layer scaled via CSS transform.
 * - `zoom`: scale factor
 * - `origin`: CSS transform-origin string (e.g. "120px 80px")
 */
export function useWheelZoom({
  ref,
  zoom: zoomProp,
  onZoomChange,
  minZoom = 0.1,
  maxZoom = 2.0,
  step = 0.1,
} = {}) {
  const [internalZoom, setInternalZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })

  const zoom = zoomProp ?? internalZoom
  const zoomRef = useRef(zoom)
  const panRef = useRef(pan)
  const onZoomChangeRef = useRef(onZoomChange)
  const applyZoomRef = useRef(() => {})

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange
  }, [onZoomChange])

  useEffect(() => {
    applyZoomRef.current = (nextZoom) => {
      if (zoomProp == null) setInternalZoom(nextZoom)
      if (typeof onZoomChangeRef.current === 'function') onZoomChangeRef.current(nextZoom)
    }
  }, [zoomProp])

  useEffect(() => {
    const el = ref?.current
    if (!el) return

    const onWheel = (e) => {
      // Only zoom when user is intentionally scrolling the canvas.
      e.preventDefault()

      const curZoom = zoomRef.current
      const curPan = panRef.current

      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      // Trackpads send small deltas; mouse wheels bigger. Normalize by sign.
      const dir = e.deltaY > 0 ? -1 : 1

      const nextZoom = clamp(curZoom * (1 + dir * step), minZoom, maxZoom)
      if (nextZoom === curZoom) return

      // Keep the world point under cursor stable by adjusting pan.
      const worldX = (cx - curPan.x) / curZoom
      const worldY = (cy - curPan.y) / curZoom
      const nextPan = {
        x: cx - worldX * nextZoom,
        y: cy - worldY * nextZoom,
      }

      setPan(nextPan)
      applyZoomRef.current(nextZoom)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, minZoom, maxZoom, step])

  const resetZoom = () => {
    setPan({ x: 0, y: 0 })
    applyZoomRef.current(1)
  }

  return { zoom, pan, setPan, resetZoom }
}
