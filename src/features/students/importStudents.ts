import type { Department } from '../../types/app'
import type { StudentImportRow } from '../../services/students'

export interface ImportIssue {
  row: number
  studentNumber: string | null
  message: string
  severity: 'error' | 'warning'
}

export interface ParsedStudentImport {
  fileName: string
  totalRows: number
  rows: StudentImportRow[]
  issues: ImportIssue[]
}

const headerAliases: Record<string, keyof StudentImportRow> = {
  student_number: 'student_number', student_id: 'student_number', id_number: 'student_number', id_no: 'student_number',
  full_name: 'full_name', name: 'full_name', student_name: 'full_name',
  year_level: 'year_level', year: 'year_level',
  sex: 'sex', gender: 'sex',
  department_code: 'department_code', department: 'department_code', department_id: 'department_code',
  is_active: 'is_active', active: 'is_active', status: 'is_active',
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function valueText(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function activeValue(value: unknown): boolean | null {
  const normalized = valueText(value).toLowerCase()
  if (!normalized) return true
  if (['true', '1', 'yes', 'active'].includes(normalized)) return true
  if (['false', '0', 'no', 'inactive'].includes(normalized)) return false
  return null
}

async function readRows(file: File): Promise<unknown[][]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv') {
    const Papa = (await import('papaparse')).default
    const result = Papa.parse<unknown[]>(await file.text(), { skipEmptyLines: 'greedy' })
    const firstError = result.errors[0]
    if (firstError) throw new Error(`CSV parsing failed near row ${(firstError.row ?? 0) + 1}.`)
    return result.data
  }
  if (extension === 'xlsx') {
    const readXlsxFile = (await import('read-excel-file/browser')).default
    return await readXlsxFile(file) as unknown as unknown[][]
  }
  throw new Error('Choose a .csv or .xlsx file.')
}

export async function parseStudentImport(file: File, departments: Department[]): Promise<ParsedStudentImport> {
  if (file.size > 5 * 1024 * 1024) throw new Error('The file is larger than 5 MB.')
  const matrix = await readRows(file)
  if (matrix.length < 2) throw new Error('The file needs a header row and at least one student row.')
  if (matrix.length > 2001) throw new Error('A single import can contain at most 2,000 student rows.')

  const indexes = new Map<keyof StudentImportRow, number>()
  matrix[0].forEach((header, index) => {
    const mapped = headerAliases[normalizeHeader(header)]
    if (mapped && !indexes.has(mapped)) indexes.set(mapped, index)
  })
  const required: Array<keyof StudentImportRow> = ['student_number', 'full_name', 'year_level', 'sex', 'department_code']
  const missing = required.filter((header) => !indexes.has(header))
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`)

  const departmentCodes = new Set(departments.filter((item) => !item.deleted_at).map((item) => item.code.toLowerCase()))
  const seen = new Set<string>()
  const issues: ImportIssue[] = []
  const rows: StudentImportRow[] = []

  matrix.slice(1).forEach((source, dataIndex) => {
    const rowNumber = dataIndex + 2
    const cell = (key: keyof StudentImportRow) => source[indexes.get(key) ?? -1]
    const rawStudentNumber = cell('student_number')
    const studentNumber = valueText(rawStudentNumber)
    const fullName = valueText(cell('full_name'))
    const rawYear = valueText(cell('year_level'))
    const sexText = valueText(cell('sex')).toLowerCase()
    const departmentCode = valueText(cell('department_code')).toUpperCase()
    const active = activeValue(cell('is_active'))
    const rowErrors: string[] = []

    if (!studentNumber) rowErrors.push('Student ID is required')
    else if (studentNumber.length > 80) rowErrors.push('Student ID is too long')
    if (!fullName) rowErrors.push('Full name is required')
    else if (fullName.length > 200) rowErrors.push('Full name is too long')
    const year = Number(rawYear)
    if (!Number.isInteger(year) || year < 1 || year > 4) rowErrors.push('Year level must be 1–4')
    const sex = sexText === 'male' ? 'Male' : sexText === 'female' ? 'Female' : null
    if (!sex) rowErrors.push('Sex must be Male or Female')
    if (!departmentCodes.has(departmentCode.toLowerCase())) rowErrors.push(`Unknown department code: ${departmentCode || '(blank)'}`)
    if (active === null) rowErrors.push('Active must be true/false, yes/no, or active/inactive')
    if (studentNumber && seen.has(studentNumber.toLowerCase())) rowErrors.push('Duplicate Student ID in this file')
    if (studentNumber) seen.add(studentNumber.toLowerCase())

    if (typeof rawStudentNumber === 'number') {
      issues.push({ row: rowNumber, studentNumber, message: 'Student ID was stored as a number; verify that no leading zero was lost.', severity: 'warning' })
    }
    if (rowErrors.length) {
      for (const message of rowErrors) issues.push({ row: rowNumber, studentNumber: studentNumber || null, message, severity: 'error' })
      return
    }
    rows.push({
      source_row: rowNumber,
      student_number: studentNumber,
      full_name: fullName,
      year_level: year,
      sex: sex!,
      department_code: departmentCode,
      is_active: active!,
    })
  })

  return { fileName: file.name, totalRows: matrix.length - 1, rows, issues }
}

export function downloadStudentImportTemplate() {
  const content = '\uFEFFstudent_number,full_name,year_level,sex,department_code,is_active\r\n'
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'kcp-student-import-template.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}
