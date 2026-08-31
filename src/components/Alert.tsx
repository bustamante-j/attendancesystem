import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

const tones = {
  error: { className: 'border-bad/25 bg-bad-soft text-bad-ink', Icon: AlertCircle },
  success: { className: 'border-ok/25 bg-ok-soft text-ok-ink', Icon: CheckCircle2 },
  info: { className: 'border-line bg-sunken text-muted', Icon: Info },
} as const

export function Alert({ message, tone = 'error' }: { message: string; tone?: keyof typeof tones }) {
  const { className, Icon } = tones[tone]
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-base ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 shrink-0" size={16} />
      <span className="min-w-0">{message}</span>
    </div>
  )
}
