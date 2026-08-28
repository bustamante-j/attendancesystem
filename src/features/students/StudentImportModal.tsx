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
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          Upload a `.csv` or `.xlsx` file up to 5 MB and 2,000 rows. Required columns are <code>student_number</code>, <code>full_name</code>, <code>year_level</code>, <code>sex</code>, and <code>department_code</code>. <code>is_active</code> is optional.
        </div>
        {error && <Alert message={error} />}
        {result && <Alert tone="success" message={`Import completed: ${result.inserted} created, ${result.updated} updated, ${result.errors.length} rejected by the database.`} />}
        <div className="flex flex-wrap gap-3">
          <label className="btn-primary cursor-pointer">
            <FileSpreadsheet size={17} /> {busy ? 'Reading…' : 'Choose CSV or Excel'}
            <input className="sr-only" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])} />
          </label>
          <button className="btn-secondary" onClick={downloadStudentImportTemplate}><Download size={17} /> Download CSV template</button>
        </div>
        {parsed && <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-100 p-4"><div className="text-xs text-slate-500">File</div><div className="mt-1 truncate font-medium">{parsed.fileName}</div></div>
            <div className="rounded-lg bg-slate-100 p-4"><div className="text-xs text-slate-500">Data rows</div><div className="mt-1 text-xl font-bold">{parsed.totalRows}</div></div>
            <div className="rounded-lg bg-emerald-50 p-4"><div className="text-xs text-emerald-700">Valid rows</div><div className="mt-1 text-xl font-bold text-emerald-800">{parsed.rows.length}</div></div>
            <div className="rounded-lg bg-red-50 p-4"><div className="text-xs text-red-700">Validation errors</div><div className="mt-1 text-xl font-bold text-red-800">{validationErrors.length}</div></div>
          </div>
          {(validationErrors.length > 0 || warnings.length > 0) && <div className="max-h-64 overflow-auto rounded-lg border border-slate-200"><table><thead><tr><th>Row</th><th>Student ID</th><th>Severity</th><th>Issue</th></tr></thead><tbody>{parsed.issues.slice(0, 300).map((issue, index) => <tr key={`${issue.row}-${index}`}><td>{issue.row}</td><td>{issue.studentNumber || '—'}</td><td className={issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}>{issue.severity}</td><td>{issue.message}</td></tr>)}</tbody></table>{parsed.issues.length > 300 && <p className="p-3 text-sm text-slate-500">Only the first 300 issues are shown.</p>}</div>}
          <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm"><input className="mt-1" type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} /><span><strong>Update matching Student IDs</strong><span className="mt-1 block text-slate-500">When enabled, existing non-deleted students are updated. Otherwise matching IDs are rejected and reported.</span></span></label>
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><button className="btn-secondary" onClick={onClose} disabled={busy}>Close</button><button className="btn-primary" onClick={() => void runImport()} disabled={busy || !parsed.rows.length}><Upload size={17} /> {busy ? 'Importing…' : `Import ${parsed.rows.length} valid rows`}</button></div>
        </>}
        {result?.errors.length ? <div><h3 className="mb-2 font-semibold">Database rejections</h3><div className="max-h-48 overflow-auto rounded-lg border"><table><thead><tr><th>Source row</th><th>Student ID</th><th>Reason</th></tr></thead><tbody>{result.errors.map((issue, index) => <tr key={`${issue.row}-${index}`}><td>{issue.row}</td><td>{issue.studentNumber || '—'}</td><td>{issue.message}</td></tr>)}</tbody></table></div></div> : null}
      </div>
    </Modal>
  )
}
