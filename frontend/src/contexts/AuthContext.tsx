import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import axios from 'axios'

export type UserRole = 'superadmin' | 'admin' | 'officer' | 'travel_manager' | 'travel_director' | 'insurance_manager'

export interface AppUser {
  id: number
  email: string
  name: string
  role: UserRole
  is_active: boolean
  created_at: string
}

interface AuthContextValue {
  user: AppUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'si-auth-token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
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
      })
      .catch(() => {
        // Token expired or invalid
        logout()
      })
      .finally(() => setLoading(false))
  }, [token, logout])

  const login = async (email: string, password: string) => {
    const { data } = await axios.post('/api/auth/login', { email, password })
    localStorage.setItem(TOKEN_KEY, data.token)
    setToken(data.token)
    setUser(data.user)
  }

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
