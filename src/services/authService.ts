import bcrypt from 'bcryptjs';
import { User, UserRole } from '../types';

// User accounts. Hardcoded until we move to a DB-backed user table.
//
// To add a new client user:
//   1. Append an entry below with a unique id, email, name, and role
//      ('system_admin' | 'data_manager' | 'support_agent')
//   2. Choose a password they'll change on first login (none of the UI
//      changes-password yet — for now, just share the default with them)
//   3. Commit + push + redeploy backend
//
// Demo accounts (admin@voiceai.com, manager@voiceai.com, agent@voiceai.com)
// are kept for QA / smoke testing. Remove them before production handoff
// if the client wants demo logins disabled.
const USERS: User[] = [
  // ─── Client users (upGrad) ─────────────────────────────────────────
  {
    id: '100',
    email: 'swaroop.mendon@upgrad.com',
    name: 'Swaroop Mendon',
    role: 'system_admin',
    passwordHash: bcrypt.hashSync('Swaroop@2026', 10),
  },

  // ─── Demo / QA accounts ────────────────────────────────────────────
  {
    id: '1',
    email: 'admin@voiceai.com',
    name: 'System Administrator',
    role: 'system_admin',
    passwordHash: bcrypt.hashSync('Admin@123', 10),
  },
  {
    id: '2',
    email: 'manager@voiceai.com',
    name: 'Data Manager',
    role: 'data_manager',
    passwordHash: bcrypt.hashSync('Manager@123', 10),
  },
  {
    id: '3',
    email: 'agent@voiceai.com',
    name: 'Support Agent',
    role: 'support_agent',
    passwordHash: bcrypt.hashSync('Agent@123', 10),
  },
];

export function findUserByEmail(email: string): User | undefined {
  return USERS.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function findUserById(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    system_admin: 'System Administrator',
    data_manager: 'Data Manager',
    support_agent: 'Support Agent',
  };
  return names[role];
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _pw, ...safeUser } = user;
  return safeUser;
}
