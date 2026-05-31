/**
 * Storage facade — picks between Supabase (production) and file-based
 * storage (local dev) based on whether Supabase env vars are set.
 *
 * Routes always import from here; they don't care which backend is active.
 *
 * To use Supabase locally, copy SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * into backend/.env. Otherwise data is stored in ./data/uploads.json.
 */
import * as supabaseStorage from './supabaseStorage';
import * as fileStorage from './fileStorage';

export type { SaveUploadInput } from './supabaseStorage';

const USE_SUPABASE = !!(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (USE_SUPABASE) {
  // eslint-disable-next-line no-console
  console.log('[storage] Using Supabase (SUPABASE_URL detected)');
} else {
  // eslint-disable-next-line no-console
  console.log('[storage] Using local file storage at ./data/uploads.json — set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env to switch to Supabase');
}

const impl = USE_SUPABASE ? supabaseStorage : fileStorage;

export const saveUploadRecord  = impl.saveUploadRecord;
export const getUploadRecord   = impl.getUploadRecord;
export const getUploadErrors   = impl.getUploadErrors;
export const listUploads       = impl.listUploads;
export const getStudentData    = impl.getStudentData;
export const getGradeSheetData = impl.getGradeSheetData;
export const getCallingData    = impl.getCallingData;
export const getStats          = impl.getStats;
