import { KeyRound, Pencil, Plus, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { useAuth } from '../features/auth/AuthProvider'
import { ResetPasswordModal } from '../features/users/ResetPasswordModal'
import { UserFormModal } from '../features/users/UserFormModal'
import { friendlyError } from '../lib/errors'
import { createUser, forceUserLogout, listProfiles, resetUserPassword, setUserEnabled, updateUser } from '../services/users'
import type { Profile, UserRole } from '../types/app'
import { formatManilaDate } from '../utils/dates'

export function UsersPage() {
  const { profile: currentProfile } = useAuth()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editing, setEditing] = useState<Profile | null | undefined>(undefined)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)
  const load = useCallback(async () => {
    try { setProfiles(await listProfiles()) }
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
      setEditing(undefined); setMessage({ text: editing ? 'User updated.' : 'User created.', tone: 'success' }); await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'User could not be saved.'), tone: 'error' }) }
  }
  const toggle = async (profile: Profile) => {
    if (!window.confirm(`${profile.is_enabled ? 'Disable' : 'Enable'} ${profile.full_name}?${profile.is_enabled ? ' Existing sessions will be revoked.' : ''}`)) return
    try { await setUserEnabled(profile.id, !profile.is_enabled); setMessage({ text: profile.is_enabled ? 'User disabled.' : 'User enabled.', tone: 'success' }); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const forceLogout = async (profile: Profile) => {
    if (!window.confirm(`Force ${profile.full_name} to sign in again?`)) return
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
    <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">Users</h1><p className="mt-1 text-sm text-slate-500">Manage staff identities, roles, passwords, and sessions.</p></div><button className="btn-primary" onClick={() => { setMessage(null); setEditing(null) }}><Plus size={17} /> Create user</button></div>
    {message && <Alert message={message.text} tone={message.tone} />}
    <div className="panel flex flex-wrap gap-3 p-4"><SearchInput value={search} onChange={setSearch} placeholder="Search full name or username" /><select className="field max-w-48" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option><option value="super_admin">Super Admin</option><option value="faculty">Faculty</option><option value="officer">Officer</option></select><select className="field max-w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>User</th><th>Username</th><th>Role</th><th>Status</th><th>Last Revocation</th><th>Actions</th></tr></thead><tbody>{filtered.map((profile) => <tr key={profile.id}><td><div className="font-medium">{profile.full_name}</div>{profile.id === currentProfile?.id && <div className="text-xs text-blue-700">Current account</div>}</td><td className="font-mono">{profile.username}</td><td className="capitalize">{profile.role.replace('_', ' ')}</td><td>{profile.is_enabled ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800"><ShieldCheck size={13} /> Enabled</span> : <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs text-red-800"><ShieldOff size={13} /> Disabled</span>}</td><td className="text-xs text-slate-500">{profile.session_revoked_at ? formatManilaDate(profile.session_revoked_at) : 'Never'}</td><td><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => setEditing(profile)}><Pencil size={14} /> Edit</button><button className="btn-secondary" disabled={profile.id === currentProfile?.id} onClick={() => void toggle(profile)}>{profile.is_enabled ? 'Disable' : 'Enable'}</button><button className="btn-secondary" onClick={() => setResetTarget(profile)}><KeyRound size={14} /> Password</button><button className="btn-secondary" disabled={profile.id === currentProfile?.id} onClick={() => void forceLogout(profile)}><RotateCcw size={14} /> Force logout</button></div></td></tr>)}{!filtered.length && <tr><td colSpan={6} className="py-10 text-center text-slate-500">No users match the filters.</td></tr>}</tbody></table></div>
    {editing !== undefined && currentProfile && <UserFormModal user={editing} currentUserId={currentProfile.id} error={message?.tone === 'error' ? message.text : null} onClose={() => setEditing(undefined)} onSave={save} />}
    {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onReset={resetPassword} />}
  </div>
}
