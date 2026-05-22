import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import axios from 'axios'

export type UserRole = 'superadmin' | 'admin' | 'executive' | 'travel_manager' | 'travel_director' | 'insurance_manager'

export interface AppUser {
  id: number
  email: string
  name: string
  role: UserRole
  department: string | null
  is_active: boolean
  created_at: string
}

interface AuthContextValue {
  user: AppUser | null
  token: string | null
  loading: boolean
  permissions: string[]
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAdmin: boolean
  isAdminOrSuperadmin: boolean
  isImpersonating: boolean
  startImpersonation: (newToken: string, originToken: string) => void
  stopImpersonating: () => Promise<void>
  hasPermission: (resource: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'si-auth-token'
const PERMS_KEY = 'si-permissions'
const IMPERSONATOR_TOKEN_KEY = 'salespulse_impersonator_token'

function matchPermission(userPerms: string[], resource: string): boolean {
  // Check exact match or wildcard (e.g., 'page:*' matches 'page:dashboard')
  const [category] = resource.split(':')
  return userPerms.some(p => p === resource || p === `${category}:*` || p === '*')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [permissions, setPermissions] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(PERMS_KEY) || '[]') } catch { return [] }
  })
  const [loading, setLoading] = useState(true)
  const [isImpersonating, setIsImpersonating] = useState<boolean>(
    () => !!localStorage.getItem(IMPERSONATOR_TOKEN_KEY),
  )

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setPermissions([])
    setIsImpersonating(false)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PERMS_KEY)
    localStorage.removeItem(IMPERSONATOR_TOKEN_KEY)
  }, [])

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    axios
      .get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(({ data }) => {
        setUser(data)
        if (data.permissions) {
          setPermissions(data.permissions)
          localStorage.setItem(PERMS_KEY, JSON.stringify(data.permissions))
        }
      })
      .catch(() => {
        logout()
      })
      .finally(() => setLoading(false))
  }, [token, logout])

  const login = async (email: string, password: string) => {
    const { data } = await axios.post('/api/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
    if (data.permissions) {
      setPermissions(data.permissions)
      localStorage.setItem(PERMS_KEY, JSON.stringify(data.permissions))
    }
  }

  const isAdmin = user?.role === 'superadmin'
  const isAdminOrSuperadmin = user?.role === 'superadmin' || user?.role === 'admin'

  const hasPermission = useCallback((resource: string) => {
    if (!user) return false
    if (user.role === 'superadmin') return true
    return matchPermission(permissions, resource)
  }, [user, permissions])

  // Swap the active session to an impersonated token, stashing the origin token
  // so we can restore it on stopImpersonating(). The token effect above handles
  // refetching /api/auth/me, so the rest of the app sees the impersonated user.
  const startImpersonation = useCallback((newToken: string, originToken: string) => {
    localStorage.setItem(IMPERSONATOR_TOKEN_KEY, originToken)
    localStorage.setItem(TOKEN_KEY, newToken)
    setIsImpersonating(true)
    setLoading(true)
    setToken(newToken)
  }, [])

  const stopImpersonating = useCallback(async () => {
    const originToken = localStorage.getItem(IMPERSONATOR_TOKEN_KEY)
    if (!originToken) return
    try {
      const { data } = await axios.post(
        '/api/admin/impersonate/return',
        { origin_token: originToken },
        { headers: { Authorization: `Bearer ${originToken}` } },
      )
      const restored = data?.token || originToken
      localStorage.setItem(TOKEN_KEY, restored)
      localStorage.removeItem(IMPERSONATOR_TOKEN_KEY)
      setIsImpersonating(false)
      setLoading(true)
      setToken(restored)
    } catch {
      // Best-effort: even if the return endpoint fails, restore the origin token
      // locally so the user isn't stuck impersonating.
      localStorage.setItem(TOKEN_KEY, originToken)
      localStorage.removeItem(IMPERSONATOR_TOKEN_KEY)
      setIsImpersonating(false)
      setLoading(true)
      setToken(originToken)
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      user, token, loading, permissions, login, logout,
      isAdmin, isAdminOrSuperadmin,
      isImpersonating, startImpersonation, stopImpersonating,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
