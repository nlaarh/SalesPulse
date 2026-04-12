import { useEffect, useState } from 'react'

/**
 * Animates a number from 0 → target over `duration` ms using ease-out.
 * Only runs when `start` is true (tie to scroll visibility).
 */
export function useCountUp(target: number, start: boolean, duration = 1500) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!start) return
    const t0 = performance.now()

    let raf: number
    const tick = (now: number) => {
      const elapsed = now - t0
      const progress = Math.min(elapsed / duration, 1)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * target))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [start, target, duration])

  return value
}
