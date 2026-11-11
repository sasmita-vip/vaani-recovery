import { describe, expect, it } from 'vitest';
import {
  csvCell,
  daysBetween,
  daysLabel,
  formatDate,
  formatDateTime,
  formatDuration,
  formatINR,
  formatTime,
  formatWaiting,
  istDateKey,
  maskPhone,
  parseIstDate,
  toCsv,
} from '@/lib/format';

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(125000)).toBe('₹1,25,000');
    expect(formatINR(0)).toBe('₹0');
  });
});

describe('date and time formatting', () => {
  const instant = '2026-11-10T10:42:00+05:30';

  it('formats dates as 10 Nov 2026', () => {
    expect(formatDate(instant)).toBe('10 Nov 2026');
  });

  it('formats times as 10:42 AM in IST', () => {
    expect(formatTime(instant)).toBe('10:42 AM');
    expect(formatTime('2026-11-10T19:05:00+05:30')).toBe('7:05 PM');
  });

  it('combines date and time', () => {
    expect(formatDateTime(instant)).toBe('10 Nov 2026, 10:42 AM');
  });

  it('returns a placeholder for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });
});

describe('IST calendar helpers', () => {
  it('returns the IST date key', () => {
    expect(istDateKey('2026-11-10T18:45:00Z')).toBe('2026-11-11');
    expect(istDateKey('2026-11-10T18:00:00Z')).toBe('2026-11-10');
  });

  it('parses a date key at IST midnight', () => {
    expect(parseIstDate('2026-11-10').toISOString()).toBe('2026-11-09T18:30:00.000Z');
  });

  it('counts whole days between calendar dates', () => {
    expect(daysBetween('2026-11-10', '2026-11-14')).toBe(4);
    expect(daysBetween('2026-11-14', '2026-11-10')).toBe(-4);
  });
});

describe('duration and waiting helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('formats waiting time in minutes and hours', () => {
    expect(formatWaiting(45)).toBe('45m');
    expect(formatWaiting(95)).toBe('1h 35m');
  });

  it('labels relative days', () => {
    expect(daysLabel(0)).toBe('Today');
    expect(daysLabel(3)).toBe('in 3d');
    expect(daysLabel(-2)).toBe('2d ago');
  });
});

describe('maskPhone', () => {
  it('shows only the country code, first two and last three digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 98••• ••210');
    expect(maskPhone('9876543210')).toBe('+91 98••• ••210');
  });

  it('hides short or empty numbers entirely', () => {
    expect(maskPhone('')).toBe('•••');
    expect(maskPhone('12345')).toBe('•••');
  });
});

describe('CSV helpers', () => {
  it('escapes commas and quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('');
  });

  it('builds a CSV document with a header row', () => {
    const csv = toCsv(['Customer', 'Amount'], [['Asha', 125000]]);
    expect(csv).toBe('Customer,Amount\nAsha,125000');
  });
});
