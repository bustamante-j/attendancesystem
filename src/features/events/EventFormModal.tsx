import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarClock, Clock3, MapPin, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../components/Modal'
import type { EventInput } from '../../services/events'
import type { Department, EventRecord } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

const schema = z.object({
  name: z.string().trim().min(1, 'Event name is required.').max(200),
  description: z.string().max(2000),
  venue: z.string().max(300),
  start_at: z.string().min(1, 'Start time is required.'),
  end_at: z.string().min(1, 'End time is required.'),
  check_in_opens_at: z.string().min(1),
  late_after: z.string().min(1),
  check_in_closes_at: z.string().min(1),
  attendance_mode: z.enum(['check_in_only', 'check_in_out']),
  check_out_opens_at: z.string(),
  check_out_closes_at: z.string(),
  department_ids: z.array(z.string().uuid()).min(1, 'Select at least one department.'),
  year_levels: z.array(z.number().int().min(1).max(4)),
}).superRefine((values, context) => {
  const parse = (value: string) => { try { return new Date(manilaDateTimeToIso(value)).getTime() } catch { return Number.NaN } }
  const start = parse(values.start_at)
  const end = parse(values.end_at)
  const opens = parse(values.check_in_opens_at)
  const late = parse(values.late_after)
  const closes = parse(values.check_in_closes_at)
  if (start > end) context.addIssue({ code: 'custom', path: ['end_at'], message: 'End must be after the start.' })
  if (opens > late) context.addIssue({ code: 'custom', path: ['late_after'], message: 'Late threshold must be after check-in opens.' })
  if (late > closes) context.addIssue({ code: 'custom', path: ['check_in_closes_at'], message: 'Check-in close must be after the late threshold.' })
  if ([start, end, opens, late, closes].some(Number.isNaN)) context.addIssue({ code: 'custom', path: ['start_at'], message: 'Enter valid event times.' })
  if (values.attendance_mode === 'check_in_out') {
    if (!values.check_out_opens_at || !values.check_out_closes_at) context.addIssue({ code: 'custom', path: ['check_out_opens_at'], message: 'Both check-out times are required.' })
    else if (parse(values.check_out_opens_at) > parse(values.check_out_closes_at)) context.addIssue({ code: 'custom', path: ['check_out_closes_at'], message: 'Check-out close must be after check-out opens.' })
  }
})

type Values = z.infer<typeof schema>
type TimingPreset = 'standard' | 'strict' | 'custom'

function defaults(event: EventRecord | null, audience: { departmentIds: string[]; yearLevels: number[] } | null, departmentId: string): Values {
  if (event) return {
    name: event.name,
    description: event.description ?? '',
    venue: event.venue ?? '',
    start_at: toDateTimeLocal(event.start_at),
    end_at: toDateTimeLocal(event.end_at),
    check_in_opens_at: toDateTimeLocal(event.check_in_opens_at),
    late_after: toDateTimeLocal(event.late_after),
    check_in_closes_at: toDateTimeLocal(event.check_in_closes_at),
    attendance_mode: event.attendance_mode,
    check_out_opens_at: event.check_out_opens_at ? toDateTimeLocal(event.check_out_opens_at) : '',
    check_out_closes_at: event.check_out_closes_at ? toDateTimeLocal(event.check_out_closes_at) : '',
    department_ids: audience?.departmentIds ?? [],
    year_levels: audience?.yearLevels ?? [],
  }
  const now = new Date()
  const start = new Date(now.getTime() + 60 * 60 * 1000)
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000)
  return {
    name: '',
    description: '',
    venue: '',
    start_at: toDateTimeLocal(start),
    end_at: toDateTimeLocal(end),
    check_in_opens_at: toDateTimeLocal(new Date(start.getTime() - 30 * 60 * 1000)),
    late_after: toDateTimeLocal(new Date(start.getTime() + 15 * 60 * 1000)),
    check_in_closes_at: toDateTimeLocal(new Date(start.getTime() + 60 * 60 * 1000)),
    attendance_mode: 'check_in_only',
    check_out_opens_at: toDateTimeLocal(new Date(end.getTime() - 30 * 60 * 1000)),
    check_out_closes_at: toDateTimeLocal(new Date(end.getTime() + 60 * 60 * 1000)),
    department_ids: departmentId ? [departmentId] : [],
    year_levels: [],
  }
}

function shiftLocal(value: string, minutes: number) {
  try {
    const date = new Date(manilaDateTimeToIso(value))
    return toDateTimeLocal(new Date(date.getTime() + minutes * 60 * 1000))
  } catch {
    return ''
  }
}

function SplitDateTimeField({ label, value, onChange, error }: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  const [date = '', time = ''] = value.split('T')
  const updateDate = (nextDate: string) => onChange(nextDate ? `${nextDate}T${time || '00:00'}` : '')
  const updateTime = (nextTime: string) => onChange(date && nextTime ? `${date}T${nextTime}` : value)

  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</legend>
      <div className="mt-1 grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)]">
        <label><span className="label text-xs">Date</span><input className="field" type="date" value={date} onChange={(event) => updateDate(event.target.value)} /></label>
        <label><span className="label text-xs">Time</span><input className="field" type="time" value={time} disabled={!date} onChange={(event) => updateTime(event.target.value)} /></label>
      </div>
      {error && <span className="mt-2 block text-xs text-red-700 dark:text-red-400">{error}</span>}
    </fieldset>
  )
}

export function EventFormModal({ event, audience, departments, onClose, onSave }: {
  event: EventRecord | null
  audience: { departmentIds: string[]; yearLevels: number[] } | null
  departments: Department[]
  onClose: () => void
  onSave: (input: EventInput) => Promise<void>
}) {
  const [timingPreset, setTimingPreset] = useState<TimingPreset>(event ? 'custom' : 'standard')
  const { control, register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(event, audience, departments[0]?.id ?? ''),
  })
  const mode = watch('attendance_mode')
  const startAt = watch('start_at')
  const endAt = watch('end_at')

  useEffect(() => {
    if (timingPreset === 'custom') return
    const strict = timingPreset === 'strict'
    const checkInOpens = shiftLocal(startAt, strict ? 0 : -30)
    const lateAfter = shiftLocal(startAt, strict ? 10 : 15)
    const checkInCloses = shiftLocal(startAt, strict ? 30 : 60)
    const checkOutOpens = shiftLocal(endAt, strict ? -15 : -30)
    const checkOutCloses = shiftLocal(endAt, strict ? 30 : 60)
    if (checkInOpens) setValue('check_in_opens_at', checkInOpens)
    if (lateAfter) setValue('late_after', lateAfter)
    if (checkInCloses) setValue('check_in_closes_at', checkInCloses)
    if (checkOutOpens) setValue('check_out_opens_at', checkOutOpens)
    if (checkOutCloses) setValue('check_out_closes_at', checkOutCloses)
  }, [endAt, setValue, startAt, timingPreset])

  const submit = (values: Values) => onSave({
    ...values,
    start_at: manilaDateTimeToIso(values.start_at),
    end_at: manilaDateTimeToIso(values.end_at),
    check_in_opens_at: manilaDateTimeToIso(values.check_in_opens_at),
    late_after: manilaDateTimeToIso(values.late_after),
    check_in_closes_at: manilaDateTimeToIso(values.check_in_closes_at),
    check_out_opens_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_opens_at) : null,
    check_out_closes_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_closes_at) : null,
  })

  return (
    <Modal title={event ? 'Edit event' : 'Create event'} onClose={onClose} size="lg" closeDisabled={isSubmitting}>
      <form className="space-y-5" onSubmit={handleSubmit(submit)}>
        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4 flex items-center gap-2"><MapPin size={18} className="text-blue-600" /><h3 className="font-semibold">Event details</h3></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Event name</span><input className="field" autoFocus placeholder="e.g. IT General Assembly" {...register('name')} />{errors.name && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.name.message}</span>}</label>
            <label><span className="label">Venue</span><input className="field" placeholder="e.g. Main Auditorium" {...register('venue')} /></label>
            <label className="sm:col-span-2"><span className="label">Description <span className="font-normal text-slate-400">(optional)</span></span><textarea className="field" rows={2} placeholder="A short note about this event" {...register('description')} /></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2"><CalendarClock size={18} className="text-blue-600" /><div><h3 className="font-semibold">Schedule</h3><p className="text-xs text-slate-500">All times use Asia/Manila.</p></div></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Controller control={control} name="start_at" render={({ field }) => <SplitDateTimeField label="Event starts" value={field.value} onChange={field.onChange} error={errors.start_at?.message} />} />
            <Controller control={control} name="end_at" render={({ field }) => <SplitDateTimeField label="Event ends" value={field.value} onChange={field.onChange} error={errors.end_at?.message} />} />
          </div>
          <p className="mt-3 text-xs text-slate-500">Start and end dates can be different, so multi-day events such as intramurals are supported.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4 flex items-center gap-2"><Clock3 size={18} className="text-blue-600" /><div><h3 className="font-semibold">Attendance rules</h3><p className="text-xs text-slate-500">Choose a preset or set exact attendance windows.</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Attendance mode</span><select className="field" {...register('attendance_mode')}><option value="check_in_only">Check-in only</option><option value="check_in_out">Check-in and check-out</option></select></label>
            <label><span className="label">Timing</span><select className="field" value={timingPreset} onChange={(inputEvent) => setTimingPreset(inputEvent.target.value as TimingPreset)}><option value="standard">Standard — opens 30 min early</option><option value="strict">Strict — opens at event start</option><option value="custom">Advanced — custom times</option></select></label>
          </div>
          {timingPreset !== 'custom' ? (
            <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
              {timingPreset === 'standard' ? 'Check-in opens 30 minutes early, marks late after 15 minutes, and closes after 1 hour.' : 'Check-in opens at the start, marks late after 10 minutes, and closes after 30 minutes.'}
              {mode === 'check_in_out' && ' Check-out opens shortly before the event ends and remains open afterward.'}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label><span className="label">Check-in opens</span><input className="field" type="datetime-local" {...register('check_in_opens_at')} /></label>
              <label><span className="label">Late after</span><input className="field" type="datetime-local" {...register('late_after')} />{errors.late_after && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.late_after.message}</span>}</label>
              <label><span className="label">Check-in closes</span><input className="field" type="datetime-local" {...register('check_in_closes_at')} />{errors.check_in_closes_at && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.check_in_closes_at.message}</span>}</label>
              {mode === 'check_in_out' && <><label><span className="label">Check-out opens</span><input className="field" type="datetime-local" {...register('check_out_opens_at')} />{errors.check_out_opens_at && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.check_out_opens_at.message}</span>}</label><label><span className="label">Check-out closes</span><input className="field" type="datetime-local" {...register('check_out_closes_at')} />{errors.check_out_closes_at && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.check_out_closes_at.message}</span>}</label></>}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <div className="mb-4 flex items-center gap-2"><Users size={18} className="text-blue-600" /><div><h3 className="font-semibold">Audience</h3><p className="text-xs text-slate-500">Choose who is expected to attend.</p></div></div>
          <fieldset><legend className="label">Departments</legend><div className="flex flex-wrap gap-3">{departments.map((department) => <label key={department.id} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><input type="checkbox" value={department.id} {...register('department_ids')} /> {department.code}</label>)}</div>{errors.department_ids && <span className="mt-1 block text-xs text-red-700 dark:text-red-400">{errors.department_ids.message}</span>}</fieldset>
          <fieldset className="mt-4"><legend className="label">Year levels <span className="font-normal text-slate-500">(none means all)</span></legend><div className="flex flex-wrap gap-3">{[1, 2, 3, 4].map((year) => <label key={year} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><input type="checkbox" value={year} {...register('year_levels', { valueAsNumber: true })} /> Year {year}</label>)}</div></fieldset>
        </section>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white/95 pt-4 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : event ? 'Save event' : 'Create draft event'}</button></div>
      </form>
    </Modal>
  )
}
