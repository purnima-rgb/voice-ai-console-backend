export type UserRole = 'system_admin' | 'data_manager' | 'support_agent';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Express.Request {
  user?: JwtPayload;
}

export type University = 'GGU' | 'Edgewood' | 'Rushford' | 'ESGCI';
export type DataType = 'student-list' | 'grade-sheet' | 'calling-data';

export interface UploadRecord {
  uploadId: string;
  fileName: string;
  dataType: DataType;
  university?: University;
  program?: string;
  uploadedAt: string;
  uploadedBy: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  status: 'success' | 'partial' | 'failed';
}

/**
 * What kind of thing happened. Drives the audit log feed.
 *  - upload:             a raw file (student-list / grade-sheet / calling-data) was uploaded
 *  - unified_generated:  a unified Voice-AI CSV was generated for a clean calling-data upload
 *  - s3_archived:        the unified CSV + XLSX were archived to S3
 *  - scheduler_notified: the downstream Voice-AI scheduler was pinged about a new unified file
 */
export type AuditEventType =
  | 'upload'
  | 'unified_generated'
  | 's3_archived'
  | 'scheduler_notified';

export interface AuditEvent {
  id: string;
  eventType: AuditEventType;
  /** Present for `upload` events. */
  dataType?: DataType;
  /** The upload this event is tied to. */
  uploadId: string;
  university?: string;
  program?: string;
  fileName?: string;
  actorEmail?: string;
  actorRole?: string;
  status: 'success' | 'failed';
  /** Free-form extra context: S3 keys, row counts, error/skip reason, scheduler HTTP status. */
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface StoredData {
  uploadId: string;
  dataType: DataType;
  university?: University;
  program?: string;
  rows: Record<string, string>[];
  uploadedAt: string;
}

export interface ErrorRow {
  rowNumber: number;
  data: Record<string, string>;
  errorMessage: string;
}

export interface ValidationResult {
  valid: Record<string, string>[];
  errors: ErrorRow[];
}

export interface UploadResult {
  uploadId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ErrorRow[];
  data: Record<string, string>[];
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
