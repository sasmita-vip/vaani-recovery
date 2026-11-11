import { describe, expect, it } from 'vitest';
import {
  CALLING_WINDOW_END,
  CALLING_WINDOW_START,
  callingWindowStatus,
  formatClock,
  isWithinCallingWindow,
  isValidClock,
  istMinutesOfDay,
  toMinutes,
  validateCallingWindow,
} from '@/lib/callingWindow';

describe('clock helpers', () => {
  it('accepts 24-hour times only', () => {
    expect(isValidClock('08:00')).toBe(true);
    expect(isValidClock('19:00')).toBe(true);
    expect(isValidClock('24:00')).toBe(false);
    expect(isValidClock('8:00')).toBe(false);
    expect(isValidClock('noon')).toBe(false);
  });

  it('converts between clock strings and minutes', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(Number.isNaN(toMinutes('nope'))).toBe(true);
    expect(formatClock('08:00')).toBe('8:00 AM');
    expect(formatClock('19:00')).toBe('7:00 PM');
    expect(formatClock('00:15')).toBe('12:15 AM');
  });

  it('derives IST minutes of the day from an instant', () => {
    expect(istMinutesOfDay(new Date('2026-11-10T02:30:00Z'))).toBe(480); // 08:00 IST
    expect(istMinutesOfDay(new Date('2026-11-10T13:30:00Z'))).toBe(1140); // 19:00 IST
  });

  it('exposes the permitted window bounds', () => {
    expect(CALLING_WINDOW_START).toBe('08:00');
    expect(CALLING_WINDOW_END).toBe('19:00');
  });
});

describe('callingWindowStatus', () => {
  it('reports open inside the window', () => {
    const status = callingWindowStatus('08:00', '19:00', new Date('2026-11-10T04:00:00Z')); // 09:30 IST
    expect(status.open).toBe(true);
    expect(status.label).toContain('open');
  });

  it('reports closed outside the window', () => {
    expect(callingWindowStatus('08:00', '19:00', new Date('2026-11-10T14:30:00Z')).open).toBe(false); // 20:00 IST
    expect(callingWindowStatus('08:00', '19:00', new Date('2026-11-10T01:00:00Z')).open).toBe(false); // 06:30 IST
  });

  it('treats the end time as exclusive', () => {
    expect(callingWindowStatus('08:00', '19:00', new Date('2026-11-10T13:30:00Z')).open).toBe(false); // exactly 19:00
  });
});

describe('isWithinCallingWindow', () => {
  it('checks the scheduled instant in IST', () => {
    expect(isWithinCallingWindow(new Date('2026-11-10T05:00:00Z'), '08:00', '19:00')).toBe(true); // 10:30 IST
    expect(isWithinCallingWindow(new Date('2026-11-10T16:00:00Z'), '08:00', '19:00')).toBe(false); // 21:30 IST
  });

  it('rejects invalid input', () => {
    expect(isWithinCallingWindow(new Date('invalid'), '08:00', '19:00')).toBe(false);
    expect(isWithinCallingWindow(new Date('2026-11-10T05:00:00Z'), 'bad', '19:00')).toBe(false);
  });
});

describe('validateCallingWindow', () => {
  it('accepts the permitted range', () => {
    expect(validateCallingWindow('08:00', '19:00')).toEqual({});
    expect(validateCallingWindow('09:30', '18:15')).toEqual({});
  });

  it('rejects hours outside 8 AM to 7 PM', () => {
    expect(validateCallingWindow('07:00', '19:00').callingStart).toBeTruthy();
    expect(validateCallingWindow('08:00', '20:00').callingEnd).toBeTruthy();
  });

  it('rejects an end before the start', () => {
    expect(validateCallingWindow('18:00', '09:00').callingEnd).toBe('End time must be after the start time.');
  });

  it('rejects malformed times', () => {
    expect(validateCallingWindow('8am', '19:00').callingStart).toBeTruthy();
  });
});
