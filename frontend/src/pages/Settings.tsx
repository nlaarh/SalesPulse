import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth, type AppUser, type UserRole } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  UserPlus, Pencil, Trash2,
  X, Shield, Eye, Plane, Umbrella, Crown,
  AlertCircle, Check, Users, ScrollText, Target, Zap, Database,
} from 'lucide-react'
import axios from 'axios'
import ActivityLogsTable from '@/components/ActivityLogsTable'
import TargetsTab from '@/pages/settings/TargetsTab'
import AIConfigTab from '@/pages/settings/AIConfigTab'
import { flushCache } from '@/lib/api'

type SettingsTab = 'users' | 'logs' | 'targets' | 'ai'

const ROLES: { value: UserRole; label: string; icon: typeof Shield; desc: string }[] = [
  { value: 'superadmin', label: 'Super Admin', icon: Crown, desc: 'Full access + settings' },
  { value: 'admin', label: 'Admin', icon: Shield, desc: 'Full access + settings' },
  { value: 'officer', label: 'Officer', icon: Eye, desc: 'All data, no settings' },
  { value: 'travel_manager', label: 'Travel Manager', icon: Plane, desc: 'Travel data only' },
  { value: 'travel_director', label: 'Travel Director', icon: Plane, desc: 'Travel data only (director)' },
  { value: 'insurance_manager', label: 'Insurance Manager', icon: Umbrella, desc: 'Insurance data only' },
]

function getRoleColor(role: string) {
  switch (role) {
    case 'superadmin': return 'text-amber-500 bg-amber-500/10'
    case 'admin': return 'text-primary bg-primary/10'
    case 'officer': return 'text-blue-400 bg-blue-400/10'
    case 'travel_manager': return 'text-sky-400 bg-sky-400/10'
    case 'travel_director': return 'text-sky-500 bg-sky-500/10'
    case 'insurance_manager': return 'text-emerald-400 bg-emerald-400/10'
    default: return 'text-muted-foreground bg-muted'
  }
}

function getRoleLabel(role: string) {
  return ROLES.find(r => r.value === role)?.label || role
}

export default function Settings() {
  const { user, token, isAdmin } = useAuth()
  const [tab, setTab] = useState<SettingsTab>('users')
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState<AppUser | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('officer')
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Non-admin redirect
  if (!isAdmin) return <Navigate to="/dashboard" replace />

  const headers = { Authorization: `Bearer ${token}` }

  const loadUsers = async () => {
    try {
      const { data } = await axios.get('/api/users', { headers })
      setUsers(data)
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const openCreate = () => {
    setEditUser(null)
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole('officer')
    setError('')
    setShowModal(true)
  }

  const openEdit = (u: AppUser) => {
    setEditUser(u)
    setFormName(u.name)
    setFormEmail(u.email)
    setFormPassword('')
    setFormRole(u.role)
    setError('')
    setShowModal(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setFormSubmitting(true)

    try {
      if (editUser) {
        // Update
        const body: Record<string, unknown> = { name: formName, role: formRole }
        if (formPassword) body.password = formPassword
        await axios.put(`/api/users/${editUser.id}`, body, { headers })
        setSuccess(`Updated ${formName}`)
      } else {
        // Create
        await axios.post('/api/users', {
          email: formEmail,
          name: formName,
          password: formPassword,
          role: formRole,
        }, { headers })
        setSuccess(`Created ${formName}`)
      }
      setShowModal(false)
      loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Operation failed')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async (u: AppUser) => {
    if (!confirm(`Delete ${u.name} (${u.email})?`)) return
    try {
      await axios.delete(`/api/users/${u.id}`, { headers })
      setSuccess(`Deleted ${u.name}`)
      loadUsers()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Delete failed')
      setTimeout(() => setError(''), 3000)
    }
  }

  const handleToggleActive = async (u: AppUser) => {
    try {
      await axios.put(`/api/users/${u.id}`, { is_active: !u.is_active }, { headers })
      loadUsers()
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Update failed')
      setTimeout(() => setError(''), 3000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and access control
          </p>
        </div>
        {tab === 'users' && (
          <button
            onClick={openCreate}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-primary text-primary-foreground text-[13px] font-semibold',
              'transition-all duration-200 hover:opacity-90',
            )}
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { key: 'users' as SettingsTab, label: 'Users', icon: Users },
          { key: 'targets' as SettingsTab, label: 'Advisor Targets', icon: Target },
          { key: 'logs' as SettingsTab, label: 'Activity Logs', icon: ScrollText },
          { key: 'ai' as SettingsTab, label: 'AI & Integrations', icon: Zap },
        ]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors -mb-px border-b-2',
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content: Activity Logs */}
      {tab === 'logs' && <ActivityLogsTable />}

      {/* Tab content: Advisor Targets */}
      {tab === 'targets' && <TargetsTab />}

      {/* Tab content: AI & Integrations */}
      {tab === 'ai' && <AIConfigTab />}

      {/* Tab content: Users */}
      {tab === 'users' && <>
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-500">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && !showModal && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-[13px] font-medium text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* User Table */}
      <div className="card-premium overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No users found</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-border/50 transition-colors hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium text-foreground">{u.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-5 py-3">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', getRoleColor(u.role))}>
                    {getRoleLabel(u.role)}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <button
                    onClick={() => handleToggleActive(u)}
                    disabled={u.id === user?.id}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors',
                      u.is_active
                        ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
                      u.id === user?.id && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => openEdit(u)}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {u.id !== user?.id && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="card-premium w-full max-w-[420px] p-0">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-[15px] font-semibold text-foreground">
                {editUser ? 'Edit User' : 'Add User'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="space-y-4 p-5">
              {error && showModal && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Full Name
                </label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="John Doe"
                  className={cn(
                    'w-full rounded-lg border border-border bg-secondary/40 px-3 py-2',
                    'text-[13px] text-foreground placeholder:text-muted-foreground/40',
                    'outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  required={!editUser}
                  disabled={!!editUser}
                  placeholder="user@nyaaa.com"
                  className={cn(
                    'w-full rounded-lg border border-border bg-secondary/40 px-3 py-2',
                    'text-[13px] text-foreground placeholder:text-muted-foreground/40',
                    'outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                    editUser && 'cursor-not-allowed opacity-60',
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {editUser ? 'New Password (leave blank to keep)' : 'Password'}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required={!editUser}
                  placeholder={editUser ? 'Leave blank to keep current' : 'Minimum 6 characters'}
                  className={cn(
                    'w-full rounded-lg border border-border bg-secondary/40 px-3 py-2',
                    'text-[13px] text-foreground placeholder:text-muted-foreground/40',
                    'outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/20',
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Role
                </label>
                <div className="space-y-1">
                  {ROLES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setFormRole(r.value)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                        'transition-all duration-200',
                        formRole === r.value
                          ? 'border border-primary/30 bg-primary/8'
                          : 'border border-transparent hover:bg-secondary/60',
                      )}
                    >
                      <r.icon className={cn('h-4 w-4', formRole === r.value ? 'text-primary' : 'text-muted-foreground')} />
                      <div>
                        <div className={cn('text-[13px] font-medium', formRole === r.value ? 'text-foreground' : 'text-muted-foreground')}>
                          {r.label}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60">{r.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={formSubmitting}
                className={cn(
                  'flex w-full items-center justify-center rounded-lg py-2.5',
                  'text-[13px] font-semibold transition-all duration-200',
                  formSubmitting
                    ? 'cursor-not-allowed bg-primary/50 text-primary-foreground/50'
                    : 'bg-primary text-primary-foreground hover:opacity-90',
                )}
              >
                {formSubmitting ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}
      </>}

      {/* Danger Zone — Cache Flush */}
      <div className="card-premium overflow-hidden border-destructive/20">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Data Cache</h3>
          </div>
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[13px] font-medium">Flush All Cached Data</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Forces a fresh Salesforce reload on next page visit. Use if data looks stale or shows 0.
            </p>
          </div>
          <button
            onClick={async () => {
              try {
                const r = await flushCache()
                setSuccess(`Cache flushed — ${r.flushed_l1} memory + ${r.flushed_l2} disk entries cleared`)
                setTimeout(() => setSuccess(''), 5000)
              } catch {
                setError('Cache flush failed — check permissions')
                setTimeout(() => setError(''), 5000)
              }
            }}
            className="ml-6 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] font-semibold text-amber-600 hover:bg-amber-500/20 transition">
            Flush Cache
          </button>
        </div>
      </div>
    </div>
  )
}
