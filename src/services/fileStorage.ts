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
  /** Legacy field — unused; unified files are now rebuilt on demand from `rows`. */
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

/**
 * Raw stored rows (the validated data) for an upload — used to regenerate
 * the unified XLSX on demand and to power the View Data screen.
 */
export async function getUploadRows(uploadId: string): Promise<Record<string, string>[] | null> {
  return readAll().find((r) => r.uploadId === uploadId)?.rows ?? null;
}

/** Reconstruct the raw uploaded file from the inline base64 stored in JSON. */
export async function getRawFile(
  uploadId: string
): Promise<{ buffer: Buffer; fileName: string; mime: string } | null> {
  const rec = readAll().find((r) => r.uploadId === uploadId);
  if (!rec || !rec.rawFileB64) return null;
  const mimeForExt = (ext: string): string => {
    switch (ext.toLowerCase()) {
      case 'csv':  return 'text/csv';
      case 'xls':  return 'application/vnd.ms-excel';
      case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:     return 'application/octet-stream';
    }
  };
  return {
    buffer: Buffer.from(rec.rawFileB64, 'base64'),
    fileName: rec.fileName,
    mime: mimeForExt(rec.fileExt || 'bin'),
  };
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

export async function getStats(): Promise<{
  totalUploadsToday: number;
  totalUploads: number;
  totalRowsProcessed: number;
  lastSyncTime: string | null;
}> {
  const rows = readAll();
  const todayPrefix = new Date().toISOString().split('T')[0];

  let totalUploadsToday = 0;
  let totalRowsProcessed = 0;

  for (const r of rows) {
    if (r.uploadedAt.startsWith(todayPrefix)) totalUploadsToday += 1;
    totalRowsProcessed += r.validRows;
  }

  return {
    totalUploadsToday,
    totalUploads: rows.length,
    totalRowsProcessed,
    lastSyncTime: rows[0]?.uploadedAt || null,
  };
}
