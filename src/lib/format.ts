/** All display formatting is done in IST (Asia/Kolkata). */

export const IST_TIME_ZONE = 'Asia/Kolkata';

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ₹1,25,000 — Indian digit grouping. */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** 10 Nov 2026 */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** 10:42 AM */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** 10 Nov 2026, 10:42 AM */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatDate(date)}, ${formatTime(date)}`;
}

/** YYYY-MM-DD for the IST calendar day. */
export function istDateKey(value: DateInput = new Date()): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Parses a YYYY-MM-DD calendar date at IST midnight. */
export function parseIstDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00+05:30`);
}

/** Whole days between two calendar dates (positive = later). */
export function daysBetween(fromDate: string, toDate: string): number {
  const from = parseIstDate(fromDate).getTime();
  const to = parseIstDate(toDate).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function formatDuration(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatWaiting(min: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(min) ? min : 0));
  if (safe < 60) return `${safe}m`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

export function daysLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

/**
 * Masks a phone number for tables: +91 98••• ••710.
 * Only the country code, first two and last three digits are shown.
 */
export function maskPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  if (national.length !== 10) return '•••';
  return `+91 ${national.slice(0, 2)}••• ••${national.slice(-3)}`;
}

/** Escapable value for CSV cells. */
export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n');
}
