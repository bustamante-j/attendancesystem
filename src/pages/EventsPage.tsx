import { KeyRound, Pencil, Plus, ScanLine, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { Modal } from '../components/Modal'
import { SearchInput } from '../components/SearchInput'
import { EventFormModal } from '../features/events/EventFormModal'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { verifyEventPin } from '../services/attendance'
import { listDepartments } from '../services/departments'
import { assignUser, createEvent, expectedStudentCount, getEventAudience, listEventAssignments, listEvents, removeAssignment, resetEventPin, setEventStatus, softDeleteEvent, updateEvent, type EventAssignment, type EventInput } from '../services/events'
import { listProfiles } from '../services/users'
import type { Department, EventRecord, Profile } from '../types/app'
import { formatManilaDate } from '../utils/dates'

interface Audience { departmentIds: string[]; yearLevels: number[] }

export function EventsPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canManage = profile?.role === 'super_admin' || profile?.role === 'faculty'
  const isAdmin = profile?.role === 'super_admin'
  const [events, setEvents] = useState<EventRecord[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [audiences, setAudiences] = useState<Record<string, Audience>>({})
  const [formEvent, setFormEvent] = useState<EventRecord | null | undefined>(undefined)
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

  const load = useCallback(async () => {
    try {
      const [eventRows, departmentRows, profileRows] = await Promise.all([listEvents(), listDepartments(), isAdmin ? listProfiles() : Promise.resolve([])])
      setEvents(eventRows); setDepartments(departmentRows); setProfiles(profileRows)
      setSelectedEventId((current) => eventRows.some((event) => event.id === current) ? current : eventRows[0]?.id ?? '')
      const assignable = profileRows.filter((item) => item.is_enabled && item.role !== 'super_admin')
      setSelectedUserId((current) => assignable.some((item) => item.id === current) ? current : assignable[0]?.id ?? '')
      const metadata = await Promise.all(eventRows.map(async (event) => {
        const [count, audience] = await Promise.all([expectedStudentCount(event.id).catch(() => 0), getEventAudience(event.id).catch(() => ({ departmentIds: [], yearLevels: [] }))])
        return { id: event.id, count, audience }
      }))
      setCounts(Object.fromEntries(metadata.map((item) => [item.id, item.count])))
      setAudiences(Object.fromEntries(metadata.map((item) => [item.id, item.audience])))
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [isAdmin])
  const loadAssignments = useCallback(async () => {
    if (!selectedEventId || !isAdmin) { setAssignments([]); return }
    try { setAssignments(await listEventAssignments(selectedEventId)) }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }, [isAdmin, selectedEventId])
  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadAssignments() }, [loadAssignments])

  const visibleEvents = useMemo(() => events.filter((event) => {
    const needle = search.trim().toLowerCase()
    if (statusFilter !== 'all' && event.status !== statusFilter) return false
    return !needle || `${event.name} ${event.venue ?? ''}`.toLowerCase().includes(needle)
  }), [events, search, statusFilter])
  const departmentMap = useMemo(() => new Map(departments.map((item) => [item.id, item.code])), [departments])
  const selectedEvent = events.find((event) => event.id === selectedEventId)
  const assignableProfiles = profiles.filter((item) => item.is_enabled && item.role !== 'super_admin')

  const openCreate = () => { setFormAudience(null); setFormEvent(null) }
  const openEdit = (event: EventRecord) => { setFormAudience(audiences[event.id] ?? null); setFormEvent(event) }
  const saveEvent = async (input: EventInput) => {
    try {
      if (formEvent) await updateEvent(formEvent.id, input, formEvent.status)
      else {
        const result = await createEvent(input)
        setPinResult({ event: input.name, pin: result.pin })
      }
      setMessage({ text: formEvent ? 'Event updated.' : 'Event created as a draft.', tone: 'success' })
      setFormEvent(undefined); setFormAudience(null); await load()
    } catch (cause) { setMessage({ text: friendlyError(cause, 'Event could not be saved.'), tone: 'error' }) }
  }
  const changeStatus = async (event: EventRecord, status: 'draft' | 'open' | 'closed') => {
    if (!window.confirm(`${status === 'open' ? 'Open' : status === 'closed' ? 'Close' : 'Return'} ${event.name}${status === 'draft' ? ' to draft' : ''}?`)) return
    try { await setEventStatus(event.id, status); setMessage({ text: `Event is now ${status}.`, tone: 'success' }); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const remove = async (event: EventRecord) => {
    if (!window.confirm(`Soft delete ${event.name}? Attendance history will remain intact.`)) return
    try { await softDeleteEvent(event.id); await load() }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
  }
  const resetPin = async (event: EventRecord) => {
    if (!window.confirm(`Reset the PIN for ${event.name}? Current event access grants will be revoked.`)) return
    try { const result = await resetEventPin(event.id); setPinResult({ event: event.name, pin: result.pin }) }
    catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
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
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{profile?.role === 'officer' ? 'Assigned Events' : 'Events'}</h1><p className="mt-1 text-sm text-slate-500">Schedules and attendance windows use Asia/Manila.</p></div>{canManage && <button className="btn-primary" onClick={openCreate}><Plus size={17} /> Create event</button>}</div>
    {message && <Alert message={message.text} tone={message.tone} />}
    <div className="panel flex flex-wrap gap-3 p-4"><SearchInput value={search} onChange={setSearch} placeholder="Search event or venue" /><select className="field max-w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="draft">Draft</option><option value="open">Open</option><option value="closed">Closed</option></select></div>
    {!!events.length && <div className="panel"><h2 className="font-semibold">Event PIN access</h2><p className="mt-1 text-sm text-slate-500">Assigned staff enter the current PIN before processing attendance.</p><div className="mt-3 flex flex-wrap gap-3"><select className="field max-w-sm" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name} ({event.status})</option>)}</select><input className="field max-w-40" inputMode="numeric" maxLength={6} placeholder="6-digit PIN" value={accessPin} onChange={(event) => setAccessPin(event.target.value.replace(/\D/g, ''))} /><button className="btn-secondary" disabled={accessPin.length !== 6} onClick={() => void grantAccess()}>Verify PIN</button></div></div>}
    {isAdmin && !!events.length && <div className="panel"><div className="flex items-center gap-2"><UserPlus size={18} /><h2 className="font-semibold">Scanner assignments</h2></div><div className="mt-3 flex flex-wrap gap-3"><select className="field max-w-sm" value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select><select className="field max-w-sm" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>{assignableProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name} ({item.role})</option>)}</select><button className="btn-primary" disabled={!selectedUserId} onClick={() => void addAssignment()}>Assign scanner</button></div><div className="mt-4 flex flex-wrap gap-2">{assignments.map((assignment) => { const creator = assignment.user_id === selectedEvent?.created_by; return <span key={assignment.user_id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">{assignment.profiles?.full_name ?? assignment.user_id}{creator && <span className="text-xs text-slate-500">creator</span>}{!creator && <button className="text-red-700" onClick={() => void deleteAssignment(assignment)} aria-label="Remove assignment">×</button>}</span> })}{!assignments.length && <span className="text-sm text-slate-500">No assignments.</span>}</div></div>}
    <div className="table-wrap"><table><thead><tr><th>Event</th><th>Audience</th><th>Schedule</th><th>Mode</th><th>Status</th><th>Expected</th><th>Scanner</th>{canManage && <th>Actions</th>}</tr></thead><tbody>{visibleEvents.map((event) => { const audience = audiences[event.id]; return <tr key={event.id}><td><div className="font-medium">{event.name}</div><div className="text-xs text-slate-500">{event.venue || 'No venue'}</div></td><td><div className="flex flex-wrap gap-1">{audience?.departmentIds.map((id) => <span key={id} className="rounded bg-slate-100 px-2 py-1 text-xs">{departmentMap.get(id) ?? 'Unknown'}</span>)}</div><div className="mt-1 text-xs text-slate-500">{audience?.yearLevels.length ? `Years ${audience.yearLevels.join(', ')}` : 'All year levels'}</div></td><td>{formatManilaDate(event.start_at)}<div className="text-xs text-slate-500">to {formatManilaDate(event.end_at)}</div></td><td>{event.attendance_mode === 'check_in_out' ? 'Check-in/out' : 'Check-in only'}</td><td><span className={`rounded-full px-2 py-1 text-xs capitalize ${event.status === 'open' ? 'bg-emerald-100 text-emerald-800' : event.status === 'closed' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{event.status}</span></td><td>{counts[event.id] ?? 0}</td><td><button className="btn-primary" disabled={event.status !== 'open'} onClick={() => navigate(`/events/${event.id}/scanner`)}><ScanLine size={15} /> Scan</button></td>{canManage && <td><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={() => openEdit(event)}><Pencil size={14} /> Edit</button><button className="btn-secondary" onClick={() => void resetPin(event)}><KeyRound size={14} /> Reset PIN</button>{event.status !== 'open' && <button className="btn-secondary" onClick={() => void changeStatus(event, 'open')}>Open</button>}{event.status !== 'closed' && <button className="btn-secondary" onClick={() => void changeStatus(event, 'closed')}>Close</button>}<button className="btn-danger" onClick={() => void remove(event)}><Trash2 size={14} /></button></div></td>}</tr>})}{!visibleEvents.length && <tr><td colSpan={canManage ? 8 : 7} className="py-10 text-center text-slate-500">No events match the filters.</td></tr>}</tbody></table></div>
    {formEvent !== undefined && <EventFormModal event={formEvent} audience={formAudience} departments={departments} onClose={() => { setFormEvent(undefined); setFormAudience(null) }} onSave={saveEvent} />}
    {pinResult && <Modal title={`PIN for ${pinResult.event}`} onClose={() => setPinResult(null)} size="md"><div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-center"><p className="text-sm text-amber-900">This plaintext PIN is shown once. Only its secure hash is stored.</p><div className="my-5 font-mono text-4xl font-bold tracking-[0.35em]">{pinResult.pin}</div><button className="btn-primary" onClick={() => setPinResult(null)}>I have saved the PIN</button></div></Modal>}
  </div>
}
