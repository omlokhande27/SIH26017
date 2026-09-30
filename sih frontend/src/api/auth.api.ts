import { supabase } from '@/lib/supabase';
import type { User } from '../types';
import { UserRole } from '../types';

export const authApi = {
  getCurrentUser: async (): Promise<User | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const meta = user.user_metadata ?? {};
    return {
      id: user.id,
      name: meta.full_name ?? meta.name ?? user.email?.split('@')[0] ?? 'User',
      email: user.email ?? '',
      // DEMO OVERRIDE: Force everyone to be OFFICER so the prototype UI is fully unlocked
      role: UserRole.GOVERNMENT_OFFICER,
      department: meta.department ?? 'Land Acquisition Department',
      designation: meta.designation ?? meta.profession ?? 'Admin Officer',
    };
  },

  login: async (email: string, password: string): Promise<{ user: User | null }> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const meta = data.user?.user_metadata ?? {};
    return {
      user: data.user ? {
        id: data.user.id,
        name: meta.full_name ?? meta.name ?? email.split('@')[0],
        email: data.user.email ?? email,
        // DEMO OVERRIDE: Force everyone to be OFFICER
        role: UserRole.GOVERNMENT_OFFICER,
        department: meta.department ?? 'Land Acquisition Department',
        designation: meta.designation ?? meta.profession ?? 'Admin Officer',
      } : null,
    };
  },

  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
  },
};
