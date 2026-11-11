/**
 * Deterministic conversation policy for the Vaani collections agent.
 *
 * The voice pipeline is: Gnani Prisma (speech -> text) -> this policy
 * (text -> reply + action) -> Gnani Timbre (text -> speech).
 *
 * No LLM is required for the demo: the policy recognises identity
 * confirmation, hardship, disputes, complaints, human-handoff requests and
 * promises to pay, then returns the next line plus the database action the
 * Edge Function must take. Kept free of Deno/DOM APIs so it is unit tested by
 * Vitest from the Vite project.
 */

export type EscalationReason =
  | 'customer_requested_human'
  | 'dispute'
  | 'hardship_medical'
  | 'hardship_income'
  | 'bereavement'
  | 'complaint'
  | 'negotiation_request'
  | 'technical_failure'
  | 'supervisor_transfer';

export type AgentStage = 'Identity verification' | 'Payment demand' | 'Negotiation' | 'Promise to pay';

export type AgentIntent =
  | 'affirm'
  | 'hardship'
  | 'dispute'
  | 'human'
  | 'complaint'
  | 'bereavement'
  | 'ptp'
  | 'refusal'
  | 'unclear';

export interface AgentContext {
  customerName: string;
  lenderName: string;
  loanId: string;
  loanType: string;
  overdueAmount: number;
  daysPastDue: number;
  identityVerified: boolean;
  now: Date;
}

export interface AgentDecision {
  reply: string;
  stage: AgentStage;
  /** Short label stored in `calls.agent_intent`. */
  intentLabel: string;
  identityVerified: boolean;
  status: string;
  outcome: 'continue' | 'ptp' | 'escalate';
  escalationReason?: EscalationReason;
  escalationSensitive?: boolean;
  promisedDate?: string;
}

const MEDICAL_WORDS = [
  'hospital',
  'medical',
  'bimari',
  'beemar',
  'ilaaj',
  'ilaj',
  'operation',
  'accident',
  'icu',
  'dawai',
  'davai',
  'surgery',
  'treatment',
];

const INCOME_WORDS = [
  'naukri',
  'job',
  'salary',
  'income',
  'business band',
  'dukaan band',
  'paisa nahi',
  'paise nahi',
  'tight',
  'majboori',
  'majburi',
  'no money',
  'unemployed',
  'layoff',
  'terminated',
];

const DISPUTE_WORDS = [
  'galat',
  'dispute',
  'wrong',
  'already pay',
  'already paid',
  'pay kar diya',
  'pay kiye',
  'extra charge',
  'cibil',
  'statement',
  'record',
];

const HUMAN_WORDS = [
  'insaan',
  'officer',
  'senior',
  'manager',
  'human',
  'baat karni',
  'baat karao',
  'transfer karo',
  'transfer kar do',
  'transfer kar dijiye',
  'officer ko',
  'kisi se baat',
  'representative',
  'agent se nahi',
];

const COMPLAINT_WORDS = ['complaint', 'shikayat', 'legal', 'court', 'police', 'rbi', 'consumer'];

const BEREAVEMENT_WORDS = ['dehant', 'nidhan', 'death', 'expired', 'swargwas', 'funeral', 'mayat'];

const REFUSAL_WORDS = ['nahi dunga', 'nahi de paunga', 'nahi kar sakta', 'nahi kar paunga', 'cant pay', "can't pay", 'will not pay', 'refuse'];

const AFFIRM_WORDS = [
  'haan',
  'haan ji',
  'bilkul',
  'yes',
  'yep',
  'bol raha',
  'bol rahi',
  'boliye',
  'speaking',
  'main hi',
  'theek hai',
  'ok',
];

const PTP_WORDS = [
  'kal',
  'parso',
  'agle hafte',
  'agle hafta',
  'next week',
  'agle mahine',
  'aaj',
  'today',
  'tomorrow',
  'tarikh',
  'tareekh',
  'de dunga',
  'kar dunga',
  'pay kar',
  'payment kar',
  'transfer kar',
  'arrange',
  'link bhej',
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}

/** Calendar date (YYYY-MM-DD) in IST for the given instant. */
export function istDateKey(now: Date): string {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const month = `${ist.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${ist.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function istParts(now: Date): { year: number; month: number; day: number } {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return { year: ist.getUTCFullYear(), month: ist.getUTCMonth(), day: ist.getUTCDate() };
}

function dateFromParts(year: number, month: number, day: number): string {
  const utc = new Date(Date.UTC(year, month, day));
  const y = utc.getUTCFullYear();
  const m = `${utc.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${utc.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(now: Date, days: number): string {
  const { year, month, day } = istParts(now);
  return dateFromParts(year, month, day + days);
}

/**
 * Extracts the promised payment date from Hinglish/English speech.
 * Returns an IST calendar date, or null when no date was mentioned.
 */
export function parsePromiseDate(text: string, now: Date): string | null {
  const t = normalise(text);
  const { year, month, day } = istParts(now);

  if (hasAny(t, ['parso', 'day after tomorrow'])) return dateFromParts(year, month, day + 2);
  if (hasAny(t, ['aaj', 'today', 'abhi', 'right now'])) return dateFromParts(year, month, day);
  if (hasAny(t, ['kal', 'tomorrow'])) return dateFromParts(year, month, day + 1);
  if (hasAny(t, ['agle hafte', 'agle hafta', 'next week', 'ek hafte', 'one week'])) {
    return dateFromParts(year, month, day + 7);
  }
  if (hasAny(t, ['agle mahine', 'next month', 'ek mahine'])) return dateFromParts(year, month, day + 30);

  const dayMatch = t.match(/\b(\d{1,2})\s*(?:tarikh|tareekh|th|st|nd|rd|ko)\b/);
  if (dayMatch) {
    const wanted = Math.min(Math.max(Number(dayMatch[1]), 1), 28);
    if (wanted < day) return dateFromParts(year, month + 1, wanted);
    return dateFromParts(year, month, wanted);
  }

  const isoMatch = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  return null;
}

export function detectIntent(text: string): AgentIntent {
  const t = normalise(text);
  if (!t) return 'unclear';

  if (hasAny(t, BEREAVEMENT_WORDS)) return 'bereavement';
  if (hasAny(t, MEDICAL_WORDS) || hasAny(t, INCOME_WORDS)) return 'hardship';
  if (hasAny(t, DISPUTE_WORDS)) return 'dispute';
  if (hasAny(t, HUMAN_WORDS)) return 'human';
  if (hasAny(t, COMPLAINT_WORDS)) return 'complaint';
  if (hasAny(t, REFUSAL_WORDS)) return 'refusal';
  if (parsePromiseDate(t, new Date()) !== null || hasAny(t, PTP_WORDS)) return 'ptp';
  if (hasAny(t, AFFIRM_WORDS)) return 'affirm';
  return 'unclear';
}

function inr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(amount))}`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

const ESCALATION_COPY: Record<EscalationReason, string> = {
  hardship_medical:
    'I understand, and there will be no pressure on you about this. I am putting your call through to a senior officer who will speak with you calmly.',
  hardship_income:
    'I understand — immediate payment is difficult in this situation. I am transferring your call to a senior officer who can work out a suitable option.',
  dispute:
    'I have noted that you dispute the amount. I am sending this case to a senior officer who will check your records and speak with you.',
  complaint:
    'I am passing your complaint to a senior officer. Your call is queued with priority, please stay on the line.',
  bereavement:
    'I will not discuss payment at this difficult time. I am putting your call through to a senior officer. Please take care.',
  customer_requested_human: 'Of course, I am transferring your call to a senior officer. Please stay on the line.',
  negotiation_request: 'Alright, I am passing this to a senior officer who can discuss the options with you.',
  technical_failure: 'Sorry, we have a technical issue. I am connecting your call to an officer.',
  supervisor_transfer: 'I am transferring your call to a supervisor.',
};

export function escalationFor(intent: AgentIntent, text: string): EscalationReason | null {
  const t = normalise(text);
  if (intent === 'bereavement') return 'bereavement';
  if (intent === 'hardship') {
    return hasAny(t, MEDICAL_WORDS) ? 'hardship_medical' : 'hardship_income';
  }
  if (intent === 'dispute') return 'dispute';
  if (intent === 'complaint') return 'complaint';
  if (intent === 'human') return 'customer_requested_human';
  return null;
}

function escalationDecision(reason: EscalationReason, ctx: AgentContext, intentLabel: string): AgentDecision {
  return {
    reply: `${ESCALATION_COPY[reason]} Thank you, ${firstName(ctx.customerName)}. Connecting you now.`,
    stage: 'Negotiation',
    intentLabel,
    identityVerified: true,
    status: 'Escalated / Disputed',
    outcome: 'escalate',
    escalationReason: reason,
    escalationSensitive:
      reason === 'hardship_medical' ||
      reason === 'hardship_income' ||
      reason === 'bereavement' ||
      reason === 'dispute' ||
      reason === 'complaint',
  };
}

function demandCopy(ctx: AgentContext): string {
  return `Your ${ctx.loanType} ${ctx.loanId} has ${inr(ctx.overdueAmount)} overdue, ${ctx.daysPastDue} days past due. Can you make the payment today or this week?`;
}

export function decideAgentTurn(text: string, ctx: AgentContext): AgentDecision {
  const t = normalise(text);
  const intent = detectIntent(text);
  const reason = escalationFor(intent, text);

  if (!ctx.identityVerified) {
    return {
      reply: `Thank you, ${firstName(ctx.customerName)}. ${demandCopy(ctx)}`,
      stage: 'Payment demand',
      intentLabel: 'Identity verified',
      identityVerified: true,
      status: 'In Progress',
      outcome: 'continue',
    };
  }

  if (reason) {
    const label =
      reason === 'hardship_medical' || reason === 'hardship_income'
        ? 'Hardship — escalate'
        : reason === 'dispute'
          ? 'Dispute — escalate'
          : reason === 'complaint'
            ? 'Complaint — escalate'
            : reason === 'bereavement'
              ? 'Bereavement — escalate'
              : 'Human handoff';
    return escalationDecision(reason, ctx, label);
  }

  if (intent === 'ptp') {
    const promisedDate = parsePromiseDate(text, ctx.now);
    if (!promisedDate) {
      return {
        reply: `All right, ${firstName(ctx.customerName)}. By which date will the payment be made? Today, tomorrow, or another date?`,
        stage: 'Negotiation',
        intentLabel: 'PTP date requested',
        identityVerified: true,
        status: 'In Progress',
        outcome: 'continue',
      };
    }
    return {
      reply: `Perfect. I have noted a payment of ${inr(ctx.overdueAmount)} for ${promisedDate}, and I am sending the payment link by SMS. You will receive a confirmation once the payment is done. Thank you, ${firstName(ctx.customerName)}.`,
      stage: 'Promise to pay',
      intentLabel: 'PTP captured',
      identityVerified: true,
      status: 'PTP Promised',
      outcome: 'ptp',
      promisedDate,
    };
  }

  if (intent === 'refusal') {
    return {
      reply: `I understand. Could you pay a partial amount today and the rest next week? That will reduce the late charges on your loan file.`,
      stage: 'Negotiation',
      intentLabel: 'Payment refused — options offered',
      identityVerified: true,
      status: 'In Progress',
      outcome: 'continue',
    };
  }

  if (intent === 'affirm') {
    return {
      reply: `Thank you. ${demandCopy(ctx)} Shall I send the payment link by SMS?`,
      stage: 'Payment demand',
      intentLabel: 'Demand stated',
      identityVerified: true,
      status: 'In Progress',
      outcome: 'continue',
    };
  }

  return {
    reply: `I understand. ${demandCopy(ctx)} I can also explain a partial payment option if you would like.`,
    stage: 'Negotiation',
    intentLabel: 'Needs clarification',
    identityVerified: true,
    status: 'In Progress',
    outcome: 'continue',
  };
}
