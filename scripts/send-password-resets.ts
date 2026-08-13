/**
 * Sends password reset emails to all non-admin users via Supabase Auth.
 * Requires SMTP to be configured in the Supabase dashboard.
 *
 * Usage:
 *   npx ts-node scripts/send-password-resets.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

const USERS_TO_RESET = [
  'swaroop.mendon@upgrad.com',
  'sandeep.pereira@upgrad.com',
  'dipika1.carpenter@upgrad.com',
  'hiral.patani@upgrad.com',
  'khushbu1.bhadra@upgrad.com',
  'mukhtar.sayyed@upgrad.com',
  'praveen.shettigar@upgrad.com',
  'michelle.fernandes@upgrad.com',
];

async function sendResets() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nSending password reset emails to ${USERS_TO_RESET.length} users…\n`);

  let sent = 0;
  let failed = 0;

  for (const email of USERS_TO_RESET) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SUPABASE_URL?.replace('.supabase.co', '.supabase.co')}/auth/v1/callback`,
    });

    if (error) {
      console.error(`  FAIL  ${email} — ${error.message}`);
      failed++;
    } else {
      console.log(`  SENT  ${email}`);
      sent++;
    }

    // Respect Supabase rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\nDone — sent: ${sent}, failed: ${failed}`);

  if (failed > 0) {
    console.log('\nIf emails failed, check:');
    console.log('  1. SMTP is configured in Supabase Dashboard → Authentication → SMTP Settings');
    console.log('  2. Site URL is set in Authentication → URL Configuration');
  }

  if (sent > 0) {
    console.log('\nEach user will receive an email with a link to set their own password.');
  }
}

sendResets().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
