import { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '../supabase';

// Note: Single auth store mirrors Snapchat's pattern — one source of truth for
// session state, initialized eagerly at app start, listened to via onAuthStateChange.

interface AuthState {
  session: Session | null;
  user: User | null;
  initialized: boolean;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  initialized: false,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, initialized: true }),
}));

// Bootstrap: fetch existing session, then subscribe to changes.
// Called once when the module first loads (app start).
supabase.auth.getSession().then(({ data: { session } }) => {
  useAuthStore.getState().setSession(session);
});

supabase.auth.onAuthStateChange((_event, session) => {
  useAuthStore.getState().setSession(session);
});
