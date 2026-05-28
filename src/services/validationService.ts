import { ValidationResult, ErrorRow } from '../types';

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

export function validateStudentList(rows: Record<string, string>[], mandatoryColumns: string[]): ValidationResult {
  return validateRows(rows, mandatoryColumns);
}

export function validateGradeSheet(rows: Record<string, string>[], mandatoryColumns: string[]): ValidationResult {
  return validateRows(rows, mandatoryColumns);
}

export function validateCallingData(rows: Record<string, string>[], mandatoryColumns: string[]): ValidationResult {
  const result = validateRows(rows, mandatoryColumns);

  // Additional validation: check that Scheduled Date is a recognizable date format
  const furtherValid: Record<string, string>[] = [];
  const furtherErrors: ErrorRow[] = [];

  result.valid.forEach((row, index) => {
    const dateStr = row['Scheduled Date'];
    if (dateStr && dateStr.trim() !== '') {
      furtherValid.push(row);
    } else {
      furtherErrors.push({
        rowNumber: index + 2,
        data: row,
        errorMessage: 'Scheduled Date is empty or invalid',
      });
    }
  });

  return {
    valid: furtherValid,
    errors: [...result.errors, ...furtherErrors],
  };
}
