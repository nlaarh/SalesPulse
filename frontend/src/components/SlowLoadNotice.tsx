/**
 * SlowLoadNotice — shown when a loading state exceeds a threshold.
 * Usage:
 *   const [loading, setLoading] = useState(true)
 *   return <>{loading && <SlowLoadNotice thresholdMs={10000} />}</>
 */
import { useEffect, useState } from 'react'
import { Loader2, Info } from 'lucide-react'

interface Props {
  thresholdMs?: number
  label?: string
}

export default function SlowLoadNotice({ thresholdMs = 10000, label = 'Loading\u2026' }: Props) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), thresholdMs)
    return () => clearTimeout(t)
  }, [thresholdMs])

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Loader2 className="w-6 h-6 animate-spin text-primary/60" />
      <p className="text-sm text-muted-foreground">{label}</p>
      {slow && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 max-w-md text-center">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Loading is taking longer than usual. We're warming fresh data — this happens after deploys or overnight refresh.</span>
        </div>
      )}
    </div>
  )
}
