import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

/**
 * Sticky amber banner shown when an admin is acting as another user.
 * Returning navigates back via stopImpersonating() in AuthContext.
 */
export default function ImpersonationBanner() {
  const { isImpersonating, user, stopImpersonating } = useAuth()
  const [returning, setReturning] = useState(false)

  if (!isImpersonating || !user) return null

  const handleReturn = async () => {
    if (returning) return
    setReturning(true)
    try {
      await stopImpersonating()
    } finally {
      setReturning(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-amber-500/30',
        'bg-amber-500/15 px-6 py-2 text-[12px] font-medium text-amber-700 dark:text-amber-300',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
        <span>
          Acting as <span className="font-semibold">{user.email}</span> ({user.role.replace('_', ' ')})
        </span>
      </div>
      <button
        onClick={handleReturn}
        disabled={returning}
        className={cn(
          'flex items-center gap-1.5 rounded-full border border-amber-500/40 px-3 py-1',
          'text-[11px] font-semibold transition-colors',
          returning
            ? 'cursor-not-allowed opacity-60'
            : 'hover:bg-amber-500/20',
        )}
      >
        <LogOut className="h-3 w-3" />
        {returning ? 'Returning…' : 'Return to my account'}
      </button>
    </div>
  )
}
