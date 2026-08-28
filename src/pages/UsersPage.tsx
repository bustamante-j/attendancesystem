import { CalendarPlus, KeyRound, Pencil, Plus, RotateCcw, ShieldCheck, ShieldOff, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { useAuth } from '../features/auth/AuthProvider'
import { ResetPasswordModal } from '../features/users/ResetPasswordModal'
import { UserFormModal } from '../features/users/UserFormModal'
import { friendlyError } from '../lib/errors'
import { listEventAssignmentCounts } from '../services/events'
import { createUser, forceUserLogout, listProfiles, resetUserPassword, setUserEnabled, updateUser } from '../services/users'
import type { Profile, UserRole } from '../types/app'
import { formatManilaDate } from '../utils/dates'

export function UsersPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { profile: currentProfile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<Profile | null | undefined>(undefined)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)
  const load = useCallback(async () => {
    try {
      const [profileRows, counts] = await Promise.all([listProfiles(), listEventAssignmentCounts()])
      setProfiles(profileRows)
      setAssignmentCounts(counts)
    }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => profiles.filter((profile) => {
    const needle = search.trim().toLowerCase()
    if (needle && !`${profile.username} ${profile.full_name}`.toLowerCase().includes(needle)) return false
    if (roleFilter !== 'all' && profile.role !== roleFilter) return false
    if (statusFilter === 'enabled' && !profile.is_enabled) return false
    if (statusFilter === 'disabled' && profile.is_enabled) return false
    return true
  }), [profiles, roleFilter, search, statusFilter])

  const save = async (values: { full_name: string; username: string; password?: string; role: UserRole }) => {
    try {
      if (editing) await updateUser({ user_id: editing.id, full_name: values.full_name, username: values.username, role: values.role })
      else await createUser({ full_name: values.full_name, username: values.username, password: values.password!, role: values.role })
      setEditing(undefined)
      setMessage({ text: editing ? 'User updated.' : values.role === 'officer' ? 'Officer created. Assign at least one event before the account can see events.' : 'User created.', tone: 'success' })
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'User could not be saved.'), tone: 'error' }) }
  }
  const toggle = async (profile: Profile) => {
    const action = profile.is_enabled ? 'Disable' : 'Enable'
    if (!await confirm({ title: `${action} user?`, message: `${profile.full_name}'s account will be ${action.toLowerCase()}d.${profile.is_enabled ? ' Existing sessions will be revoked.' : ''}`, confirmLabel: `${action} user`, tone: profile.is_enabled ? 'danger' : 'primary' })) return
    try { await setUserEnabled(profile.id, !profile.is_enabled); setMessage({ text: profile.is_enabled ? 'User disabled.' : 'User enabled.', tone: 'success' }); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const forceLogout = async (profile: Profile) => {
    if (!await confirm({ title: 'Force sign out?', message: `${profile.full_name}'s active sessions will be revoked and they will need to sign in again.`, confirmLabel: 'Force sign out', tone: 'danger' })) return
    try { await forceUserLogout(profile.id); setMessage({ text: 'Session revoked.', tone: 'success' }); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const resetPassword = async (password: string) => {
    if (!resetTarget) return
    try { await resetUserPassword(resetTarget.id, password); setResetTarget(null); setMessage({ text: 'Password reset successfully.', tone: 'success' }) }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }

  if (loading) return <LoadingScreen />
  return <div className="space-y-5">
    <div className="page-header"><div><h1 className="page-title">Users</h1><p className="page-subtitle">Manage staff identities, roles, passwords, and sessions.</p></div><button className="btn-primary" onClick={() => { setMessage(null); setEditing(null) }}><Plus size={17} /> Create user</button></div>
    {message && <Alert message={message.text} tone={message.tone} />}
    <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search full name or username" /><select className="field max-w-48" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option><option value="super_admin">Super Admin</option><option value="faculty">Faculty</option><option value="officer">Officer</option></select><select className="field max-w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Event access</th><th>Status</th><th>Last Revocation</th><th>Actions</th></tr></thead><tbody>{filtered.map((profile) => <tr key={profile.id}><td><div className="font-medium">{profile.full_name}</div>{profile.id === currentProfile?.id && <div className="text-xs text-blue-700">Current account</div>}</td><td className="font-mono">{profile.username}</td><td className="capitalize">{profile.role.replace('_', ' ')}</td><td>{profile.role === 'super_admin' ? <span className="text-xs text-slate-500">All events</span> : <span className={`status-chip ${(assignmentCounts[profile.id] ?? 0) ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{assignmentCounts[profile.id] ?? 0} assigned</span>}</td><td>{profile.is_enabled ? <span className="status-chip bg-emerald-100 text-emerald-800"><ShieldCheck size={13} /> Enabled</span> : <span className="status-chip bg-red-100 text-red-800"><ShieldOff size={13} /> Disabled</span>}</td><td className="text-xs text-slate-500">{profile.session_revoked_at ? formatManilaDate(profile.session_revoked_at) : 'Never'}</td><td><div className="flex flex-wrap gap-2">{profile.role !== 'super_admin' && <button className="btn-secondary" onClick={() => navigate(`/events?assignUser=${profile.id}`)}><CalendarPlus size={14} /> Assign events</button>}<button className="btn-secondary" onClick={() => setEditing(profile)}><Pencil size={14} /> Edit</button><button className="btn-secondary" disabled={profile.id === currentProfile?.id} onClick={() => void toggle(profile)}>{profile.is_enabled ? 'Disable' : 'Enable'}</button><button className="btn-secondary" onClick={() => setResetTarget(profile)}><KeyRound size={14} /> Password</button><button className="btn-secondary" disabled={profile.id === currentProfile?.id} onClick={() => void forceLogout(profile)}><RotateCcw size={14} /> Force logout</button></div></td></tr>)}{!filtered.length && <tr><td colSpan={7}><EmptyState compact icon={Users} title="No users found" description="Try changing the search or filters." /></td></tr>}</tbody></table></div>
    {editing !== undefined && currentProfile && <UserFormModal user={editing} currentUserId={currentProfile.id} error={message?.tone === 'error' ? message.text : null} onClose={() => setEditing(undefined)} onSave={save} />}
    {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onReset={resetPassword} />}
  </div>
}
