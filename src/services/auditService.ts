/**
 * Audit log — an append-only record of every meaningful event in the data
 * pipeline: each raw upload, each unified-file generation, each S3 archive,
 * and each downstream scheduler notification.
 *
 * Storage mirrors the rest of the app: Supabase (table `audit_log`) when
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, otherwise a local
 * ./data/audit.json file for dev.
 *
 * recordAuditEvent() is intentionally BEST-EFFORT: it never throws. An audit
 * write must never fail or slow down the actual upload — failures are logged
 * and swallowed. listAuditEvents() (read path) may throw so the API can 500.
 */
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSupabase } from '../lib/supabase';
import { AuditEvent, AuditEventType, DataType } from '../types';

const AUDIT_TABLE = 'audit_log';

const USE_SUPABASE = !!(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DATA_DIR = path.join(process.cwd(), 'data');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');

/** Row shape in the Supabase `audit_log` table (snake_case columns). */
interface DBAudit {
  id: string;
  event_type: AuditEventType;
  data_type: DataType | null;
  upload_id: string | null;
  university: string | null;
  program: string | null;
  file_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  status: 'success' | 'failed';
  detail: Record<string, unknown> | null;
  created_at: string;
}

function dbRowToEvent(r: DBAudit): AuditEvent {
  return {
    id: r.id,
    eventType: r.event_type,
    dataType: r.data_type || undefined,
    uploadId: r.upload_id || '',
    university: r.university || undefined,
    program: r.program || undefined,
    fileName: r.file_name || undefined,
    actorEmail: r.actor_email || undefined,
    actorRole: r.actor_role || undefined,
    status: r.status,
    detail: r.detail || undefined,
    createdAt: r.created_at,
  };
}

// ---- file fallback helpers -------------------------------------------------

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAllFile(): AuditEvent[] {
  ensureDataDir();
  if (!fs.existsSync(AUDIT_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf-8')) as AuditEvent[];
  } catch {
    return [];
  }
}

function writeAllFile(events: AuditEvent[]): void {
  ensureDataDir();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(events, null, 2), 'utf-8');
}

// ---- public API ------------------------------------------------------------

export type RecordAuditInput = Omit<AuditEvent, 'id' | 'createdAt'> & {
  createdAt?: string;
};

/**
 * Append one event to the audit log. BEST-EFFORT — never throws; a failure is
 * logged and swallowed so it can never break the calling upload flow.
 */
export async function recordAuditEvent(input: RecordAuditInput): Promise<void> {
  const event: AuditEvent = {
    id: uuidv4(),
    createdAt: input.createdAt || new Date().toISOString(),
    eventType: input.eventType,
    dataType: input.dataType,
    uploadId: input.uploadId,
    university: input.university,
    program: input.program,
    fileName: input.fileName,
    actorEmail: input.actorEmail,
    actorRole: input.actorRole,
    status: input.status,
    detail: input.detail,
  };

  try {
    if (USE_SUPABASE) {
      const row: DBAudit = {
        id: event.id,
        event_type: event.eventType,
        data_type: event.dataType || null,
        upload_id: event.uploadId || null,
        university: event.university || null,
        program: event.program || null,
        file_name: event.fileName || null,
        actor_email: event.actorEmail || null,
        actor_role: event.actorRole || null,
        status: event.status,
        detail: event.detail || null,
        created_at: event.createdAt,
      };
      const { error } = await getSupabase().from(AUDIT_TABLE).insert(row);
      if (error) throw new Error(error.message);
    } else {
      const all = readAllFile();
      all.unshift(event);
      writeAllFile(all);
    }
  } catch (err) {
    // Swallow — audit must never break the actual operation.
    console.error('[audit] failed to record event (continuing):', String(err));
  }
}

export interface AuditFilters {
  eventType?: AuditEventType;
  uploadId?: string;
  university?: string;
  program?: string;
  limit?: number;
}

/** Read recent audit events, newest first. May throw (read path). */
export async function listAuditEvents(filters?: AuditFilters): Promise<AuditEvent[]> {
  const limit = Math.min(Math.max(filters?.limit ?? 200, 1), 1000);

  if (USE_SUPABASE) {
    let query = getSupabase()
      .from(AUDIT_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters?.eventType)  query = query.eq('event_type', filters.eventType);
    if (filters?.uploadId)   query = query.eq('upload_id', filters.uploadId);
    if (filters?.university) query = query.eq('university', filters.university);
    if (filters?.program)    query = query.eq('program', filters.program);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase audit select failed: ${error.message}`);
    return (data || []).map((r) => dbRowToEvent(r as DBAudit));
  }

  let rows = readAllFile();
  if (filters?.eventType)  rows = rows.filter((r) => r.eventType === filters.eventType);
  if (filters?.uploadId)   rows = rows.filter((r) => r.uploadId === filters.uploadId);
  if (filters?.university) rows = rows.filter((r) => r.university === filters.university);
  if (filters?.program)    rows = rows.filter((r) => r.program === filters.program);
  return rows.slice(0, limit);
}
