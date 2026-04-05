import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Mail, Lock, AlertCircle } from 'lucide-react'
import SalesPulseLogo from '@/components/SalesPulseLogo'

export default function Login() {
  const { user, login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Already logged in → go to dashboard
  if (!loading && user) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[380px]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4">
            <SalesPulseLogo size={48} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">SalesPulse</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card-premium space-y-4 p-6">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="login-email" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                placeholder="you@company.com"
                className={cn(
                  'w-full rounded-lg border border-border bg-secondary/40 py-2.5 pl-10 pr-3',
                  'text-[14px] text-foreground placeholder:text-muted-foreground/40',
                  'outline-none transition-all duration-200',
                  'focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="login-password" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className={cn(
                  'w-full rounded-lg border border-border bg-secondary/40 py-2.5 pl-10 pr-3',
                  'text-[14px] text-foreground placeholder:text-muted-foreground/40',
                  'outline-none transition-all duration-200',
                  'focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                )}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className={cn(
              'flex w-full items-center justify-center rounded-lg py-2.5',
              'text-[14px] font-semibold transition-all duration-200',
              submitting || !email || !password
                ? 'cursor-not-allowed bg-primary/50 text-primary-foreground/50'
                : 'bg-primary text-primary-foreground hover:opacity-90',
            )}
          >
            {submitting ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/50">
          AAA WCNY &middot; SalesPulse
        </p>
      </div>
    </div>
  )
}
