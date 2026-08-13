/**
 * Sets unique temporary passwords for all non-admin users.
 * Each user must change their password on first login.
 *
 * Usage:
 *   npx ts-node scripts/set-temp-passwords.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

dotenv.config({ path: path.join(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const special = '!@#$%';
  let pwd = '';
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) {
    pwd += chars[bytes[i] % chars.length];
  }
  pwd += special[crypto.randomBytes(1)[0] % special.length];
  pwd += crypto.randomBytes(1)[0] % 10;
  return pwd;
}

const USERS = [
  { email: 'swaroop.mendon@upgrad.com',       name: 'Swaroop Mendon'              },
  { email: 'sandeep.pereira@upgrad.com',       name: 'Sandeep Pereira'             },
  { email: 'dipika1.carpenter@upgrad.com',     name: 'Dipika Carpenter'            },
  { email: 'hiral.patani@upgrad.com',          name: 'Hiral Kamlesh Patani'        },
  { email: 'khushbu1.bhadra@upgrad.com',       name: 'Khushbu Sudhir Bhadr'        },
  { email: 'mukhtar.sayyed@upgrad.com',        name: 'Mukhtar Ali Ali Sayyed'      },
  { email: 'praveen.shettigar@upgrad.com',     name: 'Praveen Ravindra Shettigar'  },
  { email: 'michelle.fernandes@upgrad.com',    name: 'Michelle Secelin Fernandes'  },
];

async function setPasswords() {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  TEMPORARY CREDENTIALS');
  console.log('  Share individually — do NOT post in a');
  console.log('  shared channel. Ask users to change');
  console.log('  their password after first login.');
  console.log('========================================\n');

  let updated = 0;

  for (const u of USERS) {
    const existing = data.users.find((su) => su.email === u.email);
    if (!existing) {
      console.log(`  SKIP  ${u.email} — not found in Supabase Auth`);
      continue;
    }

    const tempPwd = generatePassword();

    const { error: updateErr } = await supabase.auth.admin.updateUserById(existing.id, {
      password: tempPwd,
      email_confirm: true,
      user_metadata: {
        ...existing.user_metadata,
        name: u.name,
        role: existing.user_metadata?.role || 'data_manager',
      },
    });

    if (updateErr) {
      console.error(`  FAIL  ${u.email} — ${updateErr.message}`);
    } else {
      console.log(`  ${u.name}`);
      console.log(`    Email:    ${u.email}`);
      console.log(`    Password: ${tempPwd}`);
      console.log();
      updated++;
    }
  }

  console.log(`Done — ${updated} password(s) set.\n`);
}

setPasswords().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
