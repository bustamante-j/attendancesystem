import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, List, MapPin, ScanLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventRecord, EventStatus } from '../types/app'
import { MANILA_TIME_ZONE, toManilaDateKey } from '../utils/dates'
import { SegmentedControl } from './SegmentedControl'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const selectedDateFormatter = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const shortDateFormatter = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: MANILA_TIME_ZONE })
const timeFormatter = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: MANILA_TIME_ZONE })

type CalendarView = 'month' | 'agenda'

interface CalendarDay { key: string; day: number; inMonth: boolean }
interface EventRange { event: EventRecord; startKey: string; endKey: string }

const statusDot: Record<EventStatus, string> = {
  open: 'bg-ok',
  draft: 'bg-warn',
  closed: 'bg-subtle',
}

function monthKeyFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7)
}

function monthParts(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  return { year, month }
}

function shiftMonth(monthKey: string, amount: number) {
  const { year, month } = monthParts(monthKey)
  return new Date(Date.UTC(year, month - 1 + amount, 1)).toISOString().slice(0, 7)
}

function monthEndKey(monthKey: string) {
  const { year, month } = monthParts(monthKey)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function calendarDays(monthKey: string): CalendarDay[] {
  const { year, month } = monthParts(monthKey)
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, 1 - firstWeekday + index))
    return {
      key: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
    }
  })
}

function dateLabel(dateKey: string) {
  return selectedDateFormatter.format(new Date(`${dateKey}T12:00:00Z`))
}

function eventTimeLabel(event: EventRecord) {
  const startKey = toManilaDateKey(event.start_at)
  const endKey = toManilaDateKey(event.end_at)
  const startTime = timeFormatter.format(new Date(event.start_at))
  const endTime = timeFormatter.format(new Date(event.end_at))
  if (startKey === endKey) return `${startTime} – ${endTime}`
  return `${shortDateFormatter.format(new Date(event.start_at))}, ${startTime} – ${shortDateFormatter.format(new Date(event.end_at))}, ${endTime}`
}

function EventDetail({ event }: { event: EventRecord }) {
  return (
    <article className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`dot ${statusDot[event.status]}`} aria-hidden="true" />
        <h4 className="truncate text-base font-medium text-ink">{event.name}</h4>
      </div>
      <div className="mt-2 space-y-1 text-meta text-muted">
        <span className="flex items-start gap-1.5"><Clock3 className="mt-0.5 shrink-0" size={12} /> {eventTimeLabel(event)}</span>
        <span className="flex items-start gap-1.5"><MapPin className="mt-0.5 shrink-0" size={12} /> {event.venue || 'No venue set'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link className="btn-secondary btn-sm" to={`/reports?event=${event.id}`}><BarChart3 size={13} /> Report</Link>
        {event.status === 'open' && (
          <Link className="btn-primary btn-sm" to={`/events/${event.id}/scanner`}><ScanLine size={13} /> Scan</Link>
        )}
      </div>
    </article>
  )
}

export function DashboardCalendar({ events }: { events: EventRecord[] }) {
  const todayKey = toManilaDateKey(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => monthKeyFromDateKey(todayKey))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [view, setView] = useState<CalendarView>('month')

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const eventRanges = useMemo<EventRange[]>(() => events.map((event) => ({
    event,
    startKey: toManilaDateKey(event.start_at),
    endKey: toManilaDateKey(event.end_at),
  })), [events])
  const selectedEvents = useMemo(() => eventRanges
    .filter(({ startKey, endKey }) => startKey <= selectedDate && selectedDate <= endKey)
    .map(({ event }) => event)
    .sort((left, right) => left.start_at.localeCompare(right.start_at)), [eventRanges, selectedDate])
  const visibleEvents = useMemo(() => {
    const startKey = `${visibleMonth}-01`
    const endKey = monthEndKey(visibleMonth)
    return eventRanges
      .filter((range) => range.startKey <= endKey && startKey <= range.endKey)
      .sort((left, right) => left.startKey.localeCompare(right.startKey) || left.event.start_at.localeCompare(right.event.start_at))
  }, [eventRanges, visibleMonth])

  const { year, month } = monthParts(visibleMonth)
  const monthLabel = monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)))

  const selectDay = (dateKey: string) => {
    setSelectedDate(dateKey)
    const nextMonth = monthKeyFromDateKey(dateKey)
    if (nextMonth !== visibleMonth) setVisibleMonth(nextMonth)
  }

  const moveMonth = (amount: number) => {
    const nextMonth = shiftMonth(visibleMonth, amount)
    setVisibleMonth(nextMonth)
    setSelectedDate(`${nextMonth}-01`)
  }

  return (
    <section className="table-shell" aria-labelledby="dashboard-calendar-title">
      <div className="surface-head">
        <div>
          <h2 className="section-title" id="dashboard-calendar-title">Event calendar</h2>
          <p className="section-note">Plan, review, and open attendance sessions.</p>
        </div>
        <SegmentedControl
          value={view}
          onChange={setView}
          label="Calendar view"
          options={[
            { value: 'month', label: 'Month', icon: CalendarDays },
            { value: 'agenda', label: 'Agenda', icon: List },
          ]}
        />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button className="icon-btn h-8 w-8" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={16} />
              </button>
              <h3 className="min-w-36 text-center text-base font-medium text-ink">{monthLabel}</h3>
              <button className="icon-btn h-8 w-8" type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              className="btn-secondary btn-sm"
              type="button"
              onClick={() => { setSelectedDate(todayKey); setVisibleMonth(monthKeyFromDateKey(todayKey)) }}
            >
              Today
            </button>
          </div>

          {view === 'month' ? (
            <div>
              <div className="grid grid-cols-7" role="row">
                {weekdays.map((weekday) => (
                  <div className="pb-2 text-center text-micro font-medium uppercase text-subtle" role="columnheader" key={weekday}>
                    {weekday}
                  </div>
                ))}
              </div>
              <div
                className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-line bg-line"
                role="grid"
                aria-label={`${monthLabel} event calendar`}
              >
                {days.map((day) => {
                  const dayEvents = eventRanges.filter(({ startKey, endKey }) => startKey <= day.key && day.key <= endKey)
                  const selected = day.key === selectedDate
                  const today = day.key === todayKey
                  return (
                    <button
                      key={day.key}
                      type="button"
                      role="gridcell"
                      aria-selected={selected}
                      aria-label={`${dateLabel(day.key)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                      onClick={() => selectDay(day.key)}
                      className={`relative min-h-[4rem] min-w-0 p-1.5 text-left transition-colors ${
                        selected
                          ? 'bg-accent-soft ring-1 ring-inset ring-accent'
                          : day.inMonth ? 'bg-surface hover:bg-sunken' : 'bg-sunken/60 hover:bg-sunken'
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full text-meta tabular-nums ${
                          today ? 'bg-accent font-semibold text-white'
                            : day.inMonth ? 'text-ink' : 'text-subtle'
                        }`}
                      >
                        {day.day}
                      </span>
                      <span className="mt-1 hidden space-y-0.5 sm:block">
                        {dayEvents.slice(0, 2).map(({ event }) => (
                          <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted" key={event.id}>
                            <span className={`dot ${statusDot[event.status]}`} />
                            <span className="truncate">{event.name}</span>
                          </span>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="block text-micro text-subtle">+{dayEvents.length - 2} more</span>
                        )}
                      </span>
                      {!!dayEvents.length && (
                        <span className="absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-0.5 sm:hidden">
                          {dayEvents.slice(0, 3).map(({ event }) => (
                            <span className={`dot ${statusDot[event.status]}`} key={event.id} />
                          ))}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="min-h-[26rem] rounded-xl border border-line">
              {visibleEvents.length ? (
                <ul className="divide-y divide-line">
                  {visibleEvents.map(({ event, startKey }) => (
                    <li key={event.id}>
                      <button
                        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-sunken"
                        type="button"
                        onClick={() => selectDay(startKey)}
                      >
                        <span className="w-12 shrink-0 text-meta text-subtle">{shortDateFormatter.format(new Date(event.start_at))}</span>
                        <span className={`dot ${statusDot[event.status]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-ink">{event.name}</span>
                          <span className="block truncate text-meta text-muted">{eventTimeLabel(event)} · {event.venue || 'No venue set'}</span>
                        </span>
                        <ChevronRight className="shrink-0 text-subtle" size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid min-h-[26rem] place-items-center px-6 text-center">
                  <div>
                    <CalendarDays className="mx-auto text-subtle" size={22} strokeWidth={1.75} />
                    <p className="mt-3 text-base font-medium text-ink">No events this month</p>
                    <p className="mt-1 text-meta text-muted">Move to another month to review its schedule.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="border-t border-line bg-sunken/50 p-4 xl:border-l xl:border-t-0" aria-live="polite">
          <p className="text-micro font-medium uppercase tracking-wider text-subtle">Selected date</p>
          <h3 className="mt-1 text-base font-medium text-ink">{dateLabel(selectedDate)}</h3>
          <p className="mt-0.5 text-meta text-muted">
            {selectedEvents.length} scheduled event{selectedEvents.length === 1 ? '' : 's'}
          </p>
          <div className="mt-3 space-y-2">
            {selectedEvents.map((event) => <EventDetail event={event} key={event.id} />)}
            {!selectedEvents.length && (
              <div className="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center">
                <p className="text-base text-muted">No events scheduled</p>
                <p className="mt-1 text-meta text-subtle">Choose another date or create an event.</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-meta text-muted">
            {(['open', 'draft', 'closed'] as EventStatus[]).map((status) => (
              <span className="inline-flex items-center gap-1.5 capitalize" key={status}>
                <span className={`dot ${statusDot[status]}`} /> {status}
              </span>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
