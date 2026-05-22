import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Radio, LogIn, KeyRound, Pencil, Trash2, RotateCcw,
  AlertCircle, Check, X, ShieldCheck, ShieldAlert, UserPlus,
} from 'lucide-react'
import { useAuth, type AppUser, type UserRole } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  fetchAdminSessions, type AdminSession,
  adminResetPassword, adminImpersonate, adminActivateUser,
  listUsers, createUser, updateUser, deleteUser,
  type UserCreatePayload,
} from '@/lib/api_admin'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'superadmin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'executive', label: 'Executive' },
  { value: 'travel_manager', label: 'Travel Manager' },
  { value: 'travel_director', label: 'Travel Director' },
  { value: 'insurance_manager', label: 'Insurance Manager' },
]

function roleColor(role: string) {
  switch (role) {
    case 'superadmin': return 'text-amber-500 bg-amber-500/10 border-amber-500/20'
    case 'admin': return 'text-fuchsia-500 bg-fuchsia-500/10 border-fuchsia-500/20'
    case 'executive': return 'text-primary bg-primary/10 border-primary/20'
    case 'travel_manager': return 'text-sky-400 bg-sky-400/10 border-sky-400/20'
    case 'travel_director': return 'text-sky-500 bg-sky-500/10 border-sky-500/20'
    case 'insurance_manager': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
    default: return 'text-muted-foreground bg-muted border-border'
  }
}

function roleLabel(role: string) {
  return ROLES.find(r => r.value === role)?.label || role
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtRelative(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diffMs = Date.now() - d.getTime()
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

type ConfirmAction =
  | { kind: 'impersonate'; user: AppUser }
  | { kind: 'deactivate'; user: AppUser }
  | { kind: 'activate'; user: AppUser }

interface UserManagementProps {
  /** Hide the standalone page header when this is rendered as a tab inside Settings. */
  embedded?: boolean
}

export default function UserManagement({ embedded = false }: UserManagementProps = {}) {
  const { user: currentUser, startImpersonation } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editTarget, setEditTarget] = useState<AppUser | null>(null)
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const flashSuccess = (msg: string) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(''), 3000)
  }
  const flashError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  // Sessions polled every 5s
  const sessionsQuery = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: fetchAdminSessions,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  })

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: listUsers,
  })

  // Map user_id -> freshest last_seen across sessions (for Last Login column)
  const lastSeenByUser = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of sessionsQuery.data ?? []) {
      const cur = m.get(s.user_id)
      if (!cur || new Date(s.last_seen) > new Date(cur)) {
        m.set(s.user_id, s.last_seen)
      }
    }
    return m
  }, [sessionsQuery.data])

  // ─── Mutations ─────────────────────────────────────────────────────
  const refreshUsers = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })
  const refreshSessions = () => qc.invalidateQueries({ queryKey: ['admin', 'sessions'] })

  const editMutation = useMutation({
    mutationFn: (payload: { id: number; data: Parameters<typeof updateUser>[1] }) =>
      updateUser(payload.id, payload.data),
    onSuccess: () => {
      flashSuccess('User updated')
      setEditTarget(null)
      refreshUsers()
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Update failed'),
  })

  const createMutation = useMutation({
    mutationFn: (payload: UserCreatePayload) => createUser(payload),
    onSuccess: (u) => {
      flashSuccess(`Created ${u.name}`)
      setCreating(false)
      refreshUsers()
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Create failed'),
  })

  const pwMutation = useMutation({
    mutationFn: (payload: { id: number; pw: string }) =>
      adminResetPassword(payload.id, payload.pw),
    onSuccess: () => {
      flashSuccess('Password reset. The user\'s active sessions were invalidated.')
      setPwTarget(null)
      refreshSessions()
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Password reset failed'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => {
      flashSuccess('User deactivated')
      setConfirm(null)
      refreshUsers()
      refreshSessions()
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Deactivate failed'),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => adminActivateUser(id),
    onSuccess: () => {
      flashSuccess('User reactivated')
      setConfirm(null)
      refreshUsers()
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Activate failed'),
  })

  const impersonateMutation = useMutation({
    mutationFn: (id: number) => adminImpersonate(id),
    onSuccess: (data) => {
      setConfirm(null)
      startImpersonation(data.token, data.origin_token)
      navigate('/')
    },
    onError: (e: any) => flashError(e?.response?.data?.detail || 'Impersonate failed'),
  })

  return (
    <div className="space-y-6">
      {/* Header (page only — Settings tab renders its own header) */}
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">User Management</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Accounts, roles, active sessions, and impersonation
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-primary text-primary-foreground text-[13px] font-semibold',
              'transition-all duration-200 hover:opacity-90',
            )}
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        </div>
      )}
      {embedded && (
        <div className="flex justify-end">
          <button
            onClick={() => setCreating(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2',
              'bg-primary text-primary-foreground text-[13px] font-semibold',
              'transition-all duration-200 hover:opacity-90',
            )}
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </button>
        </div>
      )}

      {/* Global toasts */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-[13px] font-medium text-emerald-500">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-2.5 text-[13px] font-medium text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* ── Users (left) + Active Sessions (right) ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Users — left */}
        <div className="card-premium overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="text-[14px] font-semibold text-foreground">Users</h2>
            <span className="text-[11px] text-muted-foreground">
              ({(usersQuery.data ?? []).length} total)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>
                ) : (usersQuery.data ?? []).length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No users found</td></tr>
                ) : (usersQuery.data ?? []).map((u) => {
                  const isSelf = u.id === currentUser?.id
                  const lastSeen = lastSeenByUser.get(u.id)
                  return (
                    <tr key={u.id} className={cn(
                      'border-b border-border/50 transition-colors hover:bg-secondary/30',
                      !u.is_active && 'opacity-60',
                    )}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{u.name}</div>
                        <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        {u.department && (
                          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{u.department}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', roleColor(u.role))}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          u.is_active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500',
                        )}>
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap" title={lastSeen ? fmtDateTime(lastSeen) : ''}>
                        {lastSeen ? fmtRelative(lastSeen) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditTarget(u)}
                            title="Edit"
                            disabled={!u.is_active}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPwTarget(u)}
                            title="Reset password"
                            disabled={!u.is_active}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirm({ kind: 'impersonate', user: u })}
                            title={isSelf ? 'Cannot impersonate yourself' : `Impersonate ${u.name}`}
                            disabled={!u.is_active || isSelf}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-indigo-500/10 hover:text-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <LogIn className="h-3.5 w-3.5" />
                          </button>
                          {u.is_active ? (
                            <button
                              onClick={() => setConfirm({ kind: 'deactivate', user: u })}
                              title={isSelf ? 'Cannot deactivate yourself' : 'Deactivate'}
                              disabled={isSelf}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirm({ kind: 'activate', user: u })}
                              title="Reactivate"
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-500"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Sessions — right */}
        <div className="card-premium overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Radio className="h-4 w-4 text-emerald-500" />
            <h2 className="text-[14px] font-semibold text-foreground">Active Sessions</h2>
            <span className="text-[11px] text-muted-foreground">
              ({(sessionsQuery.data ?? []).filter(s => s.online).length} online · refresh 5s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessionsQuery.isLoading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : (sessionsQuery.data ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No active sessions</td></tr>
                ) : (sessionsQuery.data ?? []).map((s: AdminSession, i) => (
                  <tr key={`${s.user_id}-${i}`} className="border-b border-border/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">{s.email}</div>
                      {s.impersonator_email && (
                        <div
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-500"
                          title={`Impersonated by ${s.impersonator_email}`}
                        >
                          <ShieldAlert className="h-3 w-3" />
                          {s.impersonator_email}
                        </div>
                      )}
                      {s.ip_address && (
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{s.ip_address}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap', roleColor(s.role))}>
                        {roleLabel(s.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-muted-foreground whitespace-nowrap" title={`Logged in ${fmtDateTime(s.login_time)} · last seen ${fmtDateTime(s.last_seen)}`}>
                      {fmtRelative(s.last_seen)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        s.online ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s.online ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40')} />
                        {s.online ? 'Online' : 'Idle'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Create modal ── */}
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onSave={(payload) => createMutation.mutate(payload)}
          saving={createMutation.isPending}
        />
      )}

      {/* ── Edit modal ── */}
      {editTarget && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(data) => editMutation.mutate({ id: editTarget.id, data })}
          saving={editMutation.isPending}
        />
      )}

      {/* ── Reset password modal ── */}
      {pwTarget && (
        <ResetPasswordModal
          user={pwTarget}
          onClose={() => setPwTarget(null)}
          onSave={(pw) => pwMutation.mutate({ id: pwTarget.id, pw })}
          saving={pwMutation.isPending}
        />
      )}

      {/* ── Confirm dialog ── */}
      {confirm && (
        <ConfirmDialog
          action={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.kind === 'deactivate') deactivateMutation.mutate(confirm.user.id)
            else if (confirm.kind === 'activate') activateMutation.mutate(confirm.user.id)
            else if (confirm.kind === 'impersonate') impersonateMutation.mutate(confirm.user.id)
          }}
          pending={
            deactivateMutation.isPending ||
            activateMutation.isPending ||
            impersonateMutation.isPending
          }
        />
      )}
    </div>
  )
}

/* ── Modals ──────────────────────────────────────────────────────────────── */

function CreateUserModal({
  onClose, onSave, saving,
}: {
  onClose: () => void
  onSave: (payload: UserCreatePayload) => void
  saving: boolean
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('executive')
  const [department, setDepartment] = useState('')
  const [err, setErr] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setErr('Password must be at least 8 characters')
      return
    }
    setErr('')
    onSave({
      email: email.trim(),
      name: name.trim(),
      password,
      role,
      department: department.trim() || null,
    })
  }

  return (
    <ModalShell title="Add User" onClose={onClose} icon={<UserPlus className="h-5 w-5" />}>
      <form onSubmit={submit} className="space-y-4 p-5">
        {err && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />{err}
          </div>
        )}
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className={INPUT} placeholder="user@nyaaa.com" />
        </Field>
        <Field label="Full Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} placeholder="John Doe" />
        </Field>
        <Field label="Temporary Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className={INPUT} placeholder="Minimum 8 characters" />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={INPUT}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="(optional)" className={INPUT} />
        </Field>
        <SubmitButton submitting={saving}>Create User</SubmitButton>
      </form>
    </ModalShell>
  )
}

function EditUserModal({
  user, onClose, onSave, saving,
}: {
  user: AppUser
  onClose: () => void
  onSave: (data: { name: string; role: UserRole; department: string | null; is_active: boolean }) => void
  saving: boolean
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<UserRole>(user.role)
  const [department, setDepartment] = useState(user.department || '')
  const [isActive, setIsActive] = useState(user.is_active)

  return (
    <ModalShell title="Edit User" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSave({
            name,
            role,
            department: department.trim() || null,
            is_active: isActive,
          })
        }}
        className="space-y-4 p-5"
      >
        <Field label="Email"><input value={user.email} disabled className={INPUT_DISABLED} /></Field>
        <Field label="Full Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required className={INPUT} />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={INPUT}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="(optional)" className={INPUT} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Active
        </label>
        <SubmitButton submitting={saving}>Save Changes</SubmitButton>
      </form>
    </ModalShell>
  )
}

function ResetPasswordModal({
  user, onClose, onSave, saving,
}: {
  user: AppUser
  onClose: () => void
  onSave: (pw: string) => void
  saving: boolean
}) {
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [err, setErr] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) {
      setErr('Password must be at least 8 characters')
      return
    }
    if (pw !== confirmPw) {
      setErr('Passwords do not match')
      return
    }
    setErr('')
    onSave(pw)
  }

  return (
    <ModalShell title={`Reset Password — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            This will invalidate <span className="font-semibold">{user.email}</span>'s active sessions.
            They will need to sign in again with the new password.
          </div>
        </div>
        {err && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />{err}
          </div>
        )}
        <Field label="New Password">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            autoFocus
            minLength={8}
            className={INPUT}
            placeholder="Minimum 8 characters"
          />
        </Field>
        <Field label="Confirm Password">
          <input
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            required
            minLength={8}
            className={INPUT}
          />
        </Field>
        <SubmitButton submitting={saving}>Reset Password</SubmitButton>
      </form>
    </ModalShell>
  )
}

function ConfirmDialog({
  action, onClose, onConfirm, pending,
}: {
  action: ConfirmAction
  onClose: () => void
  onConfirm: () => void
  pending: boolean
}) {
  const cfg = {
    impersonate: {
      title: `Impersonate ${action.user.name}?`,
      body: `You will be logged in as ${action.user.email} until you click "Return to my account". All actions will be attributed to ${action.user.name} but logged with your identity as the impersonator.`,
      cta: 'Impersonate',
      tone: 'indigo' as const,
      icon: <LogIn className="h-5 w-5" />,
    },
    deactivate: {
      title: `Deactivate ${action.user.name}?`,
      body: `${action.user.email} will be unable to sign in. Their data is preserved and you can reactivate them later.`,
      cta: 'Deactivate',
      tone: 'destructive' as const,
      icon: <Trash2 className="h-5 w-5" />,
    },
    activate: {
      title: `Reactivate ${action.user.name}?`,
      body: `${action.user.email} will be able to sign in again.`,
      cta: 'Reactivate',
      tone: 'emerald' as const,
      icon: <ShieldCheck className="h-5 w-5" />,
    },
  }[action.kind]

  const toneClass =
    cfg.tone === 'destructive' ? 'bg-destructive text-destructive-foreground hover:opacity-90'
    : cfg.tone === 'emerald' ? 'bg-emerald-500 text-white hover:opacity-90'
    : 'bg-indigo-500 text-white hover:opacity-90'

  return (
    <ModalShell title={cfg.title} onClose={onClose} icon={cfg.icon}>
      <div className="space-y-4 p-5">
        <p className="text-[13px] text-muted-foreground">{cfg.body}</p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={cn('rounded-lg px-4 py-2 text-[13px] font-semibold transition-all', toneClass, pending && 'cursor-not-allowed opacity-60')}
          >
            {pending ? 'Working…' : cfg.cta}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

/* ── Shared modal shell + form atoms ──────────────────────────────────────── */

function ModalShell({
  title, onClose, children, icon,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="card-premium w-full max-w-[460px] p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{label}</label>
      {children}
    </div>
  )
}

function SubmitButton({ submitting, children }: { submitting: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className={cn(
        'flex w-full items-center justify-center rounded-lg py-2.5',
        'text-[13px] font-semibold transition-all duration-200',
        submitting
          ? 'cursor-not-allowed bg-primary/50 text-primary-foreground/50'
          : 'bg-primary text-primary-foreground hover:opacity-90',
      )}
    >
      {submitting ? 'Saving…' : children}
    </button>
  )
}

const INPUT = cn(
  'w-full rounded-lg border border-border bg-background px-3 py-2.5',
  'text-[14px] text-foreground placeholder:text-muted-foreground/70',
  'shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30',
)
const INPUT_DISABLED = cn(INPUT, 'cursor-not-allowed bg-secondary/60 opacity-70')
