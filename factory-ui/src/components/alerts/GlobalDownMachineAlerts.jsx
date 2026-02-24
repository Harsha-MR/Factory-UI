import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getMachinesSnapshot } from '../../services/mockApi'

const SNOOZE_MS = 60_000
const POLL_MS = 5_000
const SLIDE_EVERY_MS = 10_000
const SLIDE_ANIM_MS = 550

function formatMsg(item) {
  const factoryLabel = item?.factory?.name || item?.factory?.id || 'Factory'
  const plantLabel = item?.plant?.name || item?.plant?.id || 'Plant'
  const deptLabel = item?.department?.name || item?.department?.id || 'Department'
  const machineLabel = item?.machine?.name || item?.machine?.id || 'Machine'

  return `${factoryLabel} • ${plantLabel} • ${deptLabel} • ${machineLabel} is DOWN`
}

function sameMachine(a, b) {
  return String(a?.machine?.id || '') === String(b?.machine?.id || '')
}

export default function GlobalDownMachineAlerts() {
  const [downItems, setDownItems] = useState([])
  const downItemsRef = useRef([])
  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(false)

  const [nowMs, setNowMs] = useState(0)

  const [suppressedUntilById, setSuppressedUntilById] = useState({})

  useEffect(() => {
    downItemsRef.current = downItems
  }, [downItems])

  // Clock tick so snoozed alerts can reappear without relying on impure calls in render.
  useEffect(() => {
    const initial = window.setTimeout(() => {
      setNowMs(Date.now())
    }, 0)
    const id = window.setInterval(() => {
      setNowMs(Date.now())
    }, 1_000)

    return () => {
      window.clearTimeout(initial)
      window.clearInterval(id)
    }
  }, [])

  const visibleItems = useMemo(() => {
    return downItems.filter((item) => {
      const machineId = String(item?.machine?.id || '')
      const until = Number(suppressedUntilById[machineId] || 0)
      return until <= nowMs
    })
  }, [downItems, nowMs, suppressedUntilById])

  const slides = useMemo(() => {
    if (visibleItems.length <= 1) return visibleItems
    // Add a clone of the first to create a seamless loop.
    return [...visibleItems, visibleItems[0]]
  }, [visibleItems])

  const dismissMachine = useCallback((machineId) => {
    const id = String(machineId || '')
    if (!id) return
    const until = Date.now() + SNOOZE_MS
    setSuppressedUntilById((prev) => ({
      ...prev,
      [id]: until,
    }))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const snapshot = await getMachinesSnapshot()
        if (cancelled) return

        const nextDown = snapshot.filter((x) => String(x?.machine?.status || '') === 'DOWN')

        // Keep list stable-ish (so ticker doesn't jump around):
        // 1) preserve previous ordering where possible
        // 2) append newly down machines
        const prev = downItemsRef.current
        const out = []
        for (const old of prev) {
          const found = nextDown.find((x) => sameMachine(x, old))
          if (found) out.push(found)
        }
        for (const item of nextDown) {
          if (!out.some((x) => sameMachine(x, item))) out.push(item)
        }

        setDownItems(out)
      } catch {
        // ignore polling errors
      }
    }

    // initial + interval
    tick()
    const id = window.setInterval(tick, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  // Drive carousel index.
  useEffect(() => {
    if (visibleItems.length <= 1) return

    const id = window.setInterval(() => {
      setAnimate(true)
      setIndex((i) => i + 1)
    }, SLIDE_EVERY_MS)

    return () => window.clearInterval(id)
  }, [visibleItems.length])

  // Snap back after showing the clone slide.
  useEffect(() => {
    const len = visibleItems.length
    if (len <= 1) return
    if (index < len) return

    const t = window.setTimeout(() => {
      setAnimate(false)
      setIndex(0)
    }, SLIDE_ANIM_MS)

    return () => window.clearTimeout(t)
  }, [animate, index, visibleItems.length])

  // If list size changes, keep index in range.
  useEffect(() => {
    const len = visibleItems.length

    if (len <= 1) {
      if (animate) {
        const id = window.setTimeout(() => setAnimate(false), 0)
        return () => window.clearTimeout(id)
      }
      if (index !== 0) {
        const id = window.setTimeout(() => setIndex(0), 0)
        return () => window.clearTimeout(id)
      }
      return
    }

    if (len === 0) {
      if (index !== 0) {
        const id = window.setTimeout(() => setIndex(0), 0)
        return () => window.clearTimeout(id)
      }
      return
    }

    if (index > len) {
      const id = window.setTimeout(() => {
        setAnimate(false)
        setIndex(0)
      }, 0)
      return () => window.clearTimeout(id)
    }
  }, [animate, index, visibleItems.length])

  if (!visibleItems.length) return null

  const activeIndex = index >= visibleItems.length ? 0 : index
  const activeMachineId = visibleItems[activeIndex]?.machine?.id
  const stepPct = slides.length ? 100 / slides.length : 100

  return (
    <div className="fixed top-3 z-[60] flex w-full justify-center px-3">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-xl border border-red-200 bg-red-50 shadow-lg">
        <button
          type="button"
          className="absolute right-3 top-3 z-10 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          aria-label="Dismiss alert"
          onClick={() => dismissMachine(activeMachineId)}
        >
          X
        </button>

        <div
          className="flex"
          style={{
            transform: `translateX(-${index * stepPct}%)`,
            transition: animate ? `transform ${SLIDE_ANIM_MS}ms ease` : 'none',
            width: `${slides.length * 100}%`,
          }}
        >
          {slides.map((item, i) => {
            const machineId = item?.machine?.id
            const msg = formatMsg(item)
            return (
              <div key={`${machineId || i}-${i}`} className="flex-none" style={{ width: `${stepPct}%` }}>
                <div className="flex items-start justify-between gap-3 px-4 py-3 pr-12">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-red-800">Machine Alert</div>
                    <div className="mt-0.5 break-words text-sm text-red-700">{msg}</div>
                    <div className="mt-1 text-xs text-red-600">Each alert shows for 10s; dismissed alerts return after 1 min if still DOWN.</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
