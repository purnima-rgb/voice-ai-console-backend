/**
 * Diagnostic + repair script — checks all seeded users in Supabase Auth
 * and fixes unconfirmed emails or missing user_metadata.
 *
 * Usage:
 *   npx ts-node scripts/fix-supabase-users.ts
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

const EXPECTED_USERS: Record<string, { name: string; role: string }> = {
  'admin@voiceai.com':              { name: 'Voice AI Superadmin',         role: 'system_admin'  },
  'swaroop.mendon@upgrad.com':      { name: 'Swaroop Mendon',             role: 'system_admin'  },
  'sandeep.pereira@upgrad.com':     { name: 'Sandeep Pereira',            role: 'system_admin'  },
  'dipika1.carpenter@upgrad.com':   { name: 'Dipika Carpenter',           role: 'support_agent' },
  'hiral.patani@upgrad.com':        { name: 'Hiral Kamlesh Patani',       role: 'data_manager'  },
  'khushbu1.bhadra@upgrad.com':     { name: 'Khushbu Sudhir Bhadr',       role: 'data_manager'  },
  'mukhtar.sayyed@upgrad.com':      { name: 'Mukhtar Ali Ali Sayyed',     role: 'data_manager'  },
  'praveen.shettigar@upgrad.com':   { name: 'Praveen Ravindra Shettigar', role: 'data_manager'  },
  'michelle.fernandes@upgrad.com':  { name: 'Michelle Secelin Fernandes', role: 'data_manager'  },
};

async function fix() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }

  console.log(`\nFound ${data.users.length} users in Supabase Auth:\n`);

  let fixed = 0;

  for (const user of data.users) {
    const email = user.email || '(no email)';
    const confirmed = !!user.email_confirmed_at;
    const meta = user.user_metadata || {};
    const expected = EXPECTED_USERS[email];

    console.log(`  ${email}`);
    console.log(`    confirmed: ${confirmed ? 'YES' : 'NO'}`);
    console.log(`    metadata:  name=${meta.name || '(missing)'}, role=${meta.role || '(missing)'}`);

    const needsFix: string[] = [];

    if (!confirmed) needsFix.push('unconfirmed');
    if (expected && meta.role !== expected.role) needsFix.push(`role mismatch (have: ${meta.role}, want: ${expected.role})`);
    if (expected && !meta.name) needsFix.push('missing name');

    if (needsFix.length > 0) {
      console.log(`    FIXING: ${needsFix.join(', ')}`);

      const update: Record<string, unknown> = {};
      if (!confirmed) update.email_confirm = true;
      if (expected) {
        update.user_metadata = {
          ...meta,
          name: expected.name,
          role: expected.role,
        };
      }

      const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, update);
      if (updateErr) {
        console.log(`    ERROR: ${updateErr.message}`);
      } else {
        console.log(`    FIXED`);
        fixed++;
      }
    } else {
      console.log(`    OK`);
    }
    console.log();
  }

  console.log(`Done — ${fixed} user(s) fixed.`);
  if (fixed > 0) {
    console.log('All users should now be able to log in with password: ChangeMe@VoiceAI!');
  }
}

fix().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
