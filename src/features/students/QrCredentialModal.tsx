import { Download, Printer } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import type { Student } from '../../types/app'
import { createQrCardObjectUrl, downloadUrl } from './qr'

interface IssuedCredential { studentId: string; credential: string }
interface QrCard { student: Student; imageUrl: string }

const RENDER_BATCH_SIZE = 4

export function QrCredentialModal({ students, credentials, mode, onClose }: { students: Student[]; credentials: IssuedCredential[]; mode: 'issued' | 'viewed'; onClose: () => void }) {
  const [cards, setCards] = useState<QrCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const studentMap = useMemo(() => new Map(students.map((student) => [student.id, student])), [students])
  const isSingleCredential = credentials.length === 1

  useEffect(() => {
    let current = true
    const ownedUrls: string[] = []
    setCards([])
    setError(null)
    const renderCards = async () => {
      for (let index = 0; index < credentials.length; index += RENDER_BATCH_SIZE) {
        const settled = await Promise.allSettled(credentials.slice(index, index + RENDER_BATCH_SIZE).map(async (item) => {
          const student = studentMap.get(item.studentId)
          if (!student) throw new Error('A selected student is no longer available.')
          const imageUrl = await createQrCardObjectUrl(item.credential, {
            fullName: student.full_name,
            studentNumber: student.student_number,
            sex: student.sex,
            departmentCode: student.departments?.code,
            yearLevel: student.year_level,
          })
          return { student, imageUrl }
        }))
        const batch = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
        const failure = settled.find((result) => result.status === 'rejected')
        if (!current || failure) {
          batch.forEach((card) => URL.revokeObjectURL(card.imageUrl))
          if (failure?.status === 'rejected') throw failure.reason
          return
        }
        ownedUrls.push(...batch.map((card) => card.imageUrl))
        setCards((rendered) => [...rendered, ...batch])
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      }
    }
    void renderCards().catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'QR images could not be rendered.')
    })
    return () => {
      current = false
      ownedUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [credentials, studentMap])

  return (
    <Modal title={mode === 'viewed' ? 'View student QR credential' : credentials.length > 1 ? `Issued ${credentials.length} QR credentials` : 'QR credential issued'} onClose={onClose} size={isSingleCredential ? 'md' : 'full'}>
      <div className={isSingleCredential ? 'mx-auto max-w-md' : ''}>
        <p className="no-print mb-4 rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-meta text-muted">
          {mode === 'viewed'
            ? 'This is the student’s active credential. You can download or print it again.'
            : 'The new credential is active and can be securely viewed again by a Super Admin. Regenerating it will revoke this copy.'}
        </p>
        {error && <div className="no-print mb-4"><Alert message={error} /></div>}

        <div className={`no-print mb-5 flex flex-wrap items-center gap-3 ${isSingleCredential ? 'justify-center' : ''}`}>
          <button className="btn-primary" disabled={cards.length !== credentials.length} onClick={() => window.print()}>
            <Printer size={15} /> Print credential sheet
          </button>
          <span className="text-meta text-muted">Each card has its own PNG download.</span>
        </div>

        {cards.length < credentials.length && !error && (
          <p className="py-4 text-center text-base text-muted" aria-live="polite">
            Rendering secure QR images… {cards.length} of {credentials.length}
          </p>
        )}

        <div className={`qr-print-area grid gap-4 ${isSingleCredential ? 'mx-auto max-w-sm grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2'}`}>
          {cards.map((card) => (
            <article className="qr-print-card break-inside-avoid rounded-xl border border-line bg-white p-3 text-center" key={card.student.id}>
              <img
                className="mx-auto w-full max-w-sm"
                src={card.imageUrl}
                alt={`Attendly QR card for ${card.student.full_name}, ${card.student.student_number}, ${card.student.sex}`}
              />
              <button
                className="btn-secondary no-print mt-3"
                onClick={() => downloadUrl(card.imageUrl, `Attendly-QR-${card.student.student_number}.png`)}
              >
                <Download size={15} /> Download PNG
              </button>
            </article>
          ))}
        </div>
      </div>
    </Modal>
  )
}
