import { useEffect, type ReactNode } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react';

export type StatusColor =
  | 'overdue'
  | 'ptp'
  | 'escalated'
  | 'paid'
  | 'closed'
  | 'progress'
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success';

const colorMap: Record<StatusColor, { light: string; dark: string; dot: string; text: string }> = {
  overdue: { light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20', dot: 'bg-amber-500', text: 'Overdue' },
  ptp: { light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20', dot: 'bg-emerald-500', text: 'PTP Promised' },
  escalated: { light: 'bg-rose-50 text-rose-700 border-rose-200', dark: 'dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20', dot: 'bg-rose-500', text: 'Escalated' },
  paid: { light: 'bg-blue-50 text-blue-700 border-blue-200', dark: 'dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20', dot: 'bg-blue-500', text: 'Paid' },
  closed: { light: 'bg-surface-3 text-muted border-line', dark: 'dark:bg-stone-500/10 dark:text-stone-300 dark:border-stone-500/20', dot: 'bg-stone-400', text: 'Closed' },
  progress: { light: 'bg-indigo-50 text-indigo-700 border-indigo-200', dark: 'dark:bg-indigo-500/10 dark:text-indigo-300 dark:border-indigo-500/20', dot: 'bg-indigo-500', text: 'In Progress' },
  neutral: { light: 'bg-surface-3 text-muted border-line', dark: 'dark:bg-stone-700/40 dark:text-stone-300 dark:border-stone-600/40', dot: 'bg-stone-400', text: '' },
  info: { light: 'bg-teal-50 text-teal-700 border-teal-200', dark: 'dark:bg-teal-500/10 dark:text-teal-300 dark:border-teal-500/20', dot: 'bg-teal-500', text: '' },
  warning: { light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20', dot: 'bg-amber-500', text: '' },
  success: { light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20', dot: 'bg-emerald-500', text: '' },
};

interface ChipProps {
  color: StatusColor;
  children: ReactNode;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function Chip({ color, children, dot, pulse, className = '' }: ChipProps) {
  const c = colorMap[color];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${c.light} ${c.dark} ${className}`}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${c.dot} animate-pulse-ring`} />
          )}
          <span className={`relative inline-flex h-2 w-2 rounded-full ${c.dot}`} />
        </span>
      )}
      {children}
    </span>
  );
}

export function statusToColor(status: string): StatusColor {
  const map: Record<string, StatusColor> = {
    'Overdue': 'overdue',
    'PTP Promised': 'ptp',
    'Escalated / Disputed': 'escalated',
    'Paid': 'paid',
    'Closed': 'closed',
    'In Progress': 'progress',
    'Completed': 'info',
    'Failed': 'neutral',
    'Upcoming': 'info',
    'Due today': 'overdue',
    'Missed': 'escalated',
    'Open': 'escalated',
    'Assigned': 'progress',
    'Resolved': 'ptp',
  };
  return map[status] ?? 'neutral';
}

interface ButtonProps {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  onClick?: () => void;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}

export function Button({ children, variant = 'primary', size = 'md', onClick, icon, className = '', disabled, title }: ButtonProps) {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-sm',
    secondary: 'bg-surface text-content border border-line-strong hover:bg-surface-3 shadow-sm',
    ghost: 'text-content hover:bg-surface-3',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

interface BadgeProps {
  children: ReactNode;
  tone?: 'default' | 'sensitive';
}

export function Badge({ children, tone = 'default' }: BadgeProps) {
  if (tone === 'sensitive') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
      {children}
    </span>
  );
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`card ${onClick ? 'cursor-pointer transition-shadow hover:shadow-card-lg' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold text-content-strong">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, breadcrumbs, action }: { title: string; subtitle?: string; breadcrumbs?: string[]; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {breadcrumbs && (
          <nav className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-muted">
            {breadcrumbs.map((b, i) => (
              <span key={b} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <span className={i === breadcrumbs.length - 1 ? 'text-content' : ''}>{b}</span>
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-lg font-black uppercase tracking-[0.16em] text-content-strong sm:text-xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-3 text-muted">{icon}</div>
      <h3 className="text-sm font-semibold text-content-strong">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, colorClass = 'bg-indigo-600' }: { value: number; max: number; colorClass?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Right-hand drawer. Closes on Escape, backdrop click and the close button. */
export function Drawer({
  onClose,
  children,
  widthClass = 'max-w-lg',
  label,
}: {
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  label: string;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full ${widthClass} flex-col bg-surface shadow-pop animate-slide-in-right`}
      >
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  label = 'rows',
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  label?: string;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
      <p className="tabular text-xs text-muted" aria-live="polite">
        {start} to {end} of {total} {label}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-content hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </button>
        <span className="tabular px-1 text-xs text-muted">
          Page {page} of {lastPage}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= lastPage}
          className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-content hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function SortableTh({
  label,
  column,
  sortBy,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string;
  column: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (column: string) => void;
  align?: 'left' | 'right';
}) {
  const active = sortBy === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 ${active ? 'text-content-strong' : ''}`}
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted/50'}`} />
      </button>
    </th>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
        <TriangleAlert className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-content-strong">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{message}</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
