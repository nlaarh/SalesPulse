import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'

/**
 * Render this when line === 'Membership' on any SF-data page.
 * Usage: if (line === 'Membership') return <MembershipGuard />
 */
export default function MembershipGuard() {
  const navigate = useNavigate()
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
        <Users className="h-6 w-6 text-violet-500" />
      </div>
      <div>
        <p className="text-sm font-semibold">Membership Analytics</p>
        <p className="mt-1 text-[12px] text-muted-foreground max-w-[280px]">
          Membership data lives in a dedicated dashboard — new/renewals/cancellations, monthly trends, channel breakdown, and agent rankings.
        </p>
      </div>
      <button
        onClick={() => navigate('/membership')}
        className="rounded-lg bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90"
      >
        Go to Membership
      </button>
    </div>
  )
}
