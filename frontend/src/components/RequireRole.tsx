import { Navigate } from 'react-router-dom'
import { type ReactNode } from 'react'
import { useAuth, type UserRole } from '@/contexts/AuthContext'

/**
 * Client-side route guard that gates a subtree by role.
 * Backend enforcement is authoritative; this is purely UX gating
 * so unauthorized users don't see broken pages.
 *
 * Mirrors <ProtectedRoute>'s loading state so refreshes don't flash a redirect.
 */
export default function RequireRole({
  roles,
  children,
  redirectTo = '/dashboard',
}: {
  roles: UserRole[]
  children: ReactNode
  redirectTo?: string
}) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to={redirectTo} replace />

  return <>{children}</>
}
