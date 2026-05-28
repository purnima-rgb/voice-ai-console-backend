import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { UploadRecord, StoredData, ErrorRow, DataType, University } from '../types';

// On Vercel the project filesystem is read-only — only /tmp is writable.
// VERCEL=1 is set automatically in Vercel's runtime.
// Note: /tmp is ephemeral, so writes within a request work but data does
// NOT persist across separate function invocations. This is a known
// limitation documented in the README (swap to Vercel KV/Blob or
// Supabase for persistence).
const IS_SERVERLESS = !!process.env.VERCEL;
const DATA_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'voice-ai-console-data')
  : path.join(process.cwd(), 'data');
const UPLOADS_INDEX_FILE = path.join(DATA_DIR, 'uploads-index.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJSON<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

function writeJSON(filePath: string, data: unknown): void {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function saveUploadRecord(
  uploadId: string,
  metadata: Omit<UploadRecord, 'uploadId'>,
  data: Record<string, string>[],
  errors: ErrorRow[]
): void {
  ensureDataDir();

  // Save the upload record to the index
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);
  const record: UploadRecord = { uploadId, ...metadata };
  index.unshift(record); // newest first
  writeJSON(UPLOADS_INDEX_FILE, index);

  // Save the actual data
  const storedData: StoredData = {
    uploadId,
    dataType: metadata.dataType,
    university: metadata.university,
    program: metadata.program,
    rows: data,
    uploadedAt: metadata.uploadedAt,
  };

  const dataFile = path.join(DATA_DIR, `${uploadId}-data.json`);
  writeJSON(dataFile, storedData);

  // Save errors if any
  if (errors.length > 0) {
    const errorsFile = path.join(DATA_DIR, `${uploadId}-errors.json`);
    writeJSON(errorsFile, errors);
  }
}

export function getUploadRecord(uploadId: string): UploadRecord | null {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);
  return index.find((r) => r.uploadId === uploadId) || null;
}

export function getUploadErrors(uploadId: string): ErrorRow[] {
  const errorsFile = path.join(DATA_DIR, `${uploadId}-errors.json`);
  return readJSON<ErrorRow[]>(errorsFile, []);
}

export function listUploads(filters?: {
  dataType?: DataType;
  university?: University;
  program?: string;
}): UploadRecord[] {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);

  if (!filters) return index;

  return index.filter((record) => {
    if (filters.dataType && record.dataType !== filters.dataType) return false;
    if (filters.university && record.university !== filters.university) return false;
    if (filters.program && record.program !== filters.program) return false;
    return true;
  });
}

export function getStudentData(university?: string, program?: string): Record<string, string>[] {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);

  const relevantUploads = index.filter((record) => {
    if (record.dataType !== 'student-list') return false;
    if (university && record.university !== university) return false;
    if (program && record.program !== program) return false;
    return true;
  });

  // For each relevant upload, get the data (most recent first, deduplicate by email)
  const emailsSeen = new Set<string>();
  const allRows: Record<string, string>[] = [];

  for (const upload of relevantUploads) {
    const dataFile = path.join(DATA_DIR, `${upload.uploadId}-data.json`);
    const stored = readJSON<StoredData | null>(dataFile, null);
    if (stored) {
      for (const row of stored.rows) {
        const email = (row['Email ID'] || '').toLowerCase().trim();
        if (email && !emailsSeen.has(email)) {
          emailsSeen.add(email);
          allRows.push({ ...row, University: upload.university || '', Program: upload.program || '' });
        }
      }
    }
  }

  return allRows;
}

export function getGradeSheetData(university?: string, program?: string): Record<string, string>[] {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);

  const relevantUploads = index.filter((record) => {
    if (record.dataType !== 'grade-sheet') return false;
    if (university && record.university !== university) return false;
    if (program && record.program !== program) return false;
    return true;
  });

  const allRows: Record<string, string>[] = [];

  for (const upload of relevantUploads) {
    const dataFile = path.join(DATA_DIR, `${upload.uploadId}-data.json`);
    const stored = readJSON<StoredData | null>(dataFile, null);
    if (stored) {
      allRows.push(...stored.rows.map((r) => ({
        ...r,
        University: upload.university || '',
        Program: upload.program || '',
      })));
    }
  }

  return allRows;
}

export function getCallingData(): Record<string, string>[] {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);

  const relevantUploads = index.filter((record) => record.dataType === 'calling-data');
  const allRows: Record<string, string>[] = [];

  for (const upload of relevantUploads) {
    const dataFile = path.join(DATA_DIR, `${upload.uploadId}-data.json`);
    const stored = readJSON<StoredData | null>(dataFile, null);
    if (stored) {
      allRows.push(...stored.rows);
    }
  }

  return allRows;
}

export function getStats(): {
  totalUploadsToday: number;
  totalStudents: number;
  totalCallingRecords: number;
  lastSyncTime: string | null;
} {
  const index = readJSON<UploadRecord[]>(UPLOADS_INDEX_FILE, []);
  const today = new Date().toISOString().split('T')[0];

  const todayUploads = index.filter((r) => r.uploadedAt.startsWith(today));
  const studentUploads = index.filter((r) => r.dataType === 'student-list');
  const callingUploads = index.filter((r) => r.dataType === 'calling-data');

  const totalStudents = studentUploads.reduce((sum, r) => sum + r.validRows, 0);
  const totalCalling = callingUploads.reduce((sum, r) => sum + r.validRows, 0);

  const lastUpload = index[0];

  return {
    totalUploadsToday: todayUploads.length,
    totalStudents,
    totalCallingRecords: totalCalling,
    lastSyncTime: lastUpload ? lastUpload.uploadedAt : null,
  };
}
