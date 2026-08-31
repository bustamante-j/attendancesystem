import type { SheetData } from 'write-excel-file/browser'
import type { EventGuestAttendance, EventRecord, EventRosterStudentRow } from '../../types/app'
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

export async function exportEventRoster(
  eventRecord: EventRecord,
  students: EventRosterStudentRow[],
  guests: EventGuestAttendance[],
) {
  const rosterData: SheetData = [
    header(['Type', 'ID / Reference', 'Name', 'Department / Affiliation', 'Year', 'Sex', 'Status', 'Recorded at', 'Method', 'Check-out', 'Remarks']),
    ...students.map((row) => [
      row.is_expected ? 'Registered student' : 'Registered · outside audience',
      row.student_number,
      row.full_name,
      `${row.department_code} - ${row.department_name}`,
      row.year_level,
      row.sex,
      row.attendance_status.toUpperCase(),
      row.check_in_at ? formatManilaDate(row.check_in_at) : '',
      row.check_in_method?.toUpperCase() ?? '',
      row.check_out_at ? formatManilaDate(row.check_out_at) : '',
      row.remarks ?? '',
    ]),
    ...guests.map((row) => [
      'Temporary attendee',
      row.reference_number ?? '',
      row.full_name,
      row.affiliation ?? '',
      '',
      '',
      row.attendance_status.toUpperCase(),
      formatManilaDate(row.recorded_at),
      'MANUAL',
      '',
      row.remarks ?? '',
    ]),
  ]

  const expected = students.filter((row) => row.is_expected)
  const summaryData: SheetData = [
    [{ value: 'Attendly Event Attendance Roster', fontWeight: 'bold', fontSize: 16, columnSpan: 4 }],
    ['Event', eventRecord.name],
    ['Schedule', `${formatManilaDate(eventRecord.start_at)} - ${formatManilaDate(eventRecord.end_at)}`],
    ['Venue', eventRecord.venue || 'Not specified'],
    ['Exported', formatManilaDate(new Date())],
    [],
    header(['Expected', 'Present', 'Late', 'Absent', 'Temporary attendees']),
    [
      expected.length,
      expected.filter((row) => row.attendance_status === 'present').length,
      expected.filter((row) => row.attendance_status === 'late').length,
      expected.filter((row) => row.attendance_status === 'absent').length,
      guests.length,
    ],
  ]

  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([
    {
      sheet: 'Roster',
      data: rosterData,
      stickyRowsCount: 1,
      columns: [{ width: 26 }, { width: 20 }, { width: 30 }, { width: 30 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 23 }, { width: 12 }, { width: 23 }, { width: 36 }],
    },
    {
      sheet: 'Summary',
      data: summaryData,
      stickyRowsCount: 7,
      columns: [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }],
    },
  ]).toFile(`attendly-roster-${safeName(eventRecord.name)}-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
