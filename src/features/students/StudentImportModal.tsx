import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useState } from 'react'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { friendlyError } from '../../lib/errors'
import { bulkImportStudents, type StudentImportResult } from '../../services/students'
import type { Department } from '../../types/app'
import { downloadStudentImportTemplate, parseStudentImport, type ParsedStudentImport } from './importStudents'

export function StudentImportModal({ departments, onClose, onImported }: { departments: Department[]; onClose: () => void; onImported: () => Promise<void> }) {
  const [parsed, setParsed] = useState<ParsedStudentImport | null>(null)
  const [result, setResult] = useState<StudentImportResult | null>(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chooseFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null); setResult(null)
    try { setParsed(await parseStudentImport(file, departments)) }
    catch (cause) { setParsed(null); setError(friendlyError(cause, 'The file could not be read.')) }
    finally { setBusy(false) }
  }

  const runImport = async () => {
    if (!parsed?.rows.length) return
    setBusy(true); setError(null)
    try {
      const nextResult = await bulkImportStudents(parsed.rows, updateExisting)
      setResult(nextResult)
      await onImported()
    } catch (cause) { setError(friendlyError(cause, 'The import could not be completed.')) }
    finally { setBusy(false) }
  }

  const validationErrors = parsed?.issues.filter((issue) => issue.severity === 'error') ?? []
  const warnings = parsed?.issues.filter((issue) => issue.severity === 'warning') ?? []
  return (
    <Modal title="Import students" onClose={onClose} size="xl" closeDisabled={busy}>
      <div className="space-y-5">
        <p className="rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-meta text-muted">
          Upload a <code>.csv</code> or <code>.xlsx</code> file up to 5 MB and 2,000 rows. Required columns:{' '}
          <code>student_number</code>, <code>full_name</code>, <code>year_level</code>, <code>sex</code>,{' '}
          <code>department_code</code>. <code>is_active</code> is optional.
        </p>

        {error && <Alert message={error} />}
        {result && <Alert tone="success" message={`Import completed: ${result.inserted} created, ${result.updated} updated, ${result.errors.length} rejected by the database.`} />}

        <div className="flex flex-wrap gap-2">
          <label className="btn-primary cursor-pointer">
            <FileSpreadsheet size={15} /> {busy ? 'Reading…' : 'Choose CSV or Excel'}
            <input
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={busy}
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
          <button className="btn-secondary" onClick={downloadStudentImportTemplate}><Download size={15} /> CSV template</button>
        </div>

        {parsed && (
          <>
            <div className="stat-strip grid-cols-2 sm:grid-cols-4">
              <div className="stat">
                <div className="stat-label">File</div>
                <div className="mt-1 truncate text-base text-ink" title={parsed.fileName}>{parsed.fileName}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Data rows</div>
                <div className="stat-value text-2xl">{parsed.totalRows}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Valid rows</div>
                <div className="stat-value text-2xl">{parsed.rows.length}</div>
              </div>
              <div className="stat">
                <div className="stat-label">Validation errors</div>
                <div className={`stat-value text-2xl ${validationErrors.length ? 'text-bad-ink' : ''}`}>{validationErrors.length}</div>
              </div>
            </div>

            {(validationErrors.length > 0 || warnings.length > 0) && (
              <div className="table-shell">
                <div className="max-h-64 overflow-auto">
                  <table>
                    <thead><tr><th>Row</th><th>Student ID</th><th>Severity</th><th>Issue</th></tr></thead>
                    <tbody>
                      {parsed.issues.slice(0, 300).map((issue, index) => (
                        <tr key={`${issue.row}-${index}`}>
                          <td className="tabular-nums">{issue.row}</td>
                          <td className="font-mono text-meta">{issue.studentNumber || '—'}</td>
                          <td className={`capitalize ${issue.severity === 'error' ? 'text-bad-ink' : 'text-warn-ink'}`}>{issue.severity}</td>
                          <td className="text-muted">{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.issues.length > 300 && <p className="table-foot">Only the first 300 issues are shown.</p>}
              </div>
            )}

            <label className="flex items-start gap-3 rounded-lg border border-line p-3.5">
              <input className="mt-0.5" type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} />
              <span>
                <span className="block font-medium text-ink">Update matching Student IDs</span>
                <span className="mt-0.5 block text-meta text-muted">
                  When enabled, existing non-deleted students are updated. Otherwise matching IDs are rejected and reported.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-secondary" onClick={onClose} disabled={busy}>Close</button>
              <button className="btn-primary" onClick={() => void runImport()} disabled={busy || !parsed.rows.length}>
                <Upload size={15} /> {busy ? 'Importing…' : `Import ${parsed.rows.length} valid rows`}
              </button>
            </div>
          </>
        )}

        {result?.errors.length ? (
          <div>
            <h3 className="section-title mb-2">Database rejections</h3>
            <div className="table-shell">
              <div className="max-h-48 overflow-auto">
                <table>
                  <thead><tr><th>Source row</th><th>Student ID</th><th>Reason</th></tr></thead>
                  <tbody>
                    {result.errors.map((issue, index) => (
                      <tr key={`${issue.row}-${index}`}>
                        <td className="tabular-nums">{issue.row}</td>
                        <td className="font-mono text-meta">{issue.studentNumber || '—'}</td>
                        <td className="text-muted">{issue.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
