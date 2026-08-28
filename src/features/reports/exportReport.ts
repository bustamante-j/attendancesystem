import type { SheetData } from 'write-excel-file/browser'
import type { AttendanceReportRow, EventRecord } from '../../types/app'
import { formatManilaDate } from '../../utils/dates'

const HEADER_STYLE = {
  fontWeight: 'bold' as const,
  backgroundColor: '#1D4ED8',
  textColor: '#FFFFFF',
  align: 'center' as const,
  wrap: true,
}

function header(values: string[]) {
  return values.map((value) => ({ value, ...HEADER_STYLE }))
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event'
}

function groupCounts(rows: AttendanceReportRow[], key: (row: AttendanceReportRow) => string) {
  const groups = new Map<string, { expected: number; present: number; late: number; absent: number }>()
  for (const row of rows) {
    const label = key(row)
    const current = groups.get(label) ?? { expected: 0, present: 0, late: 0, absent: 0 }
    if (row.is_expected) current.expected += 1
    current[row.attendance_status] += 1
    groups.set(label, current)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

export async function exportAttendanceReport(eventRecord: EventRecord, rows: AttendanceReportRow[]) {
  const attendanceData: SheetData = [
    header(['Student ID', 'Student Name', 'Department', 'Year Level', 'Sex', 'Status', 'Check-in', 'Method', 'Check-out', 'Method']),
    ...rows.map((row) => [
      row.student_number,
      row.full_name,
      `${row.department_code} - ${row.department_name}`,
      row.year_level,
      row.sex,
      row.attendance_status.toUpperCase(),
      row.check_in_at ? formatManilaDate(row.check_in_at) : '',
      row.check_in_method?.toUpperCase() ?? '',
      row.check_out_at ? formatManilaDate(row.check_out_at) : '',
      row.check_out_method?.toUpperCase() ?? '',
    ]),
  ]

  const summaryData: SheetData = [
    [{ value: 'Attendly Event Attendance Report', fontWeight: 'bold', fontSize: 16, columnSpan: 5 }],
    ['Event', eventRecord.name],
    ['Schedule', `${formatManilaDate(eventRecord.start_at)} - ${formatManilaDate(eventRecord.end_at)}`],
    ['Venue', eventRecord.venue || 'Not specified'],
    ['Exported', formatManilaDate(new Date())],
    [],
    header(['Group', 'Expected', 'Present', 'Late', 'Absent']),
    ...groupCounts(rows, (row) => `Department: ${row.department_code}`).map(([label, counts]) => [label, counts.expected, counts.present, counts.late, counts.absent]),
    ...groupCounts(rows, (row) => `Year ${row.year_level}`).map(([label, counts]) => [label, counts.expected, counts.present, counts.late, counts.absent]),
  ]

  const absentRows = rows.filter((row) => row.attendance_status === 'absent')
  const absentData: SheetData = [
    header(['Student ID', 'Student Name', 'Department', 'Year Level', 'Sex']),
    ...absentRows.map((row) => [row.student_number, row.full_name, row.department_code, row.year_level, row.sex]),
  ]

  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([
    { sheet: 'Attendance', data: attendanceData, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 28 }, { width: 28 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 22 }, { width: 12 }, { width: 22 }, { width: 12 }] },
    { sheet: 'Summary', data: summaryData, stickyRowsCount: 7, columns: [{ width: 32 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }] },
    { sheet: 'Absent', data: absentData, stickyRowsCount: 1, columns: [{ width: 18 }, { width: 28 }, { width: 18 }, { width: 12 }, { width: 10 }] },
  ]).toFile(`attendly-${safeName(eventRecord.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
