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
    passwordHash: '$2a$10$/ZVLiyQuAR1eykEUBc8xiu/y7d1.e2iVa7D.bPDfEOeWRhj6vAAD6',
  },
  {
    id: '102',
    email: 'sandeep.pereira@upgrad.com',
    name: 'Sandeep Pereira',
    role: 'system_admin',
    passwordHash: '$2a$10$wQQ4YiMWzOW81njEykiFlumqMCl7bPr57hn5KeaxfantJyvQ6d1Uq',
  },
  {
    id: '101',
    email: 'dipika1.carpenter@upgrad.com',
    name: 'Dipika Carpenter',
    role: 'support_agent',
    passwordHash: '$2a$10$ysb4HYKASlfpM5cnUpA6T.c552UKZMIsmnBRQpOo8sitVhd31.vEa',
  },
  {
    id: '103',
    email: 'hiral.patani@upgrad.com',
    name: 'Hiral Kamlesh Patani',
    role: 'data_manager',
    passwordHash: '$2a$10$tJyW30kufIG8Y5UMzaYrce4iYwEdY2Kdkf3KeC5s.t/gut.MsuBWm',
  },
  {
    id: '104',
    email: 'khushbu1.bhadra@upgrad.com',
    name: 'Khushbu Sudhir Bhadr',
    role: 'data_manager',
    passwordHash: '$2a$10$Ou/.mzdgd1O3LB3CzLFipeqSp1Yi7Cygqep84mr4KyRsUxZ2Ei6K6',
  },
  {
    id: '105',
    email: 'mukhtar.sayyed@upgrad.com',
    name: 'Mukhtar Ali Ali Sayyed',
    role: 'data_manager',
    passwordHash: '$2a$10$6z9tiac9ZhJqj0OzJ7/YROwbp6232IUhs6Ox8EN6072/Wa66bbfWq',
  },
  {
    id: '106',
    email: 'praveen.shettigar@upgrad.com',
    name: 'Praveen Ravindra Shettigar',
    role: 'data_manager',
    passwordHash: '$2a$10$gOi90lXR3CJd3eWQhjOlh./5l.zbxeI.1GppEbFHQp9rg7sff0YrW',
  },
  {
    id: '107',
    email: 'michelle.fernandes@upgrad.com',
    name: 'Michelle Secelin Fernandes',
    role: 'data_manager',
    passwordHash: '$2a$10$8Ao3g2WPwdubyBkko3iDJOsk1TdNrrw7Xo/K74iW79nTcTXrSLWMm',
  },

  // ─── Demo / QA accounts ────────────────────────────────────────────
  {
    id: '1',
    email: 'admin@voiceai.com',
    name: 'System Administrator',
    role: 'system_admin',
    passwordHash: '$2a$10$OayLSeK/7ak2wcuSnLC19uQTGv.5MHttg2hp8ebkwDka3cD7gSnK2',
  },
  {
    id: '2',
    email: 'manager@voiceai.com',
    name: 'Data Manager',
    role: 'data_manager',
    passwordHash: '$2a$10$R3vYTOYsrr8T39gU.I1ppuZuY54suNoPnFWMR2GQZjYCrs.CXfNBa',
  },
  {
    id: '3',
    email: 'agent@voiceai.com',
    name: 'Support Agent',
    role: 'support_agent',
    passwordHash: '$2a$10$lgwB23yKNh.bsZDTk8Y.S.c1PrJnG8IfC6disXy.KU5TWjUjHAQSi',
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
