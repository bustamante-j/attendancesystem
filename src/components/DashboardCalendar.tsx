import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  List,
  MapPin,
  ScanLine,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventRecord, EventStatus } from '../types/app'
import { MANILA_TIME_ZONE, toManilaDateKey } from '../utils/dates'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const selectedDateFormatter = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortDateFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  timeZone: MANILA_TIME_ZONE,
})
const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: MANILA_TIME_ZONE,
})

type CalendarView = 'month' | 'agenda'

interface CalendarDay {
  key: string
  day: number
  inMonth: boolean
}

interface EventRange {
  event: EventRecord
  startKey: string
  endKey: string
}

const statusStyles: Record<EventStatus, { dot: string; rail: string; text: string }> = {
  open: {
    dot: 'bg-emerald-500',
    rail: 'border-l-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
  },
  draft: {
    dot: 'bg-amber-500',
    rail: 'border-l-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
  },
  closed: {
    dot: 'bg-slate-400',
    rail: 'border-l-slate-400',
    text: 'text-slate-500 dark:text-slate-400',
  },
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

function EventActions({ event }: { event: EventRecord }) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Link className="btn-secondary min-h-8 px-2.5 py-1 text-xs" to={`/reports?event=${event.id}`}>
        <BarChart3 size={13} /> Report
      </Link>
      {event.status === 'open' && (
        <Link className="btn-primary min-h-8 px-2.5 py-1 text-xs" to={`/events/${event.id}/scanner`}>
          <ScanLine size={13} /> Scan
        </Link>
      )}
    </div>
  )
}

function EventDetail({ event }: { event: EventRecord }) {
  const styles = statusStyles[event.status]
  return (
    <article className={`border-l-[3px] ${styles.rail} py-2.5 pl-3 sm:rounded-xl sm:border-y sm:border-r sm:border-y-slate-200 sm:border-r-slate-200 sm:bg-white sm:p-4 sm:shadow-sm sm:dark:border-y-slate-800 sm:dark:border-r-slate-800 sm:dark:bg-slate-900`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{event.name}</h4>
            <span className={`shrink-0 text-[0.68rem] font-bold uppercase tracking-wide ${styles.text}`}>{event.status}</span>
          </div>
          <div className="mt-2 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-start gap-1.5"><Clock3 className="mt-0.5 shrink-0" size={13} /> {eventTimeLabel(event)}</span>
            <span className="flex items-start gap-1.5"><MapPin className="mt-0.5 shrink-0" size={13} /> {event.venue || 'No venue set'}</span>
          </div>
        </div>
      </div>
      <div className="mt-4"><EventActions event={event} /></div>
    </article>
  )
}

function StatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500 dark:text-slate-400" aria-label="Event status legend">
      {(['open', 'draft', 'closed'] as EventStatus[]).map((status) => (
        <span className="inline-flex items-center gap-2 capitalize" key={status}>
          <span className={`h-2 w-2 rounded-full ${statusStyles[status].dot}`} /> {status}
        </span>
      ))}
    </div>
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

  const goToday = () => {
    setSelectedDate(todayKey)
    setVisibleMonth(monthKeyFromDateKey(todayKey))
  }

  return (
    <section className="panel overflow-hidden p-0" aria-labelledby="dashboard-calendar-title">
      <header className="flex flex-col gap-4 border-b border-slate-200/80 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between dark:border-slate-800">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
            <CalendarDays size={20} />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950 dark:text-white" id="dashboard-calendar-title">Event calendar</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Plan, review, and open attendance sessions.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Calendar view">
          <button
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition ${view === 'month' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            type="button"
            aria-pressed={view === 'month'}
            onClick={() => setView('month')}
          >
            <CalendarDays size={14} /> Month
          </button>
          <button
            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition ${view === 'agenda' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            type="button"
            aria-pressed={view === 'agenda'}
            onClick={() => setView('agenda')}
          >
            <List size={14} /> Agenda
          </button>
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button className="icon-btn h-9 w-9 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" type="button" aria-label="Previous month" onClick={() => moveMonth(-1)}>
                <ChevronLeft size={18} />
              </button>
              <h3 className="min-w-32 text-center text-base font-bold tracking-tight sm:text-lg">{monthLabel}</h3>
              <button className="icon-btn h-9 w-9 border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" type="button" aria-label="Next month" onClick={() => moveMonth(1)}>
                <ChevronRight size={18} />
              </button>
            </div>
            <button className="btn-secondary min-h-9 px-3 py-1.5" type="button" onClick={goToday}>Today</button>
          </div>

          {view === 'month' ? (
            <div>
              <div className="grid grid-cols-7 rounded-t-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40" role="row">
                {weekdays.map((weekday) => (
                  <div className="py-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-slate-400 sm:text-[0.7rem]" role="columnheader" key={weekday}>{weekday}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-xl border-x border-b border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800" role="grid" aria-label={`${monthLabel} event calendar`}>
                {days.map((day) => {
                  const dayEvents = eventRanges.filter(({ startKey, endKey }) => startKey <= day.key && day.key <= endKey)
                  const selected = day.key === selectedDate
                  const today = day.key === todayKey
                  return (
                    <button
                      className={`group relative min-h-[4.25rem] min-w-0 p-1.5 text-left transition sm:min-h-[4.5rem] sm:p-2 2xl:min-h-[5rem] ${selected ? 'z-[1] bg-blue-50 ring-2 ring-inset ring-blue-600 dark:bg-blue-950/35' : day.inMonth ? 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/70' : 'bg-slate-50/90 text-slate-400 hover:bg-slate-100 dark:bg-slate-950/60 dark:hover:bg-slate-900'}`}
                      type="button"
                      role="gridcell"
                      aria-selected={selected}
                      aria-label={`${dateLabel(day.key)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                      onClick={() => selectDay(day.key)}
                      key={day.key}
                    >
                      <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${today ? 'bg-blue-600 text-white shadow-sm' : selected ? 'text-blue-700 dark:text-blue-300' : day.inMonth ? 'text-slate-700 dark:text-slate-200' : ''}`}>{day.day}</span>
                      <span className="mt-1 hidden space-y-1 sm:block">
                        {dayEvents.slice(0, 2).map(({ event }) => (
                          <span className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-[0.65rem] font-semibold text-slate-600 transition group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-white" key={event.id}>
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusStyles[event.status].dot}`} />
                            <span className="truncate">{event.name}</span>
                          </span>
                        ))}
                        {dayEvents.length > 2 && <span className="block px-1 text-[0.65rem] font-semibold text-slate-500">+{dayEvents.length - 2} more</span>}
                      </span>
                      {!!dayEvents.length && (
                        <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 sm:hidden">
                          {dayEvents.slice(0, 3).map(({ event }) => <span className={`h-1.5 w-1.5 rounded-full ${statusStyles[event.status].dot}`} key={event.id} />)}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="min-h-[31rem] rounded-xl border border-slate-200 bg-slate-50/55 px-4 dark:border-slate-800 dark:bg-slate-950/25">
              {visibleEvents.length ? (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleEvents.map(({ event, startKey }) => (
                    <button className="flex w-full items-start gap-4 py-4 text-left" type="button" onClick={() => selectDay(startKey)} key={event.id}>
                      <span className="w-14 shrink-0 pt-0.5 text-xs font-bold uppercase tracking-wide text-slate-400">{shortDateFormatter.format(new Date(event.start_at))}</span>
                      <span className={`mt-1 h-9 w-1 shrink-0 rounded-full ${statusStyles[event.status].dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-slate-900 dark:text-white">{event.name}</span>
                          <span className={`text-[0.68rem] font-bold uppercase tracking-wide ${statusStyles[event.status].text}`}>{event.status}</span>
                        </span>
                        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{eventTimeLabel(event)} · {event.venue || 'No venue set'}</span>
                      </span>
                      <ChevronRight className="mt-2 shrink-0 text-slate-300" size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid min-h-[31rem] place-items-center text-center">
                  <div>
                    <CalendarDays className="mx-auto text-slate-300 dark:text-slate-600" size={34} />
                    <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No events this month</p>
                    <p className="mt-1 text-xs text-slate-500">Move to another month to review its schedule.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside className="border-t border-slate-200/80 bg-slate-50/55 p-4 xl:border-l xl:border-t-0 xl:p-5 dark:border-slate-800 dark:bg-slate-950/25" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected date</p>
          <h3 className="mt-1 text-base font-bold leading-6">{dateLabel(selectedDate)}</h3>
          <p className="mt-1 text-xs text-slate-500">{selectedEvents.length} scheduled event{selectedEvents.length === 1 ? '' : 's'}</p>
          <div className="mt-4 space-y-3">
            {selectedEvents.map((event) => <EventDetail event={event} key={event.id} />)}
            {!selectedEvents.length && (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                <CalendarDays className="mx-auto text-slate-300 dark:text-slate-600" size={30} />
                <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">No events scheduled</p>
                <p className="mt-1 text-xs text-slate-500">Choose another date or create an event.</p>
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800"><StatusLegend /></div>
        </aside>
      </div>
    </section>
  )
}
