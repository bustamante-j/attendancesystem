import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal, ModalActions } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { verifyEventPin } from '../../services/attendance'
import type { EventRecord } from '../../types/app'

/** Shown once after a PIN is created, reset, or retrieved from escrow. */
export function EventPinRevealModal({ eventName, pin, onClose }: {
  eventName: string
  pin: string
  onClose: () => void
}) {
  return (
    <Modal title="Event PIN" description={eventName} size="sm" onClose={onClose}>
      <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-5 text-center">
        <div className="kbd-pin text-warn-ink">{pin}</div>
        <p className="mt-3 text-meta text-warn-ink">
          Stored encrypted. Only a Super Admin can retrieve this PIN again.
        </p>
      </div>
      <ModalActions>
        <button className="btn-primary" onClick={onClose}>Done</button>
      </ModalActions>
    </Modal>
  )
}

/** Lets assigned staff claim a 12-hour access grant ahead of opening the scanner. */
export function EventPinVerifyModal({ eventRecord, onClose }: {
  eventRecord: EventRecord
  onClose: () => void
}) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ text: string; tone: 'error' | 'success' } | null>(null)

  const submit = async () => {
    if (pin.length !== 6) return
    setBusy(true)
    setResult(null)
    try {
      const response = await verifyEventPin(eventRecord.id, pin)
      setResult({ text: response.message, tone: response.code === 'success' ? 'success' : 'error' })
      if (response.code === 'success') setPin('')
    } catch (cause) {
      setResult({ text: friendlyError(cause, 'The event PIN could not be verified.'), tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Verify event PIN"
      description={`Claim scanner access for ${eventRecord.name}.`}
      size="sm"
      onClose={onClose}
    >
      <div className="space-y-4">
        {result && <Alert message={result.text} tone={result.tone} />}
        <label className="block">
          <span className="label">6-digit PIN</span>
          <input
            className="field kbd-pin"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            autoFocus
            placeholder="000000"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
          />
        </label>
        <p className="text-meta text-muted">A correct PIN grants scanner access for 12 hours.</p>
      </div>
      <ModalActions>
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={pin.length !== 6 || busy} onClick={() => void submit()}>
          {busy ? 'Verifying…' : 'Verify PIN'}
        </button>
      </ModalActions>
    </Modal>
  )
}
