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

export function generateUnifiedCSV(
  studentData: Record<string, string>[],
  callingData: Record<string, string>[]
): string {
  // Build a lookup map for calling data by Email ID
  const callingMap = new Map<string, Record<string, string>>();
  for (const record of callingData) {
    const email = (record['Email ID'] || '').toLowerCase().trim();
    if (email) {
      callingMap.set(email, record);
    }
  }

  const rows: Record<string, string>[] = [];

  // Helper: handles both 'Country of  Residence' (two spaces, current CSV format)
  // and legacy 'Country Of Residence' / 'Country of Residence' variants.
  const getCountry = (s: Record<string, string>): string =>
    s['Country of  Residence'] ||
    s['Country of Residence']  ||
    s['Country Of Residence']  ||
    '';

  // Helper: student CSV uses 'Email', legacy used 'Email ID' — read either.
  const getStudentEmail = (s: Record<string, string>): string =>
    (s['Email'] || s['Email ID'] || '').toLowerCase().trim();

  for (const student of studentData) {
    const email = getStudentEmail(student);
    const callingRecord = callingMap.get(email);

    const university = callingRecord?.['University'] || student['University'] || '';
    const program    = callingRecord?.['Program']    || student['Program']    || '';

    const userMetadata = JSON.stringify({
      Email:       student['Email'] || student['Email ID'] || callingRecord?.['Email ID'] || '',
      University:  university,
      Program:     program,
      Cohort:      student['Cohort #']           || '',
      Status:      student['Status']             || '',
      GGU_User_ID: student['GGU User ID']        || '',
      Region:      student['Region']             || '',
    });

    const unifiedRow: Record<string, string> = {
      user_id:      student['User ID']                                          || '',
      user_first:   student['First Name']  || callingRecord?.['First Name']     || '',
      user_last:    student['Last Name']   || callingRecord?.['Last Name']      || '',
      user_contact: student['Contact']     || callingRecord?.['Contact']        || '',
      from_number:  callingRecord?.['From']                                     || '',
      user_country: getCountry(student),
      date_of_call: callingRecord?.['Scheduled Date']                           || '',
      time_of_call: callingRecord?.['Scheduled Time']                           || '',
      timezone:     callingRecord?.['Timezone']                                 || '',
      reason:       callingRecord?.['Query Type']                               || '',
      agent_id:     callingRecord?.['Agent Name']                               || '',
      user_metadata: userMetadata,
    };

    rows.push(unifiedRow);
  }

  // Also add calling data records that don't have a matching student
  for (const record of callingData) {
    const email = (record['Email ID'] || '').toLowerCase().trim();
    const hasStudent = studentData.some(
      (s) => getStudentEmail(s) === email
    );

    if (!hasStudent) {
      const userMetadata = JSON.stringify({
        Email:      record['Email ID']  || '',
        University: record['University'] || '',
        Program:    record['Program']   || '',
        Cohort:     '',
        Status:     '',
      });

      const unifiedRow: Record<string, string> = {
        user_id:      '',
        user_first:   record['First Name']      || '',
        user_last:    record['Last Name']       || '',
        user_contact: record['Contact']         || '',
        from_number:  record['From']            || '',
        user_country: record['University']      || '',
        date_of_call: record['Scheduled Date']  || '',
        time_of_call: record['Scheduled Time']  || '',
        timezone:     record['Timezone']        || '',
        reason:       record['Query Type']      || '',
        agent_id:     record['Agent Name']      || '',
        user_metadata: userMetadata,
      };
      rows.push(unifiedRow);
    }
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
