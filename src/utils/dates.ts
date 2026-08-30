export const MANILA_TIME_ZONE = 'Asia/Manila'

export function formatManilaDate(value: string | Date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function toManilaDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function toDateTimeLocal(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export function manilaDateTimeToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Enter a valid date and time.')
  const parsed = new Date(`${value}:00+08:00`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Enter a valid date and time.')
  return parsed.toISOString()
}
