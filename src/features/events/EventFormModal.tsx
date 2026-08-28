import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../../components/Modal'
import type { EventInput } from '../../services/events'
import type { Department, EventRecord } from '../../types/app'
import { manilaDateTimeToIso, toDateTimeLocal } from '../../utils/dates'

const schema = z.object({
  name: z.string().trim().min(1, 'Event name is required.').max(200),
  description: z.string().max(2000), venue: z.string().max(300),
  start_at: z.string().min(1, 'Start time is required.'), end_at: z.string().min(1, 'End time is required.'),
  check_in_opens_at: z.string().min(1), late_after: z.string().min(1), check_in_closes_at: z.string().min(1),
  attendance_mode: z.enum(['check_in_only', 'check_in_out']),
  check_out_opens_at: z.string(), check_out_closes_at: z.string(),
  department_ids: z.array(z.string().uuid()).min(1, 'Select at least one department.'),
  year_levels: z.array(z.number().int().min(1).max(4)),
}).superRefine((values, context) => {
  const parse = (value: string) => { try { return new Date(manilaDateTimeToIso(value)).getTime() } catch { return Number.NaN } }
  const start = parse(values.start_at); const end = parse(values.end_at)
  const opens = parse(values.check_in_opens_at); const late = parse(values.late_after); const closes = parse(values.check_in_closes_at)
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

function defaults(event: EventRecord | null, audience: { departmentIds: string[]; yearLevels: number[] } | null, departmentId: string): Values {
  if (event) return {
    name: event.name, description: event.description ?? '', venue: event.venue ?? '',
    start_at: toDateTimeLocal(event.start_at), end_at: toDateTimeLocal(event.end_at),
    check_in_opens_at: toDateTimeLocal(event.check_in_opens_at), late_after: toDateTimeLocal(event.late_after), check_in_closes_at: toDateTimeLocal(event.check_in_closes_at),
    attendance_mode: event.attendance_mode,
    check_out_opens_at: event.check_out_opens_at ? toDateTimeLocal(event.check_out_opens_at) : '', check_out_closes_at: event.check_out_closes_at ? toDateTimeLocal(event.check_out_closes_at) : '',
    department_ids: audience?.departmentIds ?? [], year_levels: audience?.yearLevels ?? [],
  }
  const now = new Date(); const start = new Date(now.getTime() + 60 * 60 * 1000); const end = new Date(start.getTime() + 4 * 60 * 60 * 1000)
  return { name: '', description: '', venue: '', start_at: toDateTimeLocal(start), end_at: toDateTimeLocal(end), check_in_opens_at: toDateTimeLocal(new Date(start.getTime() - 30 * 60 * 1000)), late_after: toDateTimeLocal(new Date(start.getTime() + 15 * 60 * 1000)), check_in_closes_at: toDateTimeLocal(new Date(start.getTime() + 60 * 60 * 1000)), attendance_mode: 'check_in_only', check_out_opens_at: '', check_out_closes_at: '', department_ids: departmentId ? [departmentId] : [], year_levels: [] }
}

export function EventFormModal({ event, audience, departments, onClose, onSave }: { event: EventRecord | null; audience: { departmentIds: string[]; yearLevels: number[] } | null; departments: Department[]; onClose: () => void; onSave: (input: EventInput) => Promise<void> }) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults(event, audience, departments[0]?.id ?? '') })
  const mode = watch('attendance_mode')
  const submit = (values: Values) => onSave({ ...values, start_at: manilaDateTimeToIso(values.start_at), end_at: manilaDateTimeToIso(values.end_at), check_in_opens_at: manilaDateTimeToIso(values.check_in_opens_at), late_after: manilaDateTimeToIso(values.late_after), check_in_closes_at: manilaDateTimeToIso(values.check_in_closes_at), check_out_opens_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_opens_at) : null, check_out_closes_at: values.attendance_mode === 'check_in_out' ? manilaDateTimeToIso(values.check_out_closes_at) : null })
  return <Modal title={event ? 'Edit event' : 'Create event'} onClose={onClose} size="xl" closeDisabled={isSubmitting}><form className="space-y-5" onSubmit={handleSubmit(submit)}><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><label><span className="label">Name</span><input className="field" autoFocus {...register('name')} />{errors.name && <span className="text-xs text-red-700">{errors.name.message}</span>}</label><label><span className="label">Venue</span><input className="field" {...register('venue')} /></label><label><span className="label">Attendance mode</span><select className="field" {...register('attendance_mode')}><option value="check_in_only">Check-in only</option><option value="check_in_out">Check-in and check-out</option></select></label><label className="md:col-span-2 lg:col-span-3"><span className="label">Description</span><textarea className="field" rows={2} {...register('description')} /></label><label><span className="label">Event starts (Manila)</span><input className="field" type="datetime-local" {...register('start_at')} />{errors.start_at && <span className="text-xs text-red-700">{errors.start_at.message}</span>}</label><label><span className="label">Event ends (Manila)</span><input className="field" type="datetime-local" {...register('end_at')} />{errors.end_at && <span className="text-xs text-red-700">{errors.end_at.message}</span>}</label><div className="hidden lg:block" /><label><span className="label">Check-in opens</span><input className="field" type="datetime-local" {...register('check_in_opens_at')} /></label><label><span className="label">Late after</span><input className="field" type="datetime-local" {...register('late_after')} />{errors.late_after && <span className="text-xs text-red-700">{errors.late_after.message}</span>}</label><label><span className="label">Check-in closes</span><input className="field" type="datetime-local" {...register('check_in_closes_at')} />{errors.check_in_closes_at && <span className="text-xs text-red-700">{errors.check_in_closes_at.message}</span>}</label>{mode === 'check_in_out' && <><label><span className="label">Check-out opens</span><input className="field" type="datetime-local" {...register('check_out_opens_at')} />{errors.check_out_opens_at && <span className="text-xs text-red-700">{errors.check_out_opens_at.message}</span>}</label><label><span className="label">Check-out closes</span><input className="field" type="datetime-local" {...register('check_out_closes_at')} />{errors.check_out_closes_at && <span className="text-xs text-red-700">{errors.check_out_closes_at.message}</span>}</label></>}</div><fieldset><legend className="label">Departments</legend><div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 p-3">{departments.map((department) => <label key={department.id} className="flex items-center gap-2 text-sm"><input type="checkbox" value={department.id} {...register('department_ids')} /> {department.code}</label>)}</div>{errors.department_ids && <span className="text-xs text-red-700">{errors.department_ids.message}</span>}</fieldset><fieldset><legend className="label">Year levels <span className="font-normal text-slate-500">(none means all)</span></legend><div className="flex gap-5 rounded-lg border border-slate-200 p-3">{[1, 2, 3, 4].map((year) => <label key={year} className="flex items-center gap-2 text-sm"><input type="checkbox" value={year} {...register('year_levels', { valueAsNumber: true })} /> Year {year}</label>)}</div></fieldset><div className="flex justify-end gap-3 border-t pt-4"><button type="button" className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : event ? 'Save event' : 'Create draft event'}</button></div></form></Modal>
}
