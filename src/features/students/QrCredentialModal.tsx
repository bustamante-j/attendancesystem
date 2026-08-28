import { Download, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import type { Student } from '../../types/app'
import { createQrDataUrl, downloadDataUrl } from './qr'

interface IssuedCredential { studentId: string; credential: string }
interface QrCard { student: Student; credential: string; dataUrl: string }

export function QrCredentialModal({ students, credentials, onClose }: { students: Student[]; credentials: IssuedCredential[]; onClose: () => void }) {
  const [cards, setCards] = useState<QrCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])

  useEffect(() => {
    let current = true
    void Promise.all(credentials.map(async (item) => {
      const student = studentMap.get(item.studentId)
      if (!student) throw new Error('A selected student is no longer available.')
      return { student, credential: item.credential, dataUrl: await createQrDataUrl(item.credential) }
    })).then((result) => { if (current) setCards(result) }).catch((cause: unknown) => { if (current) setError(cause instanceof Error ? cause.message : 'QR images could not be rendered.') })
    return () => { current = false }
  }, [credentials, studentMap])

  return (
    <Modal title={credentials.length > 1 ? `Issued ${credentials.length} QR credentials` : 'QR credential issued'} onClose={onClose} size="full">
      <div className="no-print mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        These credentials are shown once. Download or print them before closing this window. Issuing again revokes the current credential.
      </div>
      {error && <div className="no-print mb-5 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}
      <div className="no-print mb-5 flex flex-wrap gap-3">
        <button className="btn-primary" disabled={cards.length !== credentials.length} onClick={() => window.print()}><Printer size={17} /> Print credential sheet</button>
        <span className="self-center text-sm text-slate-500">Use each card’s download button for an individual PNG.</span>
      </div>
      {!cards.length && !error && <div className="py-12 text-center text-slate-500">Rendering secure QR images…</div>}
      <div className="qr-print-area grid gap-5 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2">
        {cards.map((card) => <article className="qr-print-card break-inside-avoid rounded-xl border-2 border-slate-800 bg-white p-5 text-center" key={card.student.id}>
          <div className="text-lg font-bold">KCP Attendance</div>
          <div className="text-xs uppercase tracking-wide text-slate-500">King's College of the Philippines</div>
          <img className="mx-auto my-3 aspect-square w-full max-w-64" src={card.dataUrl} alt={`QR credential for ${card.student.full_name}`} />
          <div className="text-lg font-semibold">{card.student.full_name}</div>
          <div className="mt-1 font-mono text-sm">{card.student.student_number}</div>
          <div className="mt-1 text-sm text-slate-600">{card.student.departments?.code} · Year {card.student.year_level}</div>
          <p className="mt-3 text-xs text-slate-500">Present this credential at authorized KCP events. Do not share it.</p>
          <button className="btn-secondary no-print mt-4" onClick={() => downloadDataUrl(card.dataUrl, `KCP-QR-${card.student.student_number}.png`)}><Download size={16} /> Download PNG</button>
        </article>)}
      </div>
    </Modal>
  )
}
