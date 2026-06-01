import { parse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { ErrorRow } from '../types';
import { UNIFIED_CSV_COLUMNS } from '../config/constants';
import * as fs from 'fs';

/**
 * Detect whether a filename points to an Excel workbook.
 * Anything else is treated as CSV.
 */
export function isExcelFile(filename: string): boolean {
  return /\.xlsx?$/i.test(filename);
}

/** Read an Excel workbook into raw rows (header on row 0, then data rows). */
function excelToRawRows(buffer: Buffer): string[][] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  // header: 1 returns an array of arrays (no auto column names)
  // raw: false formats everything as strings so we match CSV behavior
  // defval: '' avoids undefined gaps for blank cells
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });
}

/**
 * Convert raw rows (where rawRows[0] is the header line and rawRows[1+] are
 * data rows) into a list of header-keyed records. Mirrors the behavior of
 * csv-parse with columns:true.
 */
function rawRowsToRecords(rawRows: string[][]): Record<string, string>[] {
  if (rawRows.length === 0) return [];
  const headers = (rawRows[0] || []).map((h) => String(h || '').trim());

  const out: Record<string, string>[] = [];
  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    if (row.every((c) => !c || String(c).trim() === '')) continue;
    const rec: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      rec[headers[c]] = String(row[c] ?? '').trim();
    }
    out.push(rec);
  }
  return out;
}

/**
 * Parse a CSV string into row objects keyed by header.
 * Use this when the CSV content is already in memory (e.g. from multer's
 * memoryStorage on Vercel, where the filesystem is read-only).
 */
export function parseCSVString(content: string): Record<string, string>[] {
  // Remove BOM if present
  const cleanContent = content.replace(/^﻿/, '');

  const records = parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  return records as Record<string, string>[];
}

/**
 * Auto-detect file type from filename and parse the in-memory buffer.
 * Use this from upload routes — handles both CSV and Excel transparently.
 */
export function parseRowsFromBuffer(
  buffer: Buffer,
  filename: string
): Record<string, string>[] {
  if (isExcelFile(filename)) {
    return rawRowsToRecords(excelToRawRows(buffer));
  }
  return parseCSVString(buffer.toString('utf-8'));
}

/** Disk-backed parser (kept for local dev / scripts). */
export function parseCSV(filePath: string): Record<string, string>[] {
  return parseCSVString(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Grade sheets from GGU use a multi-row header structure:
 *   Row 1: Title "MBA Master Grade Sheet" + per-course Credit values
 *   Row 2: Summary headers (Course Completed, Overall CGPA, Courses Incomplete)
 *   Row 3: Course names (one per pair of Grade/GPA columns)
 *   Row 4: Main field headers (GGU Student Email ID, Email, User ID, ...,
 *          Grade, GPA, Grade, GPA, ...)
 *   Row 5+: Data
 *
 * This parser reconstructs meaningful column names by combining row 2
 * (for the 3 blank header slots after "Status") and row 3 (course names)
 * with row 4. Grade/GPA cells become "<Course Name> - Grade" /
 * "<Course Name> - GPA" so each column is uniquely identifiable.
 */
/**
 * Reconstruct gradesheet records from the raw rows.
 * GGU gradesheets use a 4-row header before the data:
 *   Row 0: Title + per-course Credit values
 *   Row 1: Summary headers (Course Completed, Overall CGPA, Courses Incomplete)
 *   Row 2: Course names (paired with Grade/GPA columns)
 *   Row 3: Main field headers (Email, User ID, ..., Grade, GPA, Grade, GPA, ...)
 *   Row 4+: Data
 *
 * Grade/GPA cells get prefixed with their course name so each column is unique
 * (e.g. "Fundamentals of Business - Grade").
 */
function gradesheetRawRowsToRecords(
  rawRows: string[][]
): Record<string, string>[] {
  if (rawRows.length < 5) {
    // Doesn't look like a gradesheet — fall back to flat parsing
    return rawRowsToRecords(rawRows);
  }

  const summaryRow = rawRows[1] || [];
  const courseRow  = rawRows[2] || [];
  const headerRow  = rawRows[3] || [];

  const finalHeaders: string[] = [];
  for (let i = 0; i < headerRow.length; i++) {
    let h = String(headerRow[i] || '').trim();

    if (!h) {
      const sh = String(summaryRow[i] || '').trim();
      if (sh) h = sh;
    }

    if (h === 'Grade' || h === 'GPA') {
      let courseName = '';
      for (let j = i; j >= 0; j--) {
        const c = String(courseRow[j] || '').trim();
        if (c) { courseName = c; break; }
      }
      if (courseName) h = `${courseName} - ${h}`;
    }

    if (!h) h = `Column ${i + 1}`;
    finalHeaders.push(h);
  }

  const records: Record<string, string>[] = [];
  for (let r = 4; r < rawRows.length; r++) {
    const row = rawRows[r] || [];
    if (row.every((c) => !c || String(c).trim() === '')) continue;

    const record: Record<string, string> = {};
    for (let c = 0; c < finalHeaders.length; c++) {
      record[finalHeaders[c]] = String(row[c] ?? '').trim();
    }
    records.push(record);
  }

  return records;
}

/** In-memory variant of parseGradesheetCSV — preferred on serverless. */
export function parseGradesheetCSVString(content: string): Record<string, string>[] {
  const cleanContent = content.replace(/^﻿/, '');

  const rawRows = parse(cleanContent, {
    columns: false,
    skip_empty_lines: false,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  }) as string[][];

  if (rawRows.length < 5) {
    return parseCSVString(content);
  }

  return gradesheetRawRowsToRecords(rawRows);
}

/**
 * Auto-detect gradesheet file type from filename and parse the buffer.
 * Use this from upload routes — handles both CSV and Excel grade sheets.
 */
export function parseGradesheetFromBuffer(
  buffer: Buffer,
  filename: string
): Record<string, string>[] {
  if (isExcelFile(filename)) {
    return gradesheetRawRowsToRecords(excelToRawRows(buffer));
  }
  return parseGradesheetCSVString(buffer.toString('utf-8'));
}

/** Disk-backed wrapper for parseGradesheetCSVString. */
export function parseGradesheetCSV(filePath: string): Record<string, string>[] {
  return parseGradesheetCSVString(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Build the Voice AI unified-input CSV.
 *
 * One row per calling-data record. Each row carries the 11 top-level fields
 * (user_id, user_first_name, …, agent_id) sourced from the calling data,
 * plus a flat JSON `user_metadata` blob built by merging:
 *
 *   • The matching student-list row (joined on User ID)
 *   • The matching grade-sheet row    (joined on User ID)
 *
 * Duplicate metadata keys (e.g. Email, Cohort ID, Batch, Status, First/Last
 * Name appearing in both student list and grade sheet) get a ".1" suffix
 * on the grade-sheet copy — matches the pandas-style merge output the
 * Voice AI consumer expects.
 *
 * Course Grade/GPA headers — the parser emits "<Course> - Grade", but the
 * downstream Voice AI spec expects "<Course> Grade" (no dash). We strip
 * the dash here when flattening into user_metadata so the displayed View
 * Data tab stays readable while the unified output matches spec exactly.
 */
export function generateUnifiedCSV(
  studentData: Record<string, string>[],
  callingData: Record<string, string>[],
  gradeData: Record<string, string>[] = []
): string {
  // Index student / grade by User ID for O(1) joins on each calling row
  const indexByUserId = (
    src: Record<string, string>[]
  ): Map<string, Record<string, string>> => {
    const map = new Map<string, Record<string, string>>();
    for (const r of src) {
      const uid = String(r['User ID'] || '').trim();
      if (uid) map.set(uid, r);
    }
    return map;
  };
  const studentByUserId = indexByUserId(studentData);
  const gradeByUserId   = indexByUserId(gradeData);

  // Drop top-level fields from the student row before merging into metadata
  // (they're already exposed as columns). Also drop join keys to avoid noise.
  const STUDENT_DROP = new Set<string>([
    'User ID', 'First Name', 'Last Name', 'Contact',
    'Country Of Residence', 'Country of Residence', 'Country of  Residence',
    'University', 'Program', // tagged automatically by storage layer; redundant
  ]);
  const GRADE_DROP = new Set<string>(['User ID']);

  const buildMetadata = (
    student: Record<string, string> | undefined,
    grade:   Record<string, string> | undefined
  ): string => {
    const meta: Record<string, string> = {};

    if (student) {
      for (const [k, v] of Object.entries(student)) {
        if (STUDENT_DROP.has(k)) continue;
        meta[k] = v ?? '';
      }
    }
    if (grade) {
      for (const [k, v] of Object.entries(grade)) {
        if (GRADE_DROP.has(k)) continue;
        // "<Course> - Grade" → "<Course> Grade" (spec uses no dash)
        const cleanKey = k.replace(/ - (Grade|GPA)$/i, ' $1');
        // Suffix ".1" if the key already came from the student row
        const finalKey = Object.prototype.hasOwnProperty.call(meta, cleanKey)
          ? `${cleanKey}.1`
          : cleanKey;
        meta[finalKey] = v ?? '';
      }
    }
    return JSON.stringify(meta);
  };

  const getCountry = (r: Record<string, string>): string =>
    r['Country Of Residence'] ||
    r['Country of  Residence'] ||
    r['Country of Residence'] || '';

  const rows: Record<string, string>[] = [];

  for (const c of callingData) {
    const uid     = String(c['User ID'] || '').trim();
    const student = uid ? studentByUserId.get(uid) : undefined;
    const grade   = uid ? gradeByUserId.get(uid)   : undefined;

    rows.push({
      user_id:                   c['User ID']                  || '',
      user_first_name:           c['First Name']               || '',
      user_last_name:            c['Last Name']                || '',
      user_contact:              c['Contact']                  || '',
      // No 'From' column in current calling-data schema → blank.
      from_number:               c['From']                     || '',
      // Prefer the calling row's country; fall back to the student row.
      user_country_of_residence: getCountry(c) || (student ? getCountry(student) : ''),
      date_of_call:              c['Date ( DD/MM/YYYY)']       || '',
      time_of_call:              c['Time ( 24 Hours )']        || '',
      timezone:                  c['Timezone']                 || '',
      reason:                    c['Reason']                   || '',
      agent_id:                  c['Agent ID']                 || '',
      user_metadata:             buildMetadata(student, grade),
    });
  }

  return rowsToCSV(rows, UNIFIED_CSV_COLUMNS);
}

export function generateErrorReport(errorRows: ErrorRow[]): string {
  if (errorRows.length === 0) {
    return 'Row Number,Error Message\n';
  }

  // Collect all column names from error rows
  const allColumns = new Set<string>();
  for (const errorRow of errorRows) {
    Object.keys(errorRow.data).forEach((k) => allColumns.add(k));
  }

  const columns = ['Row Number', ...Array.from(allColumns), 'Error'];

  const rows = errorRows.map((errorRow) => {
    const row: Record<string, string> = {
      'Row Number': String(errorRow.rowNumber),
      Error: errorRow.errorMessage,
    };
    for (const col of allColumns) {
      row[col] = errorRow.data[col] || '';
    }
    return row;
  });

  return rowsToCSV(rows, columns);
}

function rowsToCSV(rows: Record<string, string>[], columns: string[]): string {
  const header = columns.map(escapeCSVValue).join(',');
  const dataRows = rows.map((row) =>
    columns.map((col) => escapeCSVValue(row[col] || '')).join(',')
  );
  return [header, ...dataRows].join('\n');
}

function escapeCSVValue(value: string): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
