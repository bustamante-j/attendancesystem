import { CalendarPlus, KeyRound, LockKeyhole, Pencil, Plus, RotateCcw, ShieldOff, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../features/auth/AuthProvider'
import { ResetPasswordModal } from '../features/users/ResetPasswordModal'
import { UserFormModal } from '../features/users/UserFormModal'
import { friendlyError } from '../lib/errors'
import { listEventAssignmentCounts } from '../services/events'
import { createUser, deleteUser, forceUserLogout, listProfiles, resetUserPassword, setUserEnabled, updateUser } from '../services/users'
import type { Profile, UserRole } from '../types/app'
import { formatManilaDate } from '../utils/dates'

export function UsersPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const { profile: currentProfile } = useAuth()
  const isSuperAdmin = currentProfile?.role === 'super_admin'
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
  const remove = async (target: Profile) => {
    if (!currentProfile || target.role === 'super_admin' || target.id === currentProfile.id) return
    if (currentProfile.role === 'admin' && target.role === 'admin') return
    if (!await confirm({
      title: 'Delete user?',
      message: `${target.full_name}'s sign-in access will be permanently removed. Historical attendance and audit records will remain intact.`,
      confirmLabel: 'Delete user',
      tone: 'danger',
    })) return
    try {
      const result = await deleteUser(target.id)
      setMessage({ text: result.warning ?? 'User deleted.', tone: 'success' })
      await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'User could not be deleted.'), tone: 'error' }) }
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">
            {isSuperAdmin
              ? 'Staff identities, roles, passwords, and sessions.'
              : 'Manage Faculty and Officer access. The Super Admin stays protected.'}
          </p>
        </div>
        {isSuperAdmin && <button className="btn-primary" onClick={() => { setMessage(null); setEditing(null) }}><Plus size={15} /> Create user</button>}
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or username" />
        <select className="field w-auto min-w-32" aria-label="Filter users by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
          <option value="all">All roles</option>
          <option value="super_admin">Super Admin</option>
          <option value="admin">Admin</option>
          <option value="faculty">Faculty</option>
          <option value="officer">Officer</option>
        </select>
        <select className="field w-auto min-w-32" aria-label="Filter users by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>

      <div className="table-shell">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Event access</th>
                <th>Status</th>
                <th className="w-12" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => {
                const isProtected = profile.role === 'super_admin'
                const isSelf = profile.id === currentProfile?.id
                const adminPeer = currentProfile?.role === 'admin' && profile.role === 'admin'
                const canDelete = !isProtected && !adminPeer && !isSelf
                const scoped = profile.role === 'faculty' || profile.role === 'officer'
                const assigned = assignmentCounts[profile.id] ?? 0
                return (
                  <tr key={profile.id}>
                    <td>
                      <div className="cell-title">
                        {profile.full_name}
                        {isSelf && <span className="ml-2 text-meta font-normal text-muted">You</span>}
                      </div>
                      <div className="cell-meta font-mono">{profile.username}</div>
                    </td>
                    <td>
                      <span className="capitalize text-ink">{profile.role.replace('_', ' ')}</span>
                      {isProtected && (
                        <div className="cell-meta inline-flex items-center gap-1">
                          <LockKeyhole size={11} /> Protected
                        </div>
                      )}
                    </td>
                    <td>
                      {scoped
                        ? <span className={assigned ? 'text-ink' : 'text-warn-ink'}>{assigned} event{assigned === 1 ? '' : 's'}</span>
                        : <span className="text-muted">All events</span>}
                    </td>
                    <td>
                      <StatusBadge tone={profile.is_enabled ? 'ok' : 'bad'}>{profile.is_enabled ? 'Enabled' : 'Disabled'}</StatusBadge>
                      {profile.session_revoked_at && (
                        <div className="cell-meta">Revoked {formatManilaDate(profile.session_revoked_at)}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <ActionMenu
                          label={`Actions for ${profile.full_name}`}
                          items={[
                            scoped && { icon: CalendarPlus, label: 'Assign events', onSelect: () => navigate(`/events?assignUser=${profile.id}`) },
                            isSuperAdmin && scoped && 'separator',
                            isSuperAdmin && { icon: Pencil, label: 'Edit details', onSelect: () => setEditing(profile) },
                            isSuperAdmin && { icon: KeyRound, label: 'Reset password', onSelect: () => setResetTarget(profile) },
                            isSuperAdmin && {
                              icon: ShieldOff,
                              label: profile.is_enabled ? 'Disable account' : 'Enable account',
                              disabled: isSelf || isProtected,
                              onSelect: () => void toggle(profile),
                            },
                            isSuperAdmin && {
                              icon: RotateCcw,
                              label: 'Force sign out',
                              disabled: isSelf,
                              onSelect: () => void forceLogout(profile),
                            },
                            canDelete && 'separator',
                            canDelete && { icon: Trash2, label: 'Delete user', danger: true, onSelect: () => void remove(profile) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState compact icon={Users} title="No users found" description="Try changing the search or filters." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== undefined && currentProfile && <UserFormModal user={editing} currentUserId={currentProfile.id} error={message?.tone === 'error' ? message.text : null} onClose={() => setEditing(undefined)} onSave={save} />}
      {resetTarget && <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} onReset={resetPassword} />}
    </div>
  )
}
