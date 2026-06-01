import { getSupabase, UPLOADS_TABLE } from '../lib/supabase';
import { UploadRecord, ErrorRow, DataType, University } from '../types';

/**
 * Maximum raw file size we'll store inline (as base64 text) in the uploads
 * table. Anything larger gets stored as null in raw_file_b64. For very large
 * files, switch to Supabase Storage and store a path instead.
 */
const MAX_INLINE_RAW_BYTES = 8 * 1024 * 1024; // 8 MB

interface DBUpload {
  upload_id: string;
  data_type: DataType;
  university: string | null;
  program: string | null;
  file_name: string;
  file_size_bytes: number;
  file_ext: string;
  raw_file_b64: string | null;
  uploaded_by: string;
  uploaded_at: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  status: 'success' | 'partial' | 'failed';
  rows: Record<string, string>[];
  errors: ErrorRow[];
  /** Generated unified Voice-AI CSV (calling-data uploads only). */
  unified_csv?: string | null;
}

function rowToUploadRecord(r: DBUpload): UploadRecord {
  return {
    uploadId: r.upload_id,
    fileName: r.file_name,
    dataType: r.data_type,
    university: (r.university || undefined) as University | undefined,
    program: r.program || undefined,
    uploadedAt: r.uploaded_at,
    uploadedBy: r.uploaded_by,
    totalRows: r.total_rows,
    validRows: r.valid_rows,
    errorRows: r.error_rows,
    status: r.status,
  };
}

export interface SaveUploadInput {
  uploadId: string;
  metadata: Omit<UploadRecord, 'uploadId'>;
  data: Record<string, string>[];
  errors: ErrorRow[];
  rawFile: {
    buffer: Buffer;
    originalName: string;
  };
  /**
   * Optional generated unified CSV string. Set on successful calling-data
   * uploads so it can be downloaded later (per-upload snapshot — never
   * overwritten by subsequent uploads).
   */
  unifiedCsv?: string;
}

export async function saveUploadRecord(input: SaveUploadInput): Promise<void> {
  const { uploadId, metadata, data, errors, rawFile, unifiedCsv } = input;

  const fileExt = (rawFile.originalName.split('.').pop() || 'csv').toLowerCase();
  const rawB64 =
    rawFile.buffer.length <= MAX_INLINE_RAW_BYTES
      ? rawFile.buffer.toString('base64')
      : null;

  const row: DBUpload = {
    upload_id: uploadId,
    data_type: metadata.dataType,
    university: metadata.university || null,
    program: metadata.program || null,
    file_name: rawFile.originalName,
    file_size_bytes: rawFile.buffer.length,
    file_ext: fileExt,
    raw_file_b64: rawB64,
    uploaded_by: metadata.uploadedBy,
    uploaded_at: metadata.uploadedAt,
    total_rows: metadata.totalRows,
    valid_rows: metadata.validRows,
    error_rows: metadata.errorRows,
    status: metadata.status,
    rows: data,
    errors,
    unified_csv: unifiedCsv ?? null,
  };

  const { error } = await getSupabase().from(UPLOADS_TABLE).insert(row);
  if (error) {
    throw new Error(`Supabase insert failed: ${error.message}`);
  }
}

export async function getUploadRecord(uploadId: string): Promise<UploadRecord | null> {
  const { data, error } = await getSupabase()
    .from(UPLOADS_TABLE)
    .select('*')
    .eq('upload_id', uploadId)
    .maybeSingle();
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return data ? rowToUploadRecord(data as DBUpload) : null;
}

export async function getUploadErrors(uploadId: string): Promise<ErrorRow[]> {
  const { data, error } = await getSupabase()
    .from(UPLOADS_TABLE)
    .select('errors')
    .eq('upload_id', uploadId)
    .maybeSingle();
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data?.errors as ErrorRow[] | undefined) || [];
}

export async function getUnifiedCsv(uploadId: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from(UPLOADS_TABLE)
    .select('unified_csv')
    .eq('upload_id', uploadId)
    .maybeSingle();
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data?.unified_csv as string | null | undefined) ?? null;
}

export async function listUploads(filters?: {
  dataType?: DataType;
  university?: University;
  program?: string;
  limit?: number;
}): Promise<UploadRecord[]> {
  let query = getSupabase()
    .from(UPLOADS_TABLE)
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (filters?.dataType)   query = query.eq('data_type', filters.dataType);
  if (filters?.university) query = query.eq('university', filters.university);
  if (filters?.program)    query = query.eq('program', filters.program);
  if (filters?.limit)      query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data || []).map((r) => rowToUploadRecord(r as DBUpload));
}

async function fetchRowsForDataType(
  dataType: DataType,
  filters?: { university?: string; program?: string }
): Promise<{ uploads: DBUpload[] }> {
  let query = getSupabase()
    .from(UPLOADS_TABLE)
    .select('upload_id, data_type, university, program, rows, uploaded_at')
    .eq('data_type', dataType)
    .order('uploaded_at', { ascending: false });

  if (filters?.university) query = query.eq('university', filters.university);
  if (filters?.program)    query = query.eq('program', filters.program);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return { uploads: (data || []) as DBUpload[] };
}

export async function getStudentData(
  university?: string,
  program?: string
): Promise<Record<string, string>[]> {
  const { uploads } = await fetchRowsForDataType('student-list', { university, program });

  // Deduplicate by Email/Email ID, preferring the most recent upload.
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
  // fetchRowsForDataType returns newest-first; for re-uploads of grade
  // sheets covering the same students, the latest upload is authoritative.
  // Dedup by Email — matches getStudentData semantics.
  const { uploads } = await fetchRowsForDataType('grade-sheet', { university, program });
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
  const { uploads } = await fetchRowsForDataType('calling-data');
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
  const { data, error } = await getSupabase()
    .from(UPLOADS_TABLE)
    .select('data_type, uploaded_at, valid_rows')
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  const rows = (data || []) as Array<Pick<DBUpload, 'data_type' | 'uploaded_at' | 'valid_rows'>>;
  const todayPrefix = new Date().toISOString().split('T')[0];

  let totalUploadsToday = 0;
  let totalStudents = 0;
  let totalCallingRecords = 0;
  let lastSyncTime: string | null = rows[0]?.uploaded_at || null;

  for (const r of rows) {
    if (r.uploaded_at.startsWith(todayPrefix)) totalUploadsToday += 1;
    if (r.data_type === 'student-list')  totalStudents += r.valid_rows;
    if (r.data_type === 'calling-data')  totalCallingRecords += r.valid_rows;
  }

  return { totalUploadsToday, totalStudents, totalCallingRecords, lastSyncTime };
}
