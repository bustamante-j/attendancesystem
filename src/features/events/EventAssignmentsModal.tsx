import { UserMinus, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from '../../components/Alert'
import { EmptyState } from '../../components/EmptyState'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { assignUser, listEventAssignments, removeAssignment, type EventAssignment } from '../../services/events'
import type { EventRecord, Profile } from '../../types/app'

/**
 * Assignments are per-event, so they belong in the context of one event rather
 * than in a permanently mounted panel with its own event picker.
 */
export function EventAssignmentsModal({ eventRecord, profiles, actorId, initialUserId, onClose }: {
  eventRecord: EventRecord
  profiles: Profile[]
  actorId: string
  initialUserId?: string | null
  onClose: () => void
}) {
  const [assignments, setAssignments] = useState<EventAssignment[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const assignable = profiles.filter((item) => item.is_enabled && item.role !== 'super_admin' && item.role !== 'admin')

  const load = useCallback(async () => {
    try {
      setAssignments(await listEventAssignments(eventRecord.id))
      setError(null)
    } catch (cause) {
      setError(friendlyError(cause, 'Assignments could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }, [eventRecord.id])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    setSelectedUserId((current) => {
      if (current && assignable.some((item) => item.id === current)) return current
      if (initialUserId && assignable.some((item) => item.id === initialUserId)) return initialUserId
      return assignable.find((item) => !assignments.some((assignment) => assignment.user_id === item.id))?.id ?? ''
    })
  }, [assignable, assignments, initialUserId])

  const alreadyAssigned = assignments.some((assignment) => assignment.user_id === selectedUserId)

  const add = async () => {
    if (!selectedUserId || alreadyAssigned) return
    setBusy(true)
    try {
      await assignUser(eventRecord.id, selectedUserId, actorId)
      await load()
    } catch (cause) {
      setError(friendlyError(cause, 'The user may already be assigned.'))
    } finally {
      setBusy(false)
    }
  }

  const drop = async (assignment: EventAssignment) => {
    if (assignment.user_id === eventRecord.created_by) return
    setBusy(true)
    try {
      await removeAssignment(assignment.event_id, assignment.user_id)
      await load()
    } catch (cause) {
      setError(friendlyError(cause, 'The assignment could not be removed.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Scanner assignments"
      description={`Officers only see ${eventRecord.name} once assigned.`}
      size="md"
      onClose={onClose}
    >
      <div className="space-y-4">
        {error && <Alert message={error} />}

        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="label">Staff account</span>
            <select
              className="field"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={!assignable.length}
            >
              {assignable.length
                ? assignable.map((item) => (
                    <option key={item.id} value={item.id}>{item.full_name} · {item.role}</option>
                  ))
                : <option value="">No assignable staff</option>}
            </select>
          </label>
          <button className="btn-primary" disabled={!selectedUserId || alreadyAssigned || busy} onClick={() => void add()}>
            <UserPlus size={15} /> {alreadyAssigned ? 'Assigned' : 'Assign'}
          </button>
        </div>

        <div className="table-shell">
          {loading ? (
            <p className="px-4 py-6 text-center text-base text-muted">Loading assignments…</p>
          ) : assignments.length ? (
            <ul className="divide-y divide-line">
              {assignments.map((assignment) => {
                const creator = assignment.user_id === eventRecord.created_by
                return (
                  <li className="flex items-center justify-between gap-3 px-4 py-2.5" key={assignment.user_id}>
                    <div className="min-w-0">
                      <div className="truncate text-base text-ink">{assignment.profiles?.full_name ?? assignment.user_id}</div>
                      {creator && <div className="cell-meta">Event creator</div>}
                    </div>
                    {!creator && (
                      <button
                        className="icon-btn h-8 w-8 hover:text-bad-ink"
                        disabled={busy}
                        onClick={() => void drop(assignment)}
                        aria-label={`Remove ${assignment.profiles?.full_name ?? 'assignment'}`}
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={UserPlus} title="No staff assigned" description="Assign an officer or faculty account so they can open the scanner." />
          )}
        </div>
      </div>
    </Modal>
  )
}
