import { useState, type FormEvent } from 'react';
import { AlertCircle, LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui';
import { WaveBackdrop } from '@/components/Waves';

export function SignInScreen({ notice, onBack }: { notice?: string | null; onBack?: () => void }) {
  const { signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your work email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-2 px-5 py-12 sm:px-8">
      <WaveBackdrop className="text-line-strong opacity-70" />

      <div className="relative z-10 w-full max-w-5xl">
        <header className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="text-sm font-black uppercase tracking-[0.32em] text-content-strong">Vaani Recovery</div>
          <span className="rounded-full bg-line-strong/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-content">
            Collections desk
          </span>
        </header>

        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <section>
            <h1 className="text-4xl font-black uppercase leading-none tracking-[0.14em] text-content-strong sm:text-5xl lg:text-6xl">
              Vaani
              <br />
              Recovery
            </h1>
            <p className="mt-5 text-xs font-medium uppercase tracking-[0.5em] text-muted sm:text-sm">
              Collections
            </p>
            <p className="mt-7 max-w-sm text-sm leading-7 text-muted">
              One desk for live calls, promises to pay and the human escalation queue. Calls stay inside
              permitted hours, identity is verified before any loan detail is disclosed, and sensitive
              cases reach an officer first.
            </p>
            <div className="mt-10 h-px w-24 bg-line-strong" />
            <p className="mt-4 text-[10px] uppercase tracking-[0.28em] text-muted">Restricted access</p>
          </section>

          <section className="card p-6 sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-content-strong">Sign in</h2>
            <p className="mt-2 text-sm text-muted">
              Signing in is only needed to change data. The dashboard itself is public.
            </p>

            {!isSupabaseConfigured && (
              <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Supabase is not configured. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your
                environment, then reload.
              </div>
            )}

            {(notice || error) && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{error ?? notice}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-5" noValidate>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="you@lender.in"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="••••••••"
                />
              </div>

              <Button className="w-full" icon={<LogIn className="h-4 w-4" />} disabled={submitting || !isSupabaseConfigured}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-5 text-center text-[10px] uppercase tracking-[0.18em] text-muted">
              No self sign-up
            </p>

            {notice && (
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-3 w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:text-indigo-400"
              >
                Use a different account
              </button>
            )}

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="mt-3 w-full text-center text-xs font-medium text-content underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                Continue as public viewer
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
