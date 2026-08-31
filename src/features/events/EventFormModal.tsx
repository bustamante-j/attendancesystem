import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import type { EventInput } from '../../services/events'
import type { Department, EventRecord } from '../../types/app'
import { formatManilaDate, manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

const schema = z.object({
  name: z.string().trim().min(1, 'Event name is required.').max(200),
  description: z.string().max(2000),
  venue: z.string().max(300),
  start_at: z.string().min(1, 'Start time is required.'),
  end_at: z.string().min(1, 'End time is required.'),
  duration_hours: z.number().int('Hours must be a whole number.').min(0, 'Hours cannot be negative.').max(8760, 'Duration cannot exceed one year.'),
  duration_minutes: z.number().int('Minutes must be a whole number.').min(0, 'Minutes cannot be negative.').max(59, 'Minutes must be between 0 and 59.'),
  check_in_opens_at: z.string().min(1),
  late_after: z.string().min(1),
  check_in_closes_at: z.string().min(1),
  attendance_mode: z.enum(['check_in_only', 'check_in_out']),
  check_out_opens_at: z.string(),
  check_out_closes_at: z.string(),
  department_ids: z.union([
    z.string().uuid(),
    z.array(z.string().uuid()).min(1, 'Select at least one department.'),
  ]),
  year_levels: z.union([
    z.literal(0),
    z.number().int().min(1).max(4),
    z.array(z.number().int().min(1).max(4)),
  ]),
}).superRefine((values, context) => {
  const parse = (value: string) => { try { return new Date(manilaDateTimeToIso(value)).getTime() } catch { return Number.NaN } }
  const start = parse(values.start_at)
  const end = parse(values.end_at)
  const opens = parse(values.check_in_opens_at)
  const late = parse(values.late_after)
  const closes = parse(values.check_in_closes_at)
  if (values.duration_hours * 60 + values.duration_minutes < 1) context.addIssue({ code: 'custom', path: ['duration_hours'], message: 'Duration must be at least 1 minute.' })
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

function durationParts(startAt: string, endAt: string) {
  const totalMinutes = Math.max(1, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000))
  return { duration_hours: Math.floor(totalMinutes / 60), duration_minutes: totalMinutes % 60 }
}

function defaults(event: EventRecord | null, audience: { departmentIds: string[]; yearLevels: number[] } | null, departmentId: string, duplicate: boolean): Values {
  if (event) {
    const duration = durationParts(event.start_at, event.end_at)
    return {
      name: duplicate ? `Copy of ${event.name}` : event.name,
      description: event.description ?? '',
      venue: event.venue ?? '',
      start_at: toDateTimeLocal(event.start_at),
      end_at: toDateTimeLocal(event.end_at),
      ...duration,
      check_in_opens_at: toDateTimeLocal(event.check_in_opens_at),
      late_after: toDateTimeLocal(event.late_after),
      check_in_closes_at: toDateTimeLocal(event.check_in_closes_at),
      attendance_mode: event.attendance_mode,
      check_out_opens_at: event.check_out_opens_at ? toDateTimeLocal(event.check_out_opens_at) : '',
      check_out_closes_at: event.check_out_closes_at ? toDateTimeLocal(event.check_out_closes_at) : '',
      department_ids: audience?.departmentIds ?? [],
      year_levels: audience?.yearLevels ?? [],
    }
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
    duration_hours: 4,
    duration_minutes: 0,
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

/** Plain heading + rule, rather than a nested bordered card per group. */
function FormSection({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {note && <p className="mt-0.5 text-meta text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
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
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1.25fr)_minmax(7rem,0.75fr)]">
        <input className="field" type="date" aria-label={`${label} date`} value={date} onChange={(event) => updateDate(event.target.value)} />
        <input className="field" type="time" aria-label={`${label} time`} value={time} disabled={!date} onChange={(event) => updateTime(event.target.value)} />
      </div>
      {error && <span className="field-error">{error}</span>}
    </fieldset>
  )
}

/** Checkbox rendered as a selectable chip, for the audience pickers. */
function ChipCheckbox({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-base text-ink transition-colors hover:bg-sunken has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-ink">
      <input type="checkbox" {...input} />
      {label}
    </label>
  )
}

export function EventFormModal({ event, audience, departments, duplicate = false, onClose, onSave }: {
  event: EventRecord | null
  audience: { departmentIds: string[]; yearLevels: number[] } | null
  departments: Department[]
  duplicate?: boolean
  onClose: () => void
  onSave: (input: EventInput) => Promise<void>
}) {
  const [timingPreset, setTimingPreset] = useState<TimingPreset>(event ? 'custom' : 'standard')
  const { control, register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults(event, audience, departments[0]?.id ?? '', duplicate),
  })
  const mode = watch('attendance_mode')
  const startAt = watch('start_at')
  const endAt = watch('end_at')
  const durationHours = watch('duration_hours')
  const durationMinutes = watch('duration_minutes')
  const validationMessages = [
    errors.name?.message,
    errors.description?.message,
    errors.venue?.message,
    errors.start_at?.message,
    errors.end_at?.message,
    errors.duration_hours?.message,
    errors.duration_minutes?.message,
    errors.check_in_opens_at?.message,
    errors.late_after?.message,
    errors.check_in_closes_at?.message,
    errors.check_out_opens_at?.message,
    errors.check_out_closes_at?.message,
    errors.department_ids?.message,
    errors.year_levels?.message,
  ].filter((message): message is string => typeof message === 'string')

  useEffect(() => {
    const totalMinutes = durationHours * 60 + durationMinutes
    if (!Number.isFinite(totalMinutes) || totalMinutes < 1) {
      setValue('end_at', '')
      return
    }
    setValue('end_at', shiftLocal(startAt, totalMinutes))
  }, [durationHours, durationMinutes, setValue, startAt])

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
    name: values.name,
    description: values.description,
    venue: values.venue,
    attendance_mode: values.attendance_mode,
    start_at: manilaDateTimeToIso(values.start_at),
    end_at: manilaDateTimeToIso(values.end_at),
    check_in_opens_at: manilaDateTimeToIso(values.check_in_opens_at),
    late_after: manilaDateTimeToIso(values.late_after),
    check_in_closes_at: manilaDateTimeToIso(values.check_in_closes_at),
    check_out_opens_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_opens_at) : null,
    check_out_closes_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_closes_at) : null,
    department_ids: Array.isArray(values.department_ids) ? values.department_ids : [values.department_ids],
    year_levels: (Array.isArray(values.year_levels) ? values.year_levels : [values.year_levels]).filter((year) => year >= 1),
  })

  return (
    <Modal
      title={duplicate ? 'Duplicate event' : event ? 'Edit event' : 'Create event'}
      description="All times use Asia/Manila."
      onClose={onClose}
      size="lg"
      closeDisabled={isSubmitting}
    >
      <form onSubmit={handleSubmit(submit)}>
        <div className="space-y-5">
          {!!validationMessages.length && <Alert message={`Review the event details: ${validationMessages.join(' ')}`} />}

          <FormSection title="Details">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Event name</span>
                <input className="field" autoFocus placeholder="e.g. IT General Assembly" {...register('name')} />
                {errors.name && <span className="field-error">{errors.name.message}</span>}
              </label>
              <label className="block">
                <span className="label">Venue</span>
                <input className="field" placeholder="e.g. Main Auditorium" {...register('venue')} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label">Description <span className="text-subtle">(optional)</span></span>
                <textarea className="field resize-y" rows={2} placeholder="A short note about this event" {...register('description')} />
              </label>
            </div>
          </FormSection>

          <FormSection title="Schedule" note="For multi-day events, enter the full duration in hours (72 hours for three days).">
            <input type="hidden" {...register('end_at')} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Controller
                control={control}
                name="start_at"
                render={({ field }) => (
                  <SplitDateTimeField label="Event starts" value={field.value} onChange={field.onChange} error={errors.start_at?.message} />
                )}
              />
              <fieldset>
                <legend className="label">Duration</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <input className="field" min={0} max={8760} inputMode="numeric" type="number" aria-label="Duration hours" {...register('duration_hours', { valueAsNumber: true })} />
                    <span className="mt-1 block text-meta text-muted">Hours</span>
                  </label>
                  <label className="block">
                    <input className="field" min={0} max={59} inputMode="numeric" type="number" aria-label="Duration minutes" {...register('duration_minutes', { valueAsNumber: true })} />
                    <span className="mt-1 block text-meta text-muted">Minutes</span>
                  </label>
                </div>
                {endAt && (
                  <p className="mt-2 text-meta text-muted">
                    Ends <span className="text-ink">{formatManilaDate(manilaDateTimeToIso(endAt))}</span>
                  </p>
                )}
                {(errors.duration_hours || errors.duration_minutes || errors.end_at) && (
                  <span className="field-error">
                    {errors.duration_hours?.message ?? errors.duration_minutes?.message ?? errors.end_at?.message}
                  </span>
                )}
              </fieldset>
            </div>
          </FormSection>

          <FormSection title="Attendance rules">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Attendance mode</span>
                <select className="field" {...register('attendance_mode')}>
                  <option value="check_in_only">Check-in only</option>
                  <option value="check_in_out">Check-in and check-out</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Timing</span>
                <select className="field" value={timingPreset} onChange={(inputEvent) => setTimingPreset(inputEvent.target.value as TimingPreset)}>
                  <option value="standard">Standard — opens 30 min early</option>
                  <option value="strict">Strict — opens at event start</option>
                  <option value="custom">Advanced — custom times</option>
                </select>
              </label>
            </div>

            {timingPreset !== 'custom' ? (
              <p className="mt-3 rounded-lg border border-line bg-sunken px-3 py-2.5 text-meta text-muted">
                {timingPreset === 'standard'
                  ? 'Check-in opens 30 minutes early, marks late after 15 minutes, and closes after 1 hour.'
                  : 'Check-in opens at the start, marks late after 10 minutes, and closes after 30 minutes.'}
                {mode === 'check_in_out' && ' Check-out opens shortly before the event ends and remains open afterward.'}
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="label">Check-in opens</span>
                  <input className="field" type="datetime-local" {...register('check_in_opens_at')} />
                </label>
                <label className="block">
                  <span className="label">Late after</span>
                  <input className="field" type="datetime-local" {...register('late_after')} />
                  {errors.late_after && <span className="field-error">{errors.late_after.message}</span>}
                </label>
                <label className="block">
                  <span className="label">Check-in closes</span>
                  <input className="field" type="datetime-local" {...register('check_in_closes_at')} />
                  {errors.check_in_closes_at && <span className="field-error">{errors.check_in_closes_at.message}</span>}
                </label>
                {mode === 'check_in_out' && (
                  <>
                    <label className="block">
                      <span className="label">Check-out opens</span>
                      <input className="field" type="datetime-local" {...register('check_out_opens_at')} />
                      {errors.check_out_opens_at && <span className="field-error">{errors.check_out_opens_at.message}</span>}
                    </label>
                    <label className="block">
                      <span className="label">Check-out closes</span>
                      <input className="field" type="datetime-local" {...register('check_out_closes_at')} />
                      {errors.check_out_closes_at && <span className="field-error">{errors.check_out_closes_at.message}</span>}
                    </label>
                  </>
                )}
              </div>
            )}
          </FormSection>

          <FormSection title="Audience" note="Choose who is expected to attend.">
            <fieldset>
              <legend className="label">Departments</legend>
              <div className="flex flex-wrap gap-2">
                {departments.map((department) => (
                  <ChipCheckbox key={department.id} label={department.code} value={department.id} {...register('department_ids')} />
                ))}
              </div>
              {errors.department_ids && <span className="field-error">{errors.department_ids.message}</span>}
            </fieldset>
            <fieldset className="mt-4">
              <legend className="label">Year levels <span className="text-subtle">(none means all)</span></legend>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((year) => (
                  <ChipCheckbox key={year} label={`Year ${year}`} value={year} {...register('year_levels', { valueAsNumber: true })} />
                ))}
              </div>
            </fieldset>
          </FormSection>
        </div>

        <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex justify-end gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : duplicate ? 'Create duplicate draft' : event ? 'Save event' : 'Create draft event'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
