import {
  LayoutDashboard,
  PhoneCall,
  AlertTriangle,
  Handshake,
  History,
  ShieldCheck,
  Settings,
  ChevronLeft,
  Radio,
  LogOut,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { NavKey } from '@/lib/router';

export type { NavKey };

interface NavItem {
  key: NavKey;
  label: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-5 w-5" /> },
  { key: 'live', label: 'Live Calls', icon: <PhoneCall className="h-5 w-5" /> },
  { key: 'escalation', label: 'Escalation Queue', icon: <AlertTriangle className="h-5 w-5" /> },
  { key: 'ptp', label: 'Promises to Pay', icon: <Handshake className="h-5 w-5" /> },
  { key: 'history', label: 'Call History', icon: <History className="h-5 w-5" /> },
  { key: 'compliance', label: 'Compliance', icon: <ShieldCheck className="h-5 w-5" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
];

const roleLabels: Record<string, string> = {
  manager: 'Manager',
  officer: 'Collections Officer',
  compliance: 'Compliance',
};

interface SidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  liveCount: number;
  escalationCount: number;
}

export function Sidebar({ active, onNavigate, collapsed, onToggleCollapse, liveCount, escalationCount }: SidebarProps) {
  const { profile, session, signOut } = useAuth();
  const displayName = profile?.fullName ?? 'Guest viewer';
  const roleLabel = profile ? roleLabels[profile.role] : 'Public view';
  const initials = (profile?.fullName ?? 'Guest Viewer').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <aside
      className={`hidden md:flex flex-col shrink-0 border-r border-line bg-surface transition-all duration-200 ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
          <Radio className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="truncate text-xs font-black uppercase tracking-[0.18em] text-content-strong">Vaani Recovery</div>
            <div className="truncate text-[9px] uppercase tracking-[0.22em] text-muted">Collections</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main">
        {navItems.map((item) => {
          const isActive = active === item.key || (active === 'call-detail' && item.key === 'history');
          const badge =
            item.key === 'live' ? liveCount : item.key === 'escalation' ? escalationCount : 0;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                  : 'text-muted hover:bg-surface-3 hover:text-content'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-indigo-600" />
              )}
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && badge > 0 && (
                <span
                  className={`ml-auto tabular rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    item.key === 'escalation'
                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                      : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
                  }`}
                >
                  {badge}
                </span>
              )}
              {collapsed && badge > 0 && (
                <span
                  className={`absolute right-1.5 top-1.5 tabular h-4 min-w-4 rounded-full px-1 text-[9px] font-semibold leading-4 ${
                    item.key === 'escalation'
                      ? 'bg-rose-500 text-white'
                      : 'bg-indigo-500 text-white'
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Signed-in user */}
      <div className="border-t border-line p-3">
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              title={`${displayName} · ${roleLabel}`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white"
            >
              {initials}
            </div>
            {session ? (
              <button
                onClick={() => void signOut()}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-content"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <a
                href="#/signin"
                aria-label="Sign in"
                title="Sign in"
                className="rounded-lg p-2 text-muted hover:bg-surface-3 hover:text-content"
              >
                <LogOut className="h-4 w-4 rotate-180" />
              </a>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-content-strong">{displayName}</div>
                <div className="truncate text-[9px] uppercase tracking-[0.16em] text-muted">{roleLabel}</div>
              </div>
            </div>
            {session ? (
              <button
                onClick={() => void signOut()}
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted hover:bg-surface-3 hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            ) : (
              <a
                href="#/signin"
                className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-indigo-700 hover:bg-surface-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 dark:text-indigo-300"
              >
                <LogOut className="h-3.5 w-3.5 rotate-180" /> Sign in to edit
              </a>
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-line p-3">
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-3 hover:text-content"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}

export function BottomNav({ active, onNavigate, liveCount, escalationCount }: { active: NavKey; onNavigate: (k: NavKey) => void; liveCount: number; escalationCount: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-line bg-surface/95 backdrop-blur md:hidden" aria-label="Sections">
      {navItems.map((item) => {
        const isActive = active === item.key || (active === 'call-detail' && item.key === 'history');
        const badge = item.key === 'live' ? liveCount : item.key === 'escalation' ? escalationCount : 0;
        return (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[9px] font-medium ${
              isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted'
            }`}
          >
            <span className="relative">
              {item.icon}
              {badge > 0 && (
                <span className="absolute -right-2 -top-1 tabular h-3.5 min-w-3.5 rounded-full bg-rose-500 px-1 text-[8px] font-semibold leading-3.5 text-white">
                  {badge}
                </span>
              )}
            </span>
            <span className="truncate">{item.label.split(' ')[0]}</span>
          </button>
        );
      })}
    </nav>
  );
}
