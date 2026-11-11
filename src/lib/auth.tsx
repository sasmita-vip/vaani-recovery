import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase, supabaseConfigError } from '@/lib/supabase';
import type { Profile, Role } from '@/types';

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  profileError: null,
  signIn: async () => {},
  signOut: async () => {},
});

/**
 * Supabase returns terse auth messages ("Invalid login credentials"). Rewrite the
 * common ones into something a collections manager can act on. The app has no
 * self sign-up, so an unknown email and a wrong password are the same failure.
 */
export function friendlySignInError(message: string): string {
  const detail = message.trim();
  if (/invalid login credentials/i.test(detail)) {
    return 'Email or password is incorrect. Accounts are created by a manager in Supabase → Authentication → Users; there is no self sign-up.';
  }
  if (/email not confirmed/i.test(detail)) {
    return 'This account has not confirmed its email. Confirm it in Supabase → Authentication → Users, then sign in.';
  }
  if (/invalid api key|no api key found/i.test(detail)) {
    return 'Supabase rejected the public API key. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.';
  }
  if (/failed to fetch|networkerror|load failed/i.test(detail)) {
    return 'Could not reach Supabase. Check the project URL, that the project is running, and your connection.';
  }
  if (/too many requests|rate limit/i.test(detail)) {
    return 'Too many sign-in attempts. Wait a minute and try again.';
  }
  return detail || 'Sign-in failed. Try again.';
}

function mapProfile(row: Record<string, unknown>): Profile {
  const role = row.role === 'manager' || row.role === 'compliance' ? row.role : 'officer';
  return {
    id: String(row.id ?? ''),
    fullName: typeof row.full_name === 'string' && row.full_name ? row.full_name : 'Signed-in user',
    email: typeof row.email === 'string' ? row.email : null,
    role: role as Role,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadProfile = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.user) {
      setProfile(null);
      setProfileError(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (error) {
      setProfile(null);
      setProfileError(`Your profile could not be loaded: ${error.message}`);
      setLoading(false);
      return;
    }
    if (!data) {
      setProfile(null);
      setProfileError(
        'Your account has no profile row yet. Ask a manager to add you in Supabase, then sign in again.'
      );
      setLoading(false);
      return;
    }

    setProfile(mapProfile(data as Record<string, unknown>));
    setProfileError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setProfileError(supabaseConfigError ?? 'Supabase is not configured.');
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        void loadProfile(data.session);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      void loadProfile(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (supabaseConfigError) throw new Error(supabaseConfigError);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlySignInError(error.message));
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, profileError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Convenience flags used by screens to gate actions by role. */
export function usePermissions() {
  const { profile } = useAuth();
  const role = profile?.role ?? null;
  return {
    role,
    canWorkEscalations: role === 'manager' || role === 'officer',
    canEditSettings: role === 'manager',
    canExport: role === 'manager' || role === 'officer',
  };
}
