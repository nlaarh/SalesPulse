import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import SalesPulseLogo from '@/components/SalesPulseLogo'
import {
  BarChart3, GitBranch, Plane, Target, Zap,
  ArrowRight, Shield, Users, CheckCircle2,
  LineChart, PieChart, Activity,
} from 'lucide-react'

/* ── Feature data ───────────────────────────────────────────────────────── */

const CAPABILITIES = [
  {
    icon: BarChart3,
    title: 'Bookings & Commission Analytics',
    desc: 'Commission, bookings, and win rate metrics — broken down by agent, branch, and month.',
  },
  {
    icon: GitBranch,
    title: 'Pipeline Intelligence',
    desc: 'Stage velocity, aging alerts, and AI-powered deal scoring to focus manager attention.',
  },
  {
    icon: Target,
    title: 'Target Tracking',
    desc: 'Upload advisor targets and track commission achievement with progress rings and trend lines.',
  },
  {
    icon: Users,
    title: 'Agent Profiles',
    desc: 'Individual performance cards with AI-generated manager briefs, strengths, and coaching areas.',
  },
  {
    icon: Plane,
    title: 'Destination Insights',
    desc: 'Travel booking analytics by destination, supplier, and season — spot trends early.',
  },
  {
    icon: LineChart,
    title: 'Lead Funnel',
    desc: 'Full-funnel visibility from source to close, with conversion rates and time-to-convert analysis.',
  },
]

const METRICS = [
  { value: '57', label: 'Travel Advisors Tracked', icon: Users },
  { value: '6', label: 'Analytics Modules', icon: PieChart },
  { value: '<1s', label: 'Query Response Time', icon: Zap },
  { value: 'AI', label: 'Powered Insights', icon: Activity },
]

const TRUST_ITEMS = [
  'Salesforce OAuth 2.0 secured',
  'Real-time SOQL data sync',
  'Role-based access control',
  'Dual-layer caching (L1 + L2)',
  'AI-generated executive briefs',
  'Audit trail for all actions',
]

/* ── Component ──────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const { user, loading } = useAuth()
  if (!loading && user) return <Navigate to="/dashboard" replace />

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ── Navbar ── */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-border/40 bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <SalesPulseLogo size={32} showText />
          <div className="flex items-center gap-3">
            <a href="#features" className="hidden text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">
              Features
            </a>
            <a href="#security" className="hidden text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">
              Security
            </a>
            <Link
              to="/login"
              className="ml-2 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90"
            >
              Sign In <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative pt-14">
        {/* Subtle grid background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: 'radial-gradient(var(--si-fg) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="absolute -top-40 left-1/2 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-primary/[0.04] blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-6 pb-20 pt-20 sm:pt-28">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Left — Copy */}
            <div className="max-w-xl">
              <div className="animate-enter stagger-1 mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Zap className="h-3 w-3" />
                Sales Intelligence Platform
              </div>

              <h1 className="animate-enter stagger-2 text-[2.75rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
                Know your numbers.
                <br />
                <span className="text-primary">Coach your team.</span>
              </h1>

              <p className="animate-enter stagger-3 mt-6 text-[17px] leading-relaxed text-muted-foreground">
                SalesPulse connects to your Salesforce org and delivers real-time
                revenue dashboards, AI-powered agent briefs, and target tracking
                — purpose-built for AAA sales leaders.
              </p>

              <div className="animate-enter stagger-4 mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/login"
                  className="group flex items-center gap-2 rounded-lg bg-primary px-7 py-3 text-[15px] font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30"
                >
                  Open Dashboard
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#features"
                  className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Learn more &darr;
                </a>
              </div>
            </div>

            {/* Right — Dashboard preview mockup */}
            <div className="animate-enter stagger-3 hidden lg:block">
              <div className="relative">
                {/* Shadow / glow */}
                <div className="absolute -inset-4 rounded-2xl bg-primary/[0.03] blur-2xl" />
                {/* Mock dashboard card */}
                <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10">
                  {/* Title bar */}
                  <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/30 px-4 py-2.5">
                    <div className="flex gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                      <div className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                    </div>
                    <span className="ml-2 text-[10px] font-medium text-muted-foreground/60">SalesPulse — Sales Performance</span>
                  </div>
                  {/* Mock KPI row */}
                  <div className="grid grid-cols-4 gap-3 p-4">
                    {[
                      { label: 'Commission', value: '$1.2M', delta: '+18%', up: true },
                      { label: 'Deals Won', value: '342', delta: '+24%', up: true },
                      { label: 'Win Rate', value: '72.4%', delta: '-2.1pts', up: false },
                      { label: 'Pipeline', value: '$4.8M', delta: '2.4x', up: true },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-lg border border-border/50 bg-secondary/20 p-3">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">{kpi.label}</span>
                        <p className="mt-1 text-[18px] font-bold tabular-nums tracking-tight">{kpi.value}</p>
                        <span className={`text-[10px] font-semibold ${kpi.up ? 'text-emerald-500' : 'text-rose-500'}`}>{kpi.delta}</span>
                      </div>
                    ))}
                  </div>
                  {/* Mock chart area */}
                  <div className="px-4 pb-4">
                    <div className="h-32 rounded-lg border border-border/30 bg-secondary/10 p-3">
                      <div className="flex items-end gap-1 h-full">
                        {[35, 42, 38, 55, 48, 62, 58, 72, 68, 85, 78, 92].map((h, i) => (
                          <div key={i} className="flex-1 rounded-t bg-primary/20 transition-all" style={{ height: `${h}%` }}>
                            <div className="h-full rounded-t bg-primary" style={{ height: `${60 + Math.random() * 30}%` }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Metrics bar ── */}
      <section className="border-y border-border/40 bg-card/40">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px sm:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.label} className="flex flex-col items-center gap-1.5 px-6 py-8">
              <m.icon className="h-4 w-4 text-primary/60" />
              <span className="text-2xl font-extrabold tabular-nums tracking-tight text-foreground">{m.value}</span>
              <span className="text-[11px] font-medium text-muted-foreground">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">Capabilities</span>
          </div>
          <h2 className="mb-4 text-center text-3xl font-bold tracking-tight sm:text-4xl">
            Six modules. One platform.
          </h2>
          <p className="mx-auto mb-16 max-w-2xl text-center text-[16px] leading-relaxed text-muted-foreground">
            Every metric your sales leaders need — from high-level division KPIs
            to individual agent coaching briefs.
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((f, i) => (
              <div
                key={f.title}
                className={`animate-enter stagger-${(i % 5) + 1} group rounded-xl border border-border bg-card p-6 transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5`}
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/15">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Security & Trust ── */}
      <section id="security" className="border-y border-border/40 bg-card/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">Enterprise Security</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Built for enterprise.
                <br />
                Secured by design.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                SalesPulse runs read-only queries against your Salesforce org.
                No data is stored externally — all metrics are computed on-the-fly
                with intelligent caching for sub-second response times.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {TRUST_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-2.5 rounded-lg border border-border/50 bg-card/60 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-[13px] font-medium text-foreground/80">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to see your data clearly?
          </h2>
          <p className="mt-4 text-[16px] text-muted-foreground">
            Sign in with your AAA credentials and start exploring in seconds.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-10 py-3.5 text-[15px] font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all duration-200 hover:shadow-lg hover:shadow-primary/30"
          >
            Sign In Now
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <SalesPulseLogo size={24} showText />
          <p className="text-[11px] text-muted-foreground/40">
            &copy; {new Date().getFullYear()} AAA WCNY &middot; Internal Use Only
          </p>
        </div>
      </footer>
    </div>
  )
}
