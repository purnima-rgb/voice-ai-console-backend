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
