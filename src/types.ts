export type LoanType = 'Personal loan' | 'Two-wheeler loan' | 'Business loan';

export type LoanStatus = 'Overdue' | 'PTP Promised' | 'Escalated / Disputed' | 'Paid' | 'Closed';

export type CallStatus = 'In Progress' | 'Completed' | 'PTP Promised' | 'Escalated / Disputed' | 'Failed';

export type LanguageMix = 'English' | 'Hindi' | 'Tamil' | 'Telugu';

export type ConversationStage =
  | 'Identity verification'
  | 'Payment demand'
  | 'Negotiation'
  | 'Promise to pay';

export type PromiseState = 'Upcoming' | 'Due today' | 'Missed' | 'Paid';

export type Role = 'manager' | 'officer' | 'compliance';

export type EscalationReasonCode =
  | 'customer_requested_human'
  | 'dispute'
  | 'hardship_medical'
  | 'hardship_income'
  | 'bereavement'
  | 'complaint'
  | 'negotiation_request'
  | 'technical_failure'
  | 'supervisor_transfer';

export type QueueStatus = 'Open' | 'Assigned' | 'Resolved';

export type OutboundStatus = 'queued' | 'sent' | 'failed';

export const ESCALATION_REASONS: EscalationReasonCode[] = [
  'customer_requested_human',
  'dispute',
  'hardship_medical',
  'hardship_income',
  'bereavement',
  'complaint',
  'negotiation_request',
  'technical_failure',
  'supervisor_transfer',
];

export const ESCALATION_REASON_LABELS: Record<EscalationReasonCode, string> = {
  customer_requested_human: 'Customer asked for human',
  dispute: 'Dispute',
  hardship_medical: 'Hardship or medical',
  hardship_income: 'Hardship or income',
  bereavement: 'Bereavement',
  complaint: 'Complaint',
  negotiation_request: 'Negotiation request',
  technical_failure: 'Technical failure',
  supervisor_transfer: 'Supervisor transfer',
};

export const SENSITIVE_REASONS: EscalationReasonCode[] = [
  'hardship_medical',
  'hardship_income',
  'bereavement',
];

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  role: Role;
}

export interface Loan {
  loanId: string;
  customerId: string;
  customerName: string;
  lenderName: string;
  loanType: LoanType;
  overdueAmount: number;
  dueDate: string;
  daysPastDue: number;
  status: LoanStatus;
  phone: string;
}

export interface TranscriptLine {
  id: string;
  seq: number;
  speaker: 'agent' | 'customer';
  text: string;
  time: string;
  intent?: string;
}

export interface Call {
  callId: string;
  loanId: string;
  customerName: string;
  loanType: LoanType;
  overdueAmount: number;
  phone: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  status: CallStatus;
  language: LanguageMix;
  stage: ConversationStage;
  agentIntent?: string;
  provider: string | null;
  providerStatus: string | null;
  transcript: TranscriptLine[];
  compliance: {
    identityVerifiedBeforeDisclosure: boolean;
    withinCallingHours: boolean;
    noUnapprovedOffers: boolean;
  };
}

export interface PromiseToPay {
  id: string;
  loanId: string;
  customerName: string;
  promisedDate: string;
  promisedAmount: number;
  sourceCallId: string;
  state: PromiseState;
  paidAt: string | null;
  createdAt: string;
  phone: string;
  lastMessageStatus: OutboundStatus | null;
}

export interface Escalation {
  id: string;
  callId: string;
  loanId: string;
  customerName: string;
  phone: string;
  reason: EscalationReasonCode;
  queueStatus: QueueStatus;
  waitingMinutes: number;
  assignedOfficer: string | null;
  alertDelivered: boolean;
  sensitive: boolean;
  notes: string;
  createdAt: string;
}

export interface AuditEntry {
  id: number;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface FlaggedCall {
  callId: string;
  customerName: string;
  time: string;
  rule: string;
  severity: 'low' | 'medium' | 'high';
  startedAt: string;
}

export interface Kpis {
  callsToday: number;
  connectRate: number;
  ptpCaptured: number;
  ptpAmount: number;
  openEscalations: number;
  avgCallLengthSec: number;
}

export interface HourPoint {
  hour: string;
  today: number;
  yesterday: number;
}

export interface OutcomeSlice {
  label: string;
  value: number;
  color: string;
}

export interface ComplianceMetrics {
  adherenceRate: number;
  callsBlockedOutsideHours: number;
  idvFailureRate: number;
  distressFlags: number;
  grievanceMentions: number;
}

export interface AppSettings {
  callingStart: string;
  callingEnd: string;
  maxPtpDays: number;
  approvedOptions: string[];
  humanQueuePhone: string;
  alertWebhookUrl: string;
}

export interface TelephonyProvider {
  name: string;
  role: string;
  connected: boolean;
  lastHeartbeat: string | null;
}

export interface OutboundMessage {
  id: number;
  loanId: string;
  channel: 'sms';
  template: string;
  scheduledFor: string | null;
  status: OutboundStatus;
  createdAt: string;
}

export interface CallbackRequest {
  id: number;
  loanId: string;
  scheduledFor: string;
  status: 'queued' | 'done' | 'cancelled';
  createdAt: string;
}
