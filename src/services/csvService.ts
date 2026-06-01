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
  // Index student / grade rows by BOTH User ID AND Email so the join survives
  // datasets that don't share the same User ID convention. We try User ID
  // first (the canonical join key), then fall back to Email when no User ID
  // match is found.
  const indexBy = (
    src: Record<string, string>[],
    keyFn: (r: Record<string, string>) => string
  ): Map<string, Record<string, string>> => {
    const map = new Map<string, Record<string, string>>();
    for (const r of src) {
      const k = keyFn(r);
      if (k) map.set(k, r);
    }
    return map;
  };
  const userId   = (r: Record<string, string>) => String(r['User ID'] || '').trim();
  const email    = (r: Record<string, string>) =>
    String(r['Email'] || r['Email ID'] || '').toLowerCase().trim();

  const studentByUserId = indexBy(studentData, userId);
  const studentByEmail  = indexBy(studentData, email);
  const gradeByUserId   = indexBy(gradeData,   userId);
  const gradeByEmail    = indexBy(gradeData,   email);

  // For each calling row, prefer User-ID match, then Email match.
  const lookupStudent = (c: Record<string, string>) => {
    const uid = userId(c);
    if (uid && studentByUserId.has(uid)) return studentByUserId.get(uid);
    const em = email(c);
    if (em && studentByEmail.has(em)) return studentByEmail.get(em);
    return undefined;
  };
  const lookupGrade = (c: Record<string, string>) => {
    const uid = userId(c);
    if (uid && gradeByUserId.has(uid)) return gradeByUserId.get(uid);
    const em = email(c);
    if (em && gradeByEmail.has(em)) return gradeByEmail.get(em);
    return undefined;
  };

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

  /**
   * Voice AI scheduler date format: M/D/YY (US, single-digit allowed).
   * Accepts the common input formats and normalizes:
   *   01-06-2026, 01/06/2026 (DD-MM-YYYY)  → 6/1/26
   *   6/1/26, 6/1/2026, 6-1-26 (M/D/YY[YY]) → 6/1/26  (already-normalized)
   *   2026-06-01 (ISO YYYY-MM-DD)           → 6/1/26
   */
  const normalizeCallDate = (s: string): string => {
    if (!s) return '';
    const trimmed = s.trim();

    // ISO yyyy-mm-dd
    const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      const y = parseInt(iso[1], 10), m = parseInt(iso[2], 10), d = parseInt(iso[3], 10);
      return `${m}/${d}/${String(y).slice(-2)}`;
    }
    // Generic n-n-n or n/n/n
    const m = trimmed.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})$/);
    if (m) {
      let a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = parseInt(m[3], 10);
      let day: number, month: number, year: number;
      if (a > 31) {
        // YYYY-MM-DD style with non-dash separators
        year = a; month = b; day = c;
      } else if (c > 31 || c >= 100) {
        // n-n-YYYY — assume DD-MM-YYYY (user's input format) unless first > 12
        year = c;
        if (a > 12) { day = a; month = b; }
        else if (b > 12) { day = b; month = a; }
        else { day = a; month = b; } // ambiguous — trust DD-MM as input convention
      } else {
        // M/D/YY (already in target form)
        month = a; day = b; year = c < 100 ? 2000 + c : c;
      }
      if (year < 100) year += 2000;
      return `${month}/${day}/${String(year).slice(-2)}`;
    }
    return trimmed;
  };

  /**
   * Voice AI scheduler expects IANA timezone identifiers (e.g. Asia/Kolkata)
   * rather than UTC offsets — offsets don't account for daylight saving so
   * most schedulers reject them. Map common abbreviations + offsets we see
   * in GGU calling data; passthrough if already IANA (contains a slash).
   */
  const normalizeTimezone = (s: string): string => {
    if (!s) return '';
    const t = s.trim();
    if (t.includes('/')) return t; // already IANA (Asia/Kolkata, etc.)
    const upper = t.toUpperCase().replace(/\s+/g, '');
    const TZ: Record<string, string> = {
      // India
      'IST':        'Asia/Kolkata',
      'GMT+5:30':   'Asia/Kolkata',
      'GMT+05:30':  'Asia/Kolkata',
      'UTC+5:30':   'Asia/Kolkata',
      'UTC+05:30':  'Asia/Kolkata',
      '+5:30':      'Asia/Kolkata',
      '+05:30':     'Asia/Kolkata',
      // Singapore / Malaysia / HK / China
      'SGT':        'Asia/Singapore',
      'GMT+8':      'Asia/Singapore',
      'GMT+08':     'Asia/Singapore',
      'GMT+08:00':  'Asia/Singapore',
      'HKT':        'Asia/Hong_Kong',
      'CST':        'Asia/Shanghai',  // China Std Time (overrides US CST below)
      // Vietnam / Thailand / Indonesia
      'ICT':        'Asia/Bangkok',
      'GMT+7':      'Asia/Bangkok',
      'GMT+07':     'Asia/Bangkok',
      'GMT+07:00':  'Asia/Bangkok',
      // Middle East
      'GST':        'Asia/Dubai',
      'GMT+4':      'Asia/Dubai',
      'GMT+04':     'Asia/Dubai',
      'GMT+3':      'Asia/Riyadh',
      // Europe
      'GMT':        'Europe/London',
      'GMT+0':      'Europe/London',
      'UTC':        'Europe/London',
      'BST':        'Europe/London',
      'CET':        'Europe/Paris',
      'CEST':       'Europe/Paris',
      'GMT+1':      'Europe/Paris',
      'GMT+01':     'Europe/Paris',
      'GMT+01:00':  'Europe/Paris',
      'GMT+2':      'Europe/Athens',
      // Americas
      'EST':        'America/New_York',
      'EDT':        'America/New_York',
      'GMT-5':      'America/New_York',
      'GMT-4':      'America/New_York',
      'PST':        'America/Los_Angeles',
      'PDT':        'America/Los_Angeles',
      'GMT-8':      'America/Los_Angeles',
      'GMT-7':      'America/Los_Angeles',
      'MST':        'America/Denver',
      'MDT':        'America/Denver',
      'GMT-6':      'America/Chicago',
      'GMT-2:30':   'America/St_Johns',
      'GMT-3:30':   'America/St_Johns',
      // Australia
      'AEST':       'Australia/Sydney',
      'AEDT':       'Australia/Sydney',
      'GMT+10':     'Australia/Sydney',
      'GMT+11':     'Australia/Sydney',
    };
    return TZ[upper] || t; // unknown → pass through; scheduler will surface it
  };

  for (const c of callingData) {
    const student = lookupStudent(c);
    const grade   = lookupGrade(c);

    rows.push({
      user_id:                   c['User ID']                  || '',
      user_first_name:           c['First Name']               || '',
      user_last_name:            c['Last Name']                || '',
      // Source columns now match the unified-output naming, but fall back to
      // older header spellings so previously-uploaded files still resolve.
      user_contact:              c['user_contact']             || c['Contact'] || '',
      from_number:               c['from_number']              || c['From']    || '',
      user_country_of_residence:
        c['user_country_of_residence'] ||
        getCountry(c) ||
        (student ? getCountry(student) : ''),
      date_of_call:              normalizeCallDate(c['date_of_call'] || c['Date ( DD/MM/YYYY)'] || ''),
      time_of_call:              c['time_of_call'] || c['Time ( 24 Hours )']  || '',
      timezone:                  normalizeTimezone(c['timezone'] || c['Timezone'] || ''),
      // Per the calling_data.xlsx spec, `reason` in the unified output is
      // left blank — the scheduler routes by `agent_id` and looks up the
      // human-readable agent name (e.g. "Grade Dispute Agent") from its own
      // agent registry. Putting the same name back into `reason` was causing
      // the scheduler to mark calls as 'skipped'. Raw upload row still has
      // the input reason; only the unified output suppresses it.
      reason:                    '',
      agent_id:                  c['agent_id']     || c['Agent ID']           || '',
      user_metadata:             buildMetadata(student, grade),
    });
  }

  // Plain CSV — no Excel text-cell formulas. Long digit strings will look
  // like scientific notation in Excel's default open view, but the underlying
  // bytes are correct and downstream consumers (the Voice AI agent console,
  // pandas, any CSV reader) get the raw string values they expect.
  // To view this file properly in Excel: use Data → From Text/CSV and mark
  // the long-number columns as Text in the import wizard. Or open in Numbers
  // / a code editor / Google Sheets, all of which preserve the values.
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

function rowsToCSV(
  rows: Record<string, string>[],
  columns: string[],
  textCols?: Set<string>
): string {
  const header = columns.map(escapeCSVValue).join(',');
  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const v = row[col] || '';
        if (v && textCols?.has(col)) return excelTextCell(v);
        return escapeCSVValue(v);
      })
      .join(',')
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

/**
 * Excel text-cell formula:  ="918928220913"
 * Forces Excel to display long digit strings as TEXT instead of scientific
 * notation. CSV-escaped on disk as  "=""918928220913"""
 * Voice AI / pandas consumers should strip the leading =" and trailing "
 * before use — one-liner:  re.sub(r'^="(.+)"$', r'\1', val)
 */
function excelTextCell(v: string): string {
  return `"=""${v.replace(/"/g, '""')}"""`;
}
