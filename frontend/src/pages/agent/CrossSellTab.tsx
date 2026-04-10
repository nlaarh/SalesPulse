/**
 * CrossSellTab — Cross-sell summary for this advisor's page.
 * Links to the main Cross-Sell Insights page for full analysis.
 */

import { Lightbulb, ArrowUpRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface CrossSellTabProps {
  agentName: string
}

export default function CrossSellTab({ agentName }: CrossSellTabProps) {
  const navigate = useNavigate()

  return (
    <div className="text-center py-16 space-y-4">
      <Lightbulb className="h-10 w-10 mx-auto text-amber-500" />
      <div>
        <p className="text-foreground font-medium">Cross-Sell Analysis</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          See which of {agentName}'s customers have product gaps —
          travel customers without insurance, or insurance customers without travel.
        </p>
      </div>
      <button
        onClick={() => navigate('/insights')}
        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
      >
        Open Cross-Sell Insights <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
