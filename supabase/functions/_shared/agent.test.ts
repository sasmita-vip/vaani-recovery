import { describe, expect, it } from 'vitest';
import {
  addDaysKey,
  decideAgentTurn,
  detectIntent,
  escalationFor,
  istDateKey,
  parsePromiseDate,
  type AgentContext,
} from './agent';

const NOW = new Date('2026-11-10T06:00:00.000Z'); // 11:30 IST, 10 Nov 2026

const ctx: AgentContext = {
  customerName: 'Rohan Mehta',
  lenderName: 'Sterling Credit',
  loanId: 'LN-00482917',
  loanType: 'Personal loan',
  overdueAmount: 4500,
  daysPastDue: 12,
  identityVerified: true,
  now: NOW,
};

describe('IST dates', () => {
  it('formats the IST calendar date, not UTC', () => {
    expect(istDateKey(new Date('2026-11-10T20:00:00.000Z'))).toBe('2026-11-11');
    expect(istDateKey(NOW)).toBe('2026-11-10');
  });

  it('adds days without drifting across month ends', () => {
    expect(addDaysKey(new Date('2026-11-30T06:00:00.000Z'), 2)).toBe('2026-12-02');
  });
});

describe('parsePromiseDate', () => {
  it('understands relative Hinglish dates', () => {
    expect(parsePromiseDate('main kal kar dunga', NOW)).toBe('2026-11-11');
    expect(parsePromiseDate('aaj shaam tak', NOW)).toBe('2026-11-10');
    expect(parsePromiseDate('parso pakka', NOW)).toBe('2026-11-12');
    expect(parsePromiseDate('agle hafte', NOW)).toBe('2026-11-17');
  });

  it('rolls an earlier day number into next month', () => {
    expect(parsePromiseDate('5 tarikh ko', NOW)).toBe('2026-12-05');
    expect(parsePromiseDate('15th ko pay kar dunga', NOW)).toBe('2026-11-15');
  });

  it('returns null when no date was spoken', () => {
    expect(parsePromiseDate('theek hai bhai', NOW)).toBeNull();
  });
});

describe('detectIntent', () => {
  it('recognises hardship, dispute and complaint language', () => {
    expect(detectIntent('Meri tabiyat kharab hai, hospital mein hoon')).toBe('hardship');
    expect(detectIntent('Naukri chali gayi, salary nahi aayi')).toBe('hardship');
    expect(detectIntent('Ye amount galat hai, maine already pay kar diya')).toBe('dispute');
    expect(detectIntent('Mujhe senior officer se baat karni hai')).toBe('human');
    expect(detectIntent('Main consumer court mein complaint karunga')).toBe('complaint');
  });

  it('recognises confirmation, promises and refusals', () => {
    expect(detectIntent('Haan main Rohan bol raha hoon')).toBe('affirm');
    expect(detectIntent('Main 15 tarikh ko pay kar dunga')).toBe('ptp');
    expect(detectIntent('Abhi nahi de paunga')).toBe('refusal');
    expect(detectIntent('hmm')).toBe('unclear');
  });
});

describe('escalationFor', () => {
  it('splits medical and income hardship', () => {
    expect(escalationFor('hardship', 'papa hospital mein hain')).toBe('hardship_medical');
    expect(escalationFor('hardship', 'job chali gayi, income nahi hai')).toBe('hardship_income');
  });

  it('does not escalate a normal confirmation', () => {
    expect(escalationFor('affirm', 'haan theek hai')).toBeNull();
  });
});

describe('decideAgentTurn', () => {
  it('verifies identity on the first reply and states the demand', () => {
    const decision = decideAgentTurn('Haan main Rohan bol raha hoon', { ...ctx, identityVerified: false });
    expect(decision.identityVerified).toBe(true);
    expect(decision.stage).toBe('Payment demand');
    expect(decision.status).toBe('In Progress');
    expect(decision.reply).toContain('₹4,500');
    expect(decision.reply).toContain('LN-00482917');
  });

  it('escalates medical hardship and marks it sensitive', () => {
    const decision = decideAgentTurn('Mera operation hua hai, hospital ke paise bache nahi', ctx);
    expect(decision.outcome).toBe('escalate');
    expect(decision.escalationReason).toBe('hardship_medical');
    expect(decision.escalationSensitive).toBe(true);
    expect(decision.status).toBe('Escalated / Disputed');
  });

  it('captures a promise to pay with the spoken date', () => {
    const decision = decideAgentTurn('Kal shaam tak transfer kar dunga', ctx);
    expect(decision.outcome).toBe('ptp');
    expect(decision.promisedDate).toBe('2026-11-11');
    expect(decision.stage).toBe('Promise to pay');
    expect(decision.status).toBe('PTP Promised');
  });

  it('asks for a date when a promise has none', () => {
    const decision = decideAgentTurn('Main payment kar dunga', ctx);
    expect(decision.outcome).toBe('continue');
    expect(decision.intentLabel).toBe('PTP date requested');
  });

  it('offers a partial payment when the customer refuses', () => {
    const decision = decideAgentTurn('Abhi nahi de paunga', ctx);
    expect(decision.outcome).toBe('continue');
    expect(decision.stage).toBe('Negotiation');
  });
});
