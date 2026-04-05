import { CircleDollarSign, DollarSign } from 'lucide-react'

export default function MetricsSection() {
  return (
    <div className="space-y-5 p-6">
      <p className="text-[13px] text-muted-foreground">
        SalesInsight tracks two distinct revenue concepts. Understanding the difference
        is critical for accurate reporting.
      </p>

      <div className="grid grid-cols-2 gap-4">
        {/* Bookings */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
              <CircleDollarSign className="h-4 w-4 text-primary" />
            </div>
            <h4 className="text-[14px] font-bold text-foreground">Bookings (Amount)</h4>
          </div>
          <div className="space-y-2.5 text-[12px] leading-relaxed text-foreground/80">
            <p>
              The <strong>Amount</strong> field on each Opportunity. Recorded when a deal
              is marked Closed Won or Invoice.
            </p>
            <div className="rounded-md bg-background/50 p-3 text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Travel</span><span className="font-semibold">Gross booking value (~$44M/yr)</span></div>
              <div className="mt-1.5 flex justify-between"><span className="text-muted-foreground">Insurance</span><span className="font-semibold">Premium amount (~$12M/yr)</span></div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              This is the primary metric for year-over-year comparisons because it is
              recorded immediately at close.
            </p>
          </div>
        </div>

        {/* Commission */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15">
              <DollarSign className="h-4 w-4 text-amber-500" />
            </div>
            <h4 className="text-[14px] font-bold text-foreground">Commission</h4>
          </div>
          <div className="space-y-2.5 text-[12px] leading-relaxed text-foreground/80">
            <p>
              The <strong>Earned_Commission_Amount__c</strong> field. Populated when the
              service is delivered and invoiced.
            </p>
            <div className="rounded-md bg-background/50 p-3 text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Travel</span><span className="font-semibold">~$6.6M/yr (actual commission)</span></div>
              <div className="mt-1.5 flex justify-between"><span className="text-muted-foreground">Insurance</span><span className="font-semibold">Not used ($0)</span></div>
            </div>
            <p className="text-[11px] text-amber-600">
              Commission data lags 2-3 months. Recent months will show incomplete
              numbers — do not use for YoY comparisons.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
