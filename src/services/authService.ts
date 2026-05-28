import bcrypt from 'bcryptjs';
import { User, UserRole } from '../types';

// Hardcoded users for local development
const USERS: User[] = [
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
