import { useEffect, useRef, useState } from 'react';
import { Search, Bell, Sun, Moon, Radio, RefreshCw, WifiOff } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { useLive, useLiveData } from '@/lib/live';
import { fetchSettings } from '@/lib/api';
import { callingWindowStatus } from '@/lib/callingWindow';
import { formatTime } from '@/lib/format';

interface TopBarProps {
  escalationCount: number;
  onSearch: (query: string) => void;
}

export function TopBar({ escalationCount, onSearch }: TopBarProps) {
  const { theme, toggle } = useTheme();
  const { profile, session } = useAuth();
  const { connection, lastSynced, refresh } = useLive();
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => new Date());
  const searchRef = useRef<HTMLInputElement>(null);
  const settings = useLiveData(fetchSettings);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Ctrl/Cmd+K focuses search from anywhere in the dashboard.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const windowStatus = settings.data
    ? callingWindowStatus(settings.data.callingStart, settings.data.callingEnd, now)
    : null;
  const displayName = profile?.fullName ?? 'Guest viewer';
  const roleLabel = profile?.role ?? 'Public view';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Radio className="h-4 w-4" />
        </div>
      </div>

      <form
        role="search"
        className="relative max-w-md flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) onSearch(query.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search calls by customer or loan ID"
          aria-keyshortcuts="Control+K"
          placeholder="Search by customer or loan ID…"
          className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-9 pr-12 text-sm text-content placeholder:text-muted focus:border-indigo-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted sm:block">
          Ctrl K
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {connection === 'disconnected' && (
          <span
            role="status"
            className="hidden items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 sm:flex"
          >
            <WifiOff className="h-3.5 w-3.5" /> Reconnecting…
          </span>
        )}

        {windowStatus && (
          <div
            className={`hidden items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium xl:flex ${
              windowStatus.open
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-line bg-surface-2 text-muted'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${windowStatus.open ? 'bg-emerald-500' : 'bg-stone-400'}`} />
            <span>{windowStatus.label}</span>
          </div>
        )}

        <button
          onClick={refresh}
          className="hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-muted hover:bg-surface-3 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 lg:flex"
          title="Reload dashboard data"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="tabular">{lastSynced ? `Last synced ${formatTime(lastSynced)}` : 'Syncing…'}</span>
        </button>

        <button
          onClick={toggle}
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-3 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>

        <div className="relative">
          <Bell className="h-5 w-5 text-muted" aria-hidden />
          <span className="sr-only">Notifications</span>
          {escalationCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
              {escalationCount}
            </span>
          )}
        </div>

        {!session && (
          <a
            href="#/signin"
            className="rounded-full border border-line px-3 py-1.5 text-[11px] font-medium text-content hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          >
            Sign in
          </a>
        )}

        <div className="flex items-center gap-2 rounded-lg p-1 pr-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{initials}</div>
          <div className="hidden text-left sm:block">
            <div className="text-xs font-semibold text-content-strong">{displayName}</div>
            <div className="text-[10px] capitalize text-muted">{roleLabel}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
