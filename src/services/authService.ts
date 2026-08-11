import bcrypt from 'bcryptjs';
import { User, UserRole } from '../types';

// User accounts. Hardcoded until we move to a DB-backed user table.
//
// To add a new client user:
//   1. Generate a bcrypt hash for the temp password (cost 10):
//        node -e "console.log(require('bcryptjs').hashSync('TempPass@1234', 10))"
//   2. Append an entry below with a unique id, email, name, role, and the hash.
//      NEVER commit plaintext passwords — only paste the hash here.
//   3. Commit + push + redeploy backend.
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
    passwordHash: '$2a$10$Rk9AGPqW6i6SGyTz8FfwXeieoYkejBr./Zdv9m2LbRKiBX9RGqtLm',
  },
  {
    id: '102',
    email: 'sandeep.pereira@upgrad.com',
    name: 'Sandeep Pereira',
    role: 'system_admin',
    passwordHash: '$2a$10$.DpC9DuUUhvnjcbCd0Cg3.1Sz6D/Ld38CG0LZ6kFcio64HCaJnr6i',
  },
  {
    id: '101',
    email: 'dipika1.carpenter@upgrad.com',
    name: 'Dipika Carpenter',
    role: 'support_agent',
    passwordHash: '$2a$10$1nIj6T4mxhz9iIHiuyl2l.fJRDkdU84L6xy6JDPd8YA.wvOx417BC',
  },
  {
    id: '103',
    email: 'hiral.patani@upgrad.com',
    name: 'Hiral Kamlesh Patani',
    role: 'data_manager',
    passwordHash: '$2a$10$ASATAO4ESeIdnE9Px7dmEuuDxdFdCk0OFQB1esGEF7CKIAN/LW3Lu',
  },
  {
    id: '104',
    email: 'khushbu1.bhadra@upgrad.com',
    name: 'Khushbu Sudhir Bhadr',
    role: 'data_manager',
    passwordHash: '$2a$10$dwlVrKdzYAc78Dayk2uogOgSoxLEtjvebsPzzSUBvdDJu1p0BhKcm',
  },
  {
    id: '105',
    email: 'mukhtar.sayyed@upgrad.com',
    name: 'Mukhtar Ali Ali Sayyed',
    role: 'data_manager',
    passwordHash: '$2a$10$zSfzw/S.Xosd5eO20daoXeyXTOyVXEAJNejf9n4LY0G.pCfdiy4iC',
  },
  {
    id: '106',
    email: 'praveen.shettigar@upgrad.com',
    name: 'Praveen Ravindra Shettigar',
    role: 'data_manager',
    passwordHash: '$2a$10$eoULvr7joPgKjgHPktTF9.LES9nZwGzAaBB0Lk/RYEAFLNmCB06VW',
  },
  {
    id: '107',
    email: 'michelle.fernandes@upgrad.com',
    name: 'Michelle Secelin Fernandes',
    role: 'data_manager',
    passwordHash: '$2a$10$sXHFWSFhzkmFcwvlyrPGEOyYcYNJa9y35Ydo.U3SoSDRX0eNiNk06',
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
