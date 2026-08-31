import { CalendarX2, Copy, Eye, KeyRound, Pencil, Plus, ScanLine, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { Modal } from '../components/Modal'
import { SearchInput } from '../components/SearchInput'
import { EventFormModal } from '../features/events/EventFormModal'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { getAttendanceSummary, subscribeToAttendance, verifyEventPin } from '../services/attendance'
import { listDepartments } from '../services/departments'
import { assignUser, createEvent, getEventAudience, listEventAssignments, listEvents, removeAssignment, resetEventPin, setEventStatus, softDeleteEvent, updateEvent, viewEventPin, type EventAssignment, type EventInput } from '../services/events'
import { listProfiles } from '../services/users'
import type { AttendanceSummary, Department, EventRecord, Profile } from '../types/app'
import { formatManilaDate } from '../utils/dates'

interface Audience { departmentIds: string[]; yearLevels: number[] }

export function EventsPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedAssignee = searchParams.get('assignUser')
  const { profile } = useAuth()
  const canManage = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'faculty'
  const canAssign = profile?.role === 'super_admin' || profile?.role === 'admin'
  const canViewPin = profile?.role === 'super_admin'
  const [events, setEvents] = useState<EventRecord[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [progress, setProgress] = useState<Record<string, AttendanceSummary>>({})
  const [audiences, setAudiences] = useState<Record<string, Audience>>({})
  const [formEvent, setFormEvent] = useState<EventRecord | null | undefined>(undefined)
  const [formAction, setFormAction] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [formAudience, setFormAudience] = useState<Audience | null>(null)
  const [pinResult, setPinResult] = useState<{ event: string; pin: string } | null>(null)
  const [selectedEventId, setSelectedEventId] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [assignments, setAssignments] = useState<EventAssignment[]>([])
  const [accessPin, setAccessPin] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'success' | 'info' } | null>(null)

  const refreshProgress = useCallback(async (eventRows: EventRecord[]) => {
    const summaries = await Promise.all(eventRows.map(async (event) => {
      try { return [event.id, await getAttendanceSummary(event.id)] as const }
      catch { return null }
    }))
    const updates = Object.fromEntries(summaries.filter((item): item is readonly [string, AttendanceSummary] => item !== null))
    if (Object.keys(updates).length) setProgress((current) => ({ ...current, ...updates }))
  }, [])

  const load = useCallback(async () => {
    try {
      const [eventRows, departmentRows, profileRows] = await Promise.all([listEvents(), listDepartments(), canAssign ? listProfiles() : Promise.resolve([])])
      setEvents(eventRows); setDepartments(departmentRows); setProfiles(profileRows)
      setSelectedEventId((current) => eventRows.some((event) => event.id === current) ? current : eventRows[0]?.id ?? '')
      const assignable = profileRows.filter((item) => item.is_enabled && item.role !== 'super_admin' && item.role !== 'admin')
      setSelectedUserId((current) => requestedAssignee && assignable.some((item) => item.id === requestedAssignee)
        ? requestedAssignee
        : assignable.some((item) => item.id === current) ? current : assignable[0]?.id ?? '')
      const metadata = await Promise.all(eventRows.map(async (event) => {
        const [summary, audience] = await Promise.all([getAttendanceSummary(event.id).catch(() => null), getEventAudience(event.id).catch(() => ({ departmentIds: [], yearLevels: [] }))])
        return { id: event.id, summary, audience }
      }))
      setProgress(Object.fromEntries(metadata.filter((item) => item.summary).map((item) => [item.id, item.summary as AttendanceSummary])))
      setAudiences(Object.fromEntries(metadata.map((item) => [item.id, item.audience])))
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [canAssign, requestedAssignee])
  const loadAssignments = useCallback(async () => {
    if (!selectedEventId || !canAssign) { setAssignments([]); return }
    try { setAssignments(await listEventAssignments(selectedEventId)) }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }, [canAssign, selectedEventId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadAssignments() }, [loadAssignments])
  useEffect(() => {
    let timer: number | undefined
    const unsubscribe = subscribeToAttendance(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { void refreshProgress(events) }, 600)
    })
    return () => { unsubscribe(); window.clearTimeout(timer) }
  }, [events, refreshProgress])

  const visibleEvents = useMemo(() => events.filter((event) => {
    const needle = search.trim().toLowerCase()
    if (statusFilter !== 'all' && event.status !== statusFilter) return false
    return !needle || `${event.name} ${event.venue ?? ''}`.toLowerCase().includes(needle)
  }), [events, search, statusFilter])
  const departmentMap = useMemo(() => new Map(departments.map((item) => [item.id, item.code])), [departments])
  const selectedEvent = events.find((event) => event.id === selectedEventId)
  const assignableProfiles = profiles.filter((item) => item.is_enabled && item.role !== 'super_admin' && item.role !== 'admin')

  const openCreate = () => { setFormAction('create'); setFormAudience(null); setFormEvent(null) }
  const openEdit = (event: EventRecord) => { setFormAction('edit'); setFormAudience(audiences[event.id] ?? null); setFormEvent(event) }
  const openDuplicate = (event: EventRecord) => { setFormAction('duplicate'); setFormAudience(audiences[event.id] ?? null); setFormEvent(event) }
  const saveEvent = async (input: EventInput) => {
    try {
      if (formEvent && formAction === 'edit') await updateEvent(formEvent.id, input, formEvent.status)
      else {
        const result = await createEvent(input)
        setPinResult({ event: input.name, pin: result.pin })
      }
      setMessage({ text: formAction === 'edit' ? 'Event updated.' : formAction === 'duplicate' ? 'Duplicate event created as a draft.' : 'Event created as a draft.', tone: 'success' })
      setFormEvent(undefined); setFormAudience(null); await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Event could not be saved.'), tone: 'error' }) }
  }
  const changeStatus = async (event: EventRecord, status: 'draft' | 'open' | 'closed') => {
    const action = status === 'open' ? 'Open' : status === 'closed' ? 'Close' : 'Return to draft'
    if (!await confirm({ title: `${action} event?`, message: `${event.name} will be set to ${status}.`, confirmLabel: action, tone: status === 'closed' ? 'danger' : 'primary' })) return
    try { await setEventStatus(event.id, status); setMessage({ text: `Event is now ${status}.`, tone: 'success' }); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const remove = async (event: EventRecord) => {
    if (!await confirm({ title: 'Delete event?', message: `${event.name} will be removed from active views. Its attendance history will remain intact.`, confirmLabel: 'Delete event', tone: 'danger' })) return
    try { await softDeleteEvent(event.id); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const resetPin = async (event: EventRecord) => {
    if (!await confirm({ title: 'Reset event PIN?', message: `Current PIN access grants for ${event.name} will be revoked immediately.`, confirmLabel: 'Reset PIN', tone: 'danger' })) return
    try { const result = await resetEventPin(event.id); setPinResult({ event: event.name, pin: result.pin }) }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const showPin = async (event: EventRecord) => {
    try {
      const result = await viewEventPin(event.id)
      setPinResult({ event: event.name, pin: result.pin })
      setMessage(null)
    } catch (cause) {
      setMessage({ text: friendlyError(cause, 'The event PIN could not be viewed.'), tone: 'error' })
    }
  }
  const addAssignment = async () => {
    if (!selectedEventId || !selectedUserId || !profile) return
    try { await assignUser(selectedEventId, selectedUserId, profile.id); setMessage({ text: 'Scanner assignment added.', tone: 'success' }); await loadAssignments() }
    catch (cause) { setMessage({ text: friendlyError(cause, 'The user may already be assigned.'), tone: 'error' }) }
  }
  const deleteAssignment = async (assignment: EventAssignment) => {
    if (assignment.user_id === selectedEvent?.created_by) return
    try { await removeAssignment(assignment.event_id, assignment.user_id); await loadAssignments() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const grantAccess = async () => {
    if (!selectedEventId || accessPin.length !== 6) return
    try {
      const result = await verifyEventPin(selectedEventId, accessPin)
      setMessage({ text: result.message, tone: result.code === 'success' ? 'success' : 'error' })
      if (result.code === 'success') setAccessPin('')
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }

  if (loading) return <LoadingScreen />
  return <div className="space-y-5">
    <div className="page-header"><div><h1 className="page-title">{profile?.role === 'officer' ? 'Assigned Events' : 'Events'}</h1><p className="page-subtitle">Schedules and attendance windows use Asia/Manila.</p></div>{canManage && <button className="btn-primary" onClick={openCreate}><Plus size={17} /> Create event</button>}</div>
    {message && <Alert message={message.text} tone={message.tone} />}
    <div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Search event or venue" /><select className="field max-w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></div>
    {!!events.length && <div className="panel"><h2 className="font-semibold">Event PIN access</h2><p className="mt-1 text-sm text-slate-500">Assigned staff enter the current PIN before processing attendance.</p><div className="mt-3 flex flex-wrap gap-3"><select className="field max-w-sm" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.status})</option>)}</select><input className="field max-w-40" inputMode="numeric" maxLength={6} placeholder="6-digit PIN" value={accessPin} onChange={(event) => setAccessPin(event.target.value.replace(/\D/g, ''))} /><button className="btn-secondary" disabled={accessPin.length !== 6} onClick={() => void grantAccess()}>Verify PIN</button></div></div>}
    {canAssign && !!events.length && <div className={`panel ${requestedAssignee ? 'ring-2 ring-blue-300' : ''}`}><div className="flex items-center gap-2"><UserPlus size={18} /><h2 className="font-semibold">Scanner assignments</h2></div><p className="mt-1 text-sm text-slate-500">Officers only see events they are assigned to. Choose both an event and staff account, then assign access.</p><div className="mt-3 flex flex-wrap gap-3"><select className="field max-w-sm" aria-label="Event for scanner assignment" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select><select className="field max-w-sm" aria-label="Staff account to assign" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{assignableProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.role})</option>)}</select><button className="btn-primary" disabled={!selectedUserId || assignments.some((assignment) => assignment.user_id === selectedUserId)} onClick={() => void addAssignment()}>{assignments.some((assignment) => assignment.user_id === selectedUserId) ? 'Already assigned' : 'Assign scanner'}</button></div><div className="mt-4 flex flex-wrap gap-2">{assignments.map((assignment) => { const creator = assignment.user_id === selectedEvent?.created_by; return <span key={assignment.user_id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">{assignment.profiles?.full_name ?? assignment.user_id}{creator && <span className="text-xs text-slate-500">creator</span>}{!creator && <button className="text-red-700" onClick={() => void deleteAssignment(assignment)} aria-label="Remove assignment">×</button>}</span> })}{!assignments.length && <span className="text-sm text-slate-500">No staff assigned yet.</span>}</div></div>}
    <div className="table-wrap"><table><thead><tr><th>Event</th><th>Audience</th><th>Schedule</th><th>Mode</th><th>Status</th><th>Attendance progress</th><th>Scanner</th>{canManage && <th>Actions</th>}</tr></thead><tbody>{visibleEvents.map((event) => { const audience = audiences[event.id]; const summary = progress[event.id]; const expected = summary?.expected ?? 0; const checkedIn = summary?.checkedIn ?? 0; const rate = expected ? Math.min(100, Math.round((checkedIn / expected) * 100)) : 0; return <tr key={event.id}><td><div className="font-medium">{event.name}</div><div className="text-xs text-slate-500">{event.venue || 'No venue'}</div></td><td><div className="flex flex-wrap gap-1">{audience?.departmentIds.map((id) => <span key={id} className="rounded bg-slate-100 px-2 py-1 text-xs">{departmentMap.get(id) ?? 'Unknown'}</span>)}</div><div className="mt-1 text-xs text-slate-500">{audience?.yearLevels.length ? `Years ${audience.yearLevels.join(', ')}` : 'All year levels'}</div></td><td>{formatManilaDate(event.start_at)}<div className="text-xs text-slate-500">to {formatManilaDate(event.end_at)}</div></td><td>{event.attendance_mode === 'check_in_out' ? 'Check-in/out' : 'Check-in only'}</td><td><span className={`status-chip capitalize ${event.status === 'open' ? 'bg-emerald-100 text-emerald-800' : event.status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{event.status}</span></td><td><div className="min-w-40"><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-700">{checkedIn.toLocaleString()} / {expected.toLocaleString()}</span><span className="font-semibold text-slate-500">{rate}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${rate}%` }} /></div></div></td><td><button className="btn-primary" disabled={event.status !== 'open'} onClick={() => navigate(`/events/${event.id}/scanner`)}><ScanLine size={15} /> Scan</button></td>{canManage && <td><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => openEdit(event)}><Pencil size={14} /> Edit</button><button className="btn-secondary" onClick={() => openDuplicate(event)}><Copy size={14} /> Duplicate</button>{canViewPin && <button className="btn-secondary" onClick={() => void showPin(event)}><Eye size={14} /> View PIN</button>}<button className="btn-secondary" onClick={() => void resetPin(event)}><KeyRound size={14} /> Reset PIN</button>{event.status !== 'open' && <button className="btn-secondary" onClick={() => void changeStatus(event, 'open')}>Open</button>}{event.status !== 'closed' && <button className="btn-secondary" onClick={() => void changeStatus(event, 'closed')}>Close</button>}<button className="btn-danger" onClick={() => void remove(event)} aria-label={`Delete ${event.name}`}><Trash2 size={14} /></button></div></td>}</tr>})}{!visibleEvents.length && <tr><td colSpan={canManage ? 8 : 7}><EmptyState compact icon={CalendarX2} title={profile?.role === 'officer' && !events.length ? 'No assigned events' : 'No events found'} description={profile?.role === 'officer' && !events.length ? 'Ask a Super Admin to assign this account from the Events page.' : 'Try another search or status filter.'} /></td></tr>}</tbody></table></div>
    {formEvent !== undefined && <EventFormModal event={formEvent} audience={formAudience} departments={departments} duplicate={formAction === 'duplicate'} onClose={() => { setFormEvent(undefined); setFormAudience(null) }} onSave={saveEvent} />}
    {pinResult && <Modal title={`PIN for ${pinResult.event}`} onClose={() => setPinResult(null)} size="md"><div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-center dark:border-amber-700 dark:bg-amber-950/50"><p className="text-sm text-amber-900 dark:text-amber-100">Stored encrypted. Only a Super Admin can view this PIN again.</p><div className="my-5 font-mono text-4xl font-bold tracking-[0.35em]">{pinResult.pin}</div><button className="btn-primary" onClick={() => setPinResult(null)}>Done</button></div></Modal>}
  </div>
}
