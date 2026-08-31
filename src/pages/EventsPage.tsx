import { CalendarX2, ClipboardList, Copy, Eye, History, KeyRound, LockKeyhole, Pencil, Plus, ScanLine, Trash2, Unlock, UserPlus } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ActionMenu } from '../components/ActionMenu'
import { Alert } from '../components/Alert'
import { useConfirm } from '../components/ConfirmDialog'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { SearchInput } from '../components/SearchInput'
import { StatusBadge, type StatusTone } from '../components/StatusBadge'
import { EventAssignmentsModal } from '../features/events/EventAssignmentsModal'
import { EventPinRevealModal, EventPinVerifyModal } from '../features/events/EventPinModals'
import { EventFormModal } from '../features/events/EventFormModal'
import { useAuth } from '../features/auth/AuthProvider'
import { friendlyError } from '../lib/errors'
import { getAttendanceSummary, subscribeToAttendance } from '../services/attendance'
import { listDepartments } from '../services/departments'
import { createEvent, getEventAudience, listEvents, resetEventPin, setEventStatus, softDeleteEvent, updateEvent, viewEventPin, type EventInput } from '../services/events'
import { listProfiles } from '../services/users'
import type { AttendanceSummary, Department, EventRecord, EventStatus, Profile } from '../types/app'
import { formatManilaDate } from '../utils/dates'

interface Audience { departmentIds: string[]; yearLevels: number[] }

const HistoricalEventModal = lazy(() => import('../features/events/HistoricalEventModal').then((module) => ({ default: module.HistoricalEventModal })))

const statusTone: Record<EventStatus, StatusTone> = { open: 'ok', draft: 'warn', closed: 'neutral' }

export function EventsPage() {
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestedAssignee = searchParams.get('assignUser')
  const { profile } = useAuth()
  const canManage = profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'faculty'
  const canAssign = profile?.role === 'super_admin' || profile?.role === 'admin'
  const canViewPin = profile?.role === 'super_admin'
  const canCreateHistorical = profile?.role === 'super_admin' || profile?.role === 'admin'
  const [events, setEvents] = useState<EventRecord[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [progress, setProgress] = useState<Record<string, AttendanceSummary>>({})
  const [audiences, setAudiences] = useState<Record<string, Audience>>({})
  const [formEvent, setFormEvent] = useState<EventRecord | null | undefined>(undefined)
  const [formAction, setFormAction] = useState<'create' | 'edit' | 'duplicate'>('create')
  const [formAudience, setFormAudience] = useState<Audience | null>(null)
  const [historicalOpen, setHistoricalOpen] = useState(false)
  const [pinResult, setPinResult] = useState<{ event: string; pin: string } | null>(null)
  const [verifyEvent, setVerifyEvent] = useState<EventRecord | null>(null)
  const [assignmentsEvent, setAssignmentsEvent] = useState<EventRecord | null>(null)
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
      const metadata = await Promise.all(eventRows.map(async (event) => {
        const [summary, audience] = await Promise.all([getAttendanceSummary(event.id).catch(() => null), getEventAudience(event.id).catch(() => ({ departmentIds: [], yearLevels: [] }))])
        return { id: event.id, summary, audience }
      }))
      setProgress(Object.fromEntries(metadata.filter((item) => item.summary).map((item) => [item.id, item.summary as AttendanceSummary])))
      setAudiences(Object.fromEntries(metadata.map((item) => [item.id, item.audience])))
    } catch (cause) { setMessage({ text: friendlyError(cause), tone: 'error' }) }
    finally { setLoading(false) }
  }, [canAssign])
  useEffect(() => { void load() }, [load])

  // Deep link from the Users page opens that event's assignment dialog directly.
  useEffect(() => {
    if (!requestedAssignee || !canAssign || !events.length) return
    setAssignmentsEvent((current) => current ?? events[0])
  }, [canAssign, events, requestedAssignee])

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
  const changeStatus = async (event: EventRecord, status: EventStatus) => {
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

  if (loading) return <LoadingScreen />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{profile?.role === 'officer' ? 'Assigned events' : 'Events'}</h1>
          <p className="page-subtitle">Schedules and attendance windows use Asia/Manila.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {canCreateHistorical && <button className="btn-secondary" onClick={() => setHistoricalOpen(true)}><History size={15} /> Add completed event</button>}
            <button className="btn-primary" onClick={openCreate}><Plus size={15} /> Create event</button>
          </div>
        )}
      </header>

      {message && <Alert message={message.text} tone={message.tone} />}

      <div className="filter-bar">
        <SearchInput value={search} onChange={setSearch} placeholder="Search event or venue" />
        <select className="field w-auto min-w-32" aria-label="Filter events by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="table-shell">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Audience</th>
                <th>Schedule</th>
                <th className="min-w-40">Attendance</th>
                <th>Status</th>
                <th className="w-px" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visibleEvents.map((event) => {
                const audience = audiences[event.id]
                const summary = progress[event.id]
                const expected = summary?.expected ?? 0
                const checkedIn = summary?.checkedIn ?? 0
                const rate = expected ? Math.min(100, Math.round((checkedIn / expected) * 100)) : 0
                const codes = audience?.departmentIds.map((id) => departmentMap.get(id) ?? '?') ?? []
                return (
                  <tr key={event.id}>
                    <td className="max-w-64">
                      <div className="cell-title truncate">{event.name}</div>
                      <div className="cell-meta truncate">
                        {event.venue || 'No venue'}
                        {event.is_historical && <span className="ml-2 text-accent-ink">Historical</span>}
                      </div>
                    </td>
                    <td>
                      <div className="text-ink">{codes.length ? codes.join(', ') : 'All departments'}</div>
                      <div className="cell-meta">{audience?.yearLevels.length ? `Years ${audience.yearLevels.join(', ')}` : 'All years'}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="text-ink">{formatManilaDate(event.start_at)}</div>
                      <div className="cell-meta">to {formatManilaDate(event.end_at)}</div>
                    </td>
                    <td>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="tabular-nums text-ink">{checkedIn.toLocaleString()} / {expected.toLocaleString()}</span>
                        <span className="text-meta tabular-nums text-muted">{rate}%</span>
                      </div>
                      <div className="meter"><div className="meter-fill" style={{ width: `${rate}%` }} /></div>
                    </td>
                    <td><StatusBadge tone={statusTone[event.status]}>{event.status}</StatusBadge></td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link className="btn-secondary btn-sm" to={`/events/${event.id}/attendance`}>
                          <ClipboardList size={14} /> Roster
                        </Link>
                        {!event.is_historical && event.status === 'open' && (
                          <button className="btn-primary btn-sm" onClick={() => navigate(`/events/${event.id}/scanner`)}>
                            <ScanLine size={14} /> Scan
                          </button>
                        )}
                        <ActionMenu
                          label={`Actions for ${event.name}`}
                          items={[
                            canManage && { icon: Pencil, label: 'Edit event', onSelect: () => openEdit(event) },
                            canManage && { icon: Copy, label: 'Duplicate event', onSelect: () => openDuplicate(event) },
                            canAssign && { icon: UserPlus, label: 'Scanner assignments', onSelect: () => setAssignmentsEvent(event) },
                            !event.is_historical && 'separator',
                            !event.is_historical && { icon: LockKeyhole, label: 'Verify PIN', onSelect: () => setVerifyEvent(event) },
                            canViewPin && !event.is_historical && { icon: Eye, label: 'View PIN', onSelect: () => void showPin(event) },
                            canManage && !event.is_historical && { icon: KeyRound, label: 'Reset PIN', onSelect: () => void resetPin(event) },
                            canManage && 'separator',
                            canManage && !event.is_historical && event.status !== 'open' && {
                              icon: Unlock, label: 'Open event', onSelect: () => void changeStatus(event, 'open'),
                            },
                            canManage && event.status !== 'closed' && {
                              icon: LockKeyhole, label: 'Close event', onSelect: () => void changeStatus(event, 'closed'),
                            },
                            canManage && 'separator',
                            canManage && { icon: Trash2, label: 'Delete event', danger: true, onSelect: () => void remove(event) },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!visibleEvents.length && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      compact
                      icon={CalendarX2}
                      title={profile?.role === 'officer' && !events.length ? 'No assigned events' : 'No events found'}
                      description={profile?.role === 'officer' && !events.length
                        ? 'Ask a Super Admin to assign this account from the Events page.'
                        : 'Try another search or status filter.'}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formEvent !== undefined && (
        <EventFormModal
          event={formEvent}
          audience={formAudience}
          departments={departments}
          duplicate={formAction === 'duplicate'}
          onClose={() => { setFormEvent(undefined); setFormAudience(null) }}
          onSave={saveEvent}
        />
      )}
      {historicalOpen && (
        <Suspense fallback={<LoadingScreen label="Opening completed event form…" />}>
          <HistoricalEventModal
            departments={departments}
            onClose={() => setHistoricalOpen(false)}
            onCreated={async (text) => { setHistoricalOpen(false); setMessage({ text, tone: 'success' }); await load() }}
          />
        </Suspense>
      )}
      {assignmentsEvent && profile && (
        <EventAssignmentsModal
          eventRecord={assignmentsEvent}
          profiles={profiles}
          actorId={profile.id}
          onClose={() => setAssignmentsEvent(null)}
        />
      )}
      {verifyEvent && <EventPinVerifyModal eventRecord={verifyEvent} onClose={() => setVerifyEvent(null)} />}
      {pinResult && <EventPinRevealModal eventName={pinResult.event} pin={pinResult.pin} onClose={() => setPinResult(null)} />}
    </div>
  )
}
