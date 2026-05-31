import { ValidationResult, ErrorRow } from '../types';
import { OPTIONAL_COLUMNS } from '../config/constants';

/**
 * "mandatory-list" model: every column in `mandatoryColumns` must exist and
 * have a non-empty value on every row. Used by grade-sheet and calling-data.
 */
export function validateRows(
  rows: Record<string, string>[],
  mandatoryColumns: string[]
): ValidationResult {
  const valid: Record<string, string>[] = [];
  const errors: ErrorRow[] = [];

  rows.forEach((row, index) => {
    const missingColumns: string[] = [];

    for (const col of mandatoryColumns) {
      const value = row[col];
      if (value === undefined || value === null || String(value).trim() === '') {
        missingColumns.push(col);
      }
    }

    if (missingColumns.length === 0) {
      valid.push(row);
    } else {
      errors.push({
        rowNumber: index + 2, // +2 because row 1 is header, arrays are 0-indexed
        data: row,
        errorMessage: `Missing required fields: ${missingColumns.join(', ')}`,
      });
    }
  });

  return { valid, errors };
}

/**
 * "all-except-optional" model: every column present in the uploaded CSV is
 * required to have a value, EXCEPT the columns named in `optionalColumns`.
 *
 * This is used for student-list across MBA / DBA / ET, where the exact
 * column set varies by course but the small list of optional columns
 * (Prism User ID, GGU User ID, GGU Email, Region, Concentration) is fixed.
 *
 * Padding rows (every key identifier empty: Email + First Name + Last Name)
 * are skipped silently — they're typically artifacts of Excel/Sheets export.
 */
export function validateAllExceptOptional(
  rows: Record<string, string>[],
  optionalColumns: string[]
): ValidationResult {
  const valid: Record<string, string>[] = [];
  const errors: ErrorRow[] = [];

  // Case-insensitive lookup so "Region" and "region" both match
  const optionalSet = new Set(optionalColumns.map((c) => c.toLowerCase().trim()));
  const isOptional = (col: string): boolean => optionalSet.has(col.toLowerCase().trim());

  rows.forEach((row, index) => {
    // Skip padding rows (no Email / First Name / Last Name at all)
    const email     = String(row['Email']      || row['Email ID'] || '').trim();
    const firstName = String(row['First Name'] || '').trim();
    const lastName  = String(row['Last Name']  || '').trim();
    if (!email && !firstName && !lastName) return;

    const missing: string[] = [];
    for (const col of Object.keys(row)) {
      if (isOptional(col)) continue;
      const v = row[col];
      if (v === undefined || v === null || String(v).trim() === '') {
        missing.push(col);
      }
    }

    if (missing.length === 0) {
      valid.push(row);
    } else {
      errors.push({
        rowNumber: index + 2,
        data: row,
        errorMessage: `Missing required fields: ${missing.join(', ')}`,
      });
    }
  });

  return { valid, errors };
}

/**
 * Student list uses the opt-out validator — column set varies by course,
 * but the small optional list (Prism User ID, GGU User ID, GGU Email,
 * Region, Concentration) stays constant.
 */
export function validateStudentList(rows: Record<string, string>[]): ValidationResult {
  return validateAllExceptOptional(rows, OPTIONAL_COLUMNS['student-list'] || []);
}

/**
 * Grade sheet uses the opt-out model too. Optional set:
 *   - The 3 explicitly client-flagged columns
 *     (Slot / Concentration, GGU Learner Status, Last Name)
 *   - All per-course "<Course Name> - Grade" / "<Course Name> - GPA" columns —
 *     these can legitimately be empty for courses a student hasn't attempted
 *     yet (e.g. Concentration 1/2/3 in the sample data).
 *
 * Padding-row detection (Email + First Name + Last Name all blank) is shared
 * with student list — same heuristic, same behavior.
 */
export function validateGradeSheet(rows: Record<string, string>[]): ValidationResult {
  const baseOptional = OPTIONAL_COLUMNS['grade-sheet'] || [];

  // Derive the per-course Grade/GPA columns dynamically from the first row's
  // keys — saves us hardcoding course names which differ across MBA / DBA / ET.
  const courseGradeCols: string[] = [];
  if (rows.length > 0) {
    for (const col of Object.keys(rows[0])) {
      if (/ - (Grade|GPA)$/i.test(col)) courseGradeCols.push(col);
    }
  }

  return validateAllExceptOptional(rows, [...baseOptional, ...courseGradeCols]);
}

export function validateCallingData(rows: Record<string, string>[], mandatoryColumns: string[]): ValidationResult {
  const result = validateRows(rows, mandatoryColumns);

  // Additional validation: check that Scheduled Date is a recognizable date format
  const furtherValid: Record<string, string>[] = [];
  const furtherErrors: ErrorRow[] = [];

  result.valid.forEach((row, index) => {
    const dateStr = row['Date ( DD/MM/YYYY)'] || row['Scheduled Date'];
    if (dateStr && dateStr.trim() !== '') {
      furtherValid.push(row);
    } else {
      furtherErrors.push({
        rowNumber: index + 2,
        data: row,
        errorMessage: 'Call date is empty or invalid',
      });
    }
  });

  return {
    valid: furtherValid,
    errors: [...result.errors, ...furtherErrors],
  };
}
