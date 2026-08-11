import { getSupabase } from '../lib/supabase';
import { User, UserRole } from '../types';

function userFromSupabase(su: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): User {
  const meta = su.user_metadata ?? {};
  return {
    id: su.id,
    email: su.email ?? '',
    name: (meta.name as string) ?? su.email ?? '',
    role: (meta.role as UserRole) ?? 'support_agent',
  };
}

export async function signInWithSupabase(email: string, password: string): Promise<User | null> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  return userFromSupabase(data.user);
}

export async function findUserById(userId: string): Promise<User | null> {
  const { data, error } = await getSupabase().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return userFromSupabase(data.user);
}

export function getRoleDisplayName(role: UserRole): string {
  const names: Record<UserRole, string> = {
    system_admin: 'System Administrator',
    data_manager: 'Data Manager',
    support_agent: 'Support Agent',
  };
  return names[role];
}
