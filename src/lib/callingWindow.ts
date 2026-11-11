const IST_OFFSET_MINUTES = 330;
const DAY_MINUTES = 24 * 60;

const CLOCK_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Earliest and latest permitted calling hours, in IST. */
export const CALLING_WINDOW_START = '08:00';
export const CALLING_WINDOW_END = '19:00';

export function isValidClock(hhmm: string): boolean {
  return CLOCK_PATTERN.test(hhmm);
}

export function toMinutes(hhmm: string): number {
  if (!isValidClock(hhmm)) return Number.NaN;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatClock(hhmm: string): string {
  if (!isValidClock(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Minutes after IST midnight for an absolute instant. */
export function istMinutesOfDay(now: Date): number {
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MINUTES) % DAY_MINUTES;
}

export function callingWindowStatus(start: string, end: string, now: Date = new Date()) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const minutes = istMinutesOfDay(now);
  const valid = !Number.isNaN(startMinutes) && !Number.isNaN(endMinutes);
  const open = valid && minutes >= startMinutes && minutes < endMinutes;
  const range = `${formatClock(start)} to ${formatClock(end)} IST`;
  return {
    open,
    label: open ? `Calling window open, ${range}` : `Calling window closed, ${range}`,
  };
}

export function isWithinCallingWindow(scheduledFor: Date, start: string, end: string): boolean {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return false;
  if (Number.isNaN(scheduledFor.getTime())) return false;
  const minutes = istMinutesOfDay(scheduledFor);
  return minutes >= startMinutes && minutes < endMinutes;
}

export interface CallingWindowErrors {
  callingStart?: string;
  callingEnd?: string;
}

/** Validates the settings calling window (8:00 AM to 7:00 PM, start before end). */
export function validateCallingWindow(start: string, end: string): CallingWindowErrors {
  const errors: CallingWindowErrors = {};
  if (!isValidClock(start)) {
    errors.callingStart = 'Use a 24-hour time such as 08:00.';
  } else if (start < CALLING_WINDOW_START) {
    errors.callingStart = 'Calling hours cannot start before 8:00 AM.';
  }

  if (!isValidClock(end)) {
    errors.callingEnd = 'Use a 24-hour time such as 19:00.';
  } else if (end > CALLING_WINDOW_END) {
    errors.callingEnd = 'Calling hours cannot end after 7:00 PM.';
  }

  if (!errors.callingStart && !errors.callingEnd && start >= end) {
    errors.callingEnd = 'End time must be after the start time.';
  }

  return errors;
}

/** Formats an absolute instant as an IST clock time for callback messages. */
export function formatIstClock(instant: Date): string {
  const minutes = istMinutesOfDay(instant);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
