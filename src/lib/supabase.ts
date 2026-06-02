import { createClient, SupabaseClient } from '@supabase/supabase-js';

// @supabase/supabase-js (>= ~2.100) eagerly constructs a Realtime client inside
// createClient(), and @supabase/realtime-js throws
//   "Node.js 20 detected without native WebSocket support"
// when no global WebSocket exists. Node 20 (our VM runtime) has none, and we
// don't use realtime at all — only the Postgres REST + Storage APIs. Install a
// harmless WebSocket shim so construction succeeds; it is never instantiated
// because we never open a realtime channel. (Node 22+ has a native WebSocket
// and skips this branch entirely.)
if (typeof (globalThis as unknown as { WebSocket?: unknown }).WebSocket === 'undefined') {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = class {
    constructor() {
      throw new Error('WebSocket is not supported in this runtime (Supabase realtime is unused).');
    }
  };
}

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
