/**
 * File-based storage fallback for local development.
 *
 * Used automatically when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not
 * set in the environment. Stores everything in a single ./data/uploads.json
 * file at the backend repo root. Simple, no external dependencies.
 *
 * Mirrors the public API of supabaseStorage.ts exactly so the two are
 * drop-in interchangeable from the routes layer.
 */
import * as fs from 'fs';
import * as path from 'path';
import { UploadRecord, ErrorRow, DataType, University } from '../types';
import type { SaveUploadInput } from './supabaseStorage';

const MAX_INLINE_RAW_BYTES = 8 * 1024 * 1024; // 8 MB — match Supabase impl

const DATA_DIR = path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'uploads.json');

interface StoredRecord {
  uploadId: string;
  dataType: DataType;
  university: string | null;
  program: string | null;
  fileName: string;
  fileSizeBytes: number;
  fileExt: string;
  rawFileB64: string | null;
  uploadedBy: string;
  uploadedAt: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  status: 'success' | 'partial' | 'failed';
  rows: Record<string, string>[];
  errors: ErrorRow[];
  /** Generated unified Voice-AI CSV (calling-data uploads only). */
  unifiedCsv?: string | null;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): StoredRecord[] {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as StoredRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: StoredRecord[]): void {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

function toRecord(r: StoredRecord): UploadRecord {
  return {
    uploadId: r.uploadId,
    fileName: r.fileName,
    dataType: r.dataType,
    university: (r.university || undefined) as University | undefined,
    program: r.program || undefined,
    uploadedAt: r.uploadedAt,
    uploadedBy: r.uploadedBy,
    totalRows: r.totalRows,
    validRows: r.validRows,
    errorRows: r.errorRows,
    status: r.status,
  };
}

export async function saveUploadRecord(input: SaveUploadInput): Promise<void> {
  const { uploadId, metadata, data, errors, rawFile, unifiedCsv } = input;
  const fileExt = (rawFile.originalName.split('.').pop() || 'csv').toLowerCase();
  const rawB64 =
    rawFile.buffer.length <= MAX_INLINE_RAW_BYTES
      ? rawFile.buffer.toString('base64')
      : null;

  const all = readAll();
  all.unshift({
    uploadId,
    dataType: metadata.dataType,
    university: metadata.university || null,
    program: metadata.program || null,
    fileName: rawFile.originalName,
    fileSizeBytes: rawFile.buffer.length,
    fileExt,
    rawFileB64: rawB64,
    uploadedBy: metadata.uploadedBy,
    uploadedAt: metadata.uploadedAt,
    totalRows: metadata.totalRows,
    validRows: metadata.validRows,
    errorRows: metadata.errorRows,
    status: metadata.status,
    rows: data,
    errors,
    unifiedCsv: unifiedCsv ?? null,
  });
  writeAll(all);
}

export async function getUploadRecord(uploadId: string): Promise<UploadRecord | null> {
  const found = readAll().find((r) => r.uploadId === uploadId);
  return found ? toRecord(found) : null;
}

export async function getUploadErrors(uploadId: string): Promise<ErrorRow[]> {
  return readAll().find((r) => r.uploadId === uploadId)?.errors || [];
}

export async function getUnifiedCsv(uploadId: string): Promise<string | null> {
  return readAll().find((r) => r.uploadId === uploadId)?.unifiedCsv ?? null;
}

export async function listUploads(filters?: {
  dataType?: DataType;
  university?: University;
  program?: string;
  limit?: number;
}): Promise<UploadRecord[]> {
  let rows = readAll();
  if (filters?.dataType)   rows = rows.filter((r) => r.dataType === filters.dataType);
  if (filters?.university) rows = rows.filter((r) => r.university === filters.university);
  if (filters?.program)    rows = rows.filter((r) => r.program === filters.program);
  if (filters?.limit)      rows = rows.slice(0, filters.limit);
  return rows.map(toRecord);
}

export async function getStudentData(
  university?: string,
  program?: string
): Promise<Record<string, string>[]> {
  const uploads = readAll()
    .filter((r) => r.dataType === 'student-list')
    .filter((r) => !university || r.university === university)
    .filter((r) => !program || r.program === program);

  const emailsSeen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const upload of uploads) {
    for (const row of upload.rows) {
      const email = (row['Email'] || row['Email ID'] || '').toLowerCase().trim();
      if (email && !emailsSeen.has(email)) {
        emailsSeen.add(email);
        out.push({
          ...row,
          University: upload.university || '',
          Program: upload.program || '',
        });
      }
    }
  }
  return out;
}

export async function getGradeSheetData(
  university?: string,
  program?: string
): Promise<Record<string, string>[]> {
  // readAll() returns uploads newest-first (see saveUploadRecord: unshift).
  // For a given (university, program), the newest upload is authoritative
  // per student. Dedup by Email (or Email ID fallback) — same semantics as
  // getStudentData.
  const uploads = readAll()
    .filter((r) => r.dataType === 'grade-sheet')
    .filter((r) => !university || r.university === university)
    .filter((r) => !program || r.program === program);

  const seen = new Set<string>();
  const out: Record<string, string>[] = [];
  for (const upload of uploads) {
    for (const row of upload.rows) {
      const email = (row['Email'] || row['Email ID'] || '').toLowerCase().trim();
      if (!email) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({
        ...row,
        University: upload.university || '',
        Program: upload.program || '',
      });
    }
  }
  return out;
}

export async function getCallingData(): Promise<Record<string, string>[]> {
  const uploads = readAll().filter((r) => r.dataType === 'calling-data');
  const out: Record<string, string>[] = [];
  for (const upload of uploads) out.push(...upload.rows);
  return out;
}

export async function getStats(): Promise<{
  totalUploadsToday: number;
  totalStudents: number;
  totalCallingRecords: number;
  lastSyncTime: string | null;
}> {
  const rows = readAll();
  const todayPrefix = new Date().toISOString().split('T')[0];

  let totalUploadsToday = 0;
  let totalStudents = 0;
  let totalCallingRecords = 0;

  for (const r of rows) {
    if (r.uploadedAt.startsWith(todayPrefix)) totalUploadsToday += 1;
    if (r.dataType === 'student-list')        totalStudents += r.validRows;
    if (r.dataType === 'calling-data')        totalCallingRecords += r.validRows;
  }

  return {
    totalUploadsToday,
    totalStudents,
    totalCallingRecords,
    lastSyncTime: rows[0]?.uploadedAt || null,
  };
}
