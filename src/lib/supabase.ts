import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Note: missing env vars are fine — storageService.ts will fall back to
// file-based storage. Only fail loudly if someone actually calls getSupabase()
// without setting up the env vars.

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Supabase env vars missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'in your environment, or unset them entirely to use the local file storage fallback.'
      );
    }
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export const UPLOADS_TABLE = 'uploads';
