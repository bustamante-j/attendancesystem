import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, ScanLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventRecord, EventStatus } from '../types/app'
import { formatManilaDate, toManilaDateKey } from '../utils/dates'

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthFormatter = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const selectedDateFormatter = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

interface CalendarDay {
  key: string
  day: number
  inMonth: boolean
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

function statusClasses(status: EventStatus) {
  if (status === 'open') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
  if (status === 'draft') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
}

export function DashboardCalendar({ events }: { events: EventRecord[] }) {
  const todayKey = toManilaDateKey(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => monthKeyFromDateKey(todayKey))
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const eventRanges = useMemo(() => events.map((event) => ({
    event,
    startKey: toManilaDateKey(event.start_at),
    endKey: toManilaDateKey(event.end_at),
  })), [events])
  const selectedEvents = useMemo(() => eventRanges
    .filter(({ startKey, endKey }) => startKey <= selectedDate && selectedDate <= endKey)
    .map(({ event }) => event)
    .sort((left, right) => left.start_at.localeCompare(right.start_at)), [eventRanges, selectedDate])
  const { year, month } = monthParts(visibleMonth)
  const monthLabel = monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)))

  const selectDay = (dateKey: string) => {
    setSelectedDate(dateKey)
    const nextMonth = monthKeyFromDateKey(dateKey)
    if (nextMonth !== visibleMonth) setVisibleMonth(nextMonth)
  }
  const goToday = () => {
    setSelectedDate(todayKey)
    setVisibleMonth(monthKeyFromDateKey(todayKey))
  }

  return (
    <section className="panel overflow-hidden p-0" aria-labelledby="dashboard-calendar-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/70 px-4 py-4 sm:px-5 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700 shadow-inner dark:bg-blue-950/70 dark:text-blue-300"><CalendarDays size={20} /></span>
          <div><h2 className="font-semibold" id="dashboard-calendar-title">Event calendar</h2><p className="mt-0.5 text-sm text-slate-500">Select a date to view scheduled events.</p></div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="icon-btn border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}><ChevronLeft size={18} /></button>
          <button className="btn-secondary min-h-9 px-3 py-1.5" type="button" onClick={goToday}>Today</button>
          <button className="icon-btn border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900" type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 p-3 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold tracking-tight">{monthLabel}</h3>
            <span className="text-xs font-medium text-slate-500">Asia/Manila</span>
          </div>
          <div className="grid grid-cols-7" role="grid" aria-label={`${monthLabel} event calendar`}>
            {weekdays.map((weekday) => <div className="pb-2 text-center text-[0.68rem] font-bold uppercase tracking-wider text-slate-400" role="columnheader" key={weekday}>{weekday}</div>)}
            {days.map((day) => {
              const dayEvents = eventRanges.filter(({ startKey, endKey }) => startKey <= day.key && day.key <= endKey)
              const selected = day.key === selectedDate
              const today = day.key === todayKey
              return (
                <button
                  className={`group relative min-h-16 border-b border-r border-slate-100 p-1.5 text-left transition sm:min-h-24 sm:p-2 dark:border-slate-800/80 ${selected ? 'z-[1] bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} ${day.inMonth ? '' : 'bg-slate-50/40 text-slate-400 dark:bg-slate-950/30'}`}
                  type="button"
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={`${dateLabel(day.key)}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                  onClick={() => selectDay(day.key)}
                  key={day.key}
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${today ? 'bg-blue-600 text-white shadow-sm' : selected ? 'text-blue-700 dark:text-blue-300' : ''}`}>{day.day}</span>
                  <span className="mt-1 hidden space-y-1 sm:block">
                    {dayEvents.slice(0, 2).map(({ event }) => <span className={`block truncate rounded-md px-1.5 py-1 text-[0.66rem] font-semibold ${statusClasses(event.status)}`} key={event.id}>{event.name}</span>)}
                    {dayEvents.length > 2 && <span className="block px-1 text-[0.65rem] font-semibold text-slate-500">+{dayEvents.length - 2} more</span>}
                  </span>
                  {!!dayEvents.length && <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 sm:hidden">{dayEvents.slice(0, 3).map(({ event }) => <span className={`h-1.5 w-1.5 rounded-full ${event.status === 'open' ? 'bg-emerald-500' : event.status === 'draft' ? 'bg-amber-500' : 'bg-slate-400'}`} key={event.id} />)}</span>}
                </button>
              )
            })}
          </div>
        </div>

        <aside className="border-t border-slate-200/80 bg-slate-50/55 p-4 xl:border-l xl:border-t-0 xl:p-5 dark:border-slate-800 dark:bg-slate-950/25" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Selected date</p>
          <h3 className="mt-1 text-base font-bold">{dateLabel(selectedDate)}</h3>
          <div className="mt-4 space-y-3">
            {selectedEvents.map((event) => (
              <article className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900" key={event.id}>
                <div className="flex items-start justify-between gap-3"><h4 className="font-semibold leading-5">{event.name}</h4><span className={`status-chip shrink-0 capitalize ${statusClasses(event.status)}`}>{event.status}</span></div>
                <div className="mt-2 space-y-1 text-xs text-slate-500">
                  <p className="flex items-start gap-1.5"><Clock3 className="mt-0.5 shrink-0" size={13} /> {formatManilaDate(event.start_at)}</p>
                  <p className="flex items-start gap-1.5"><MapPin className="mt-0.5 shrink-0" size={13} /> {event.venue || 'No venue set'}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><Link className="btn-secondary min-h-8 px-2.5 py-1 text-xs" to={`/reports?event=${event.id}`}><BarChart3 size={13} /> Report</Link>{event.status === 'open' && <Link className="btn-primary min-h-8 px-2.5 py-1 text-xs" to={`/events/${event.id}/scanner`}><ScanLine size={13} /> Scan</Link>}</div>
              </article>
            ))}
            {!selectedEvents.length && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700"><CalendarDays className="mx-auto text-slate-300 dark:text-slate-600" size={30} /><p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">No events scheduled</p><p className="mt-1 text-xs text-slate-500">Choose another date or create an event.</p></div>}
          </div>
        </aside>
      </div>
    </section>
  )
}
