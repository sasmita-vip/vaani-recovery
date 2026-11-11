import { useState } from 'react';
import {
  Clock,
  CalendarDays,
  CheckSquare,
  Phone,
  Webhook,
  PhoneCall,
  CheckCircle2,
  Save,
  AlertCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, Button, PageHeader, Chip, Skeleton, EmptyState, ErrorState } from '@/components/ui';
import { fetchSettings, fetchTelephony, updateSettings } from '@/lib/api';
import { useLiveData } from '@/lib/live';
import { usePermissions } from '@/lib/auth';
import { callingWindowStatus, formatClock, validateCallingWindow } from '@/lib/callingWindow';
import { formatDateTime } from '@/lib/format';
import type { AppSettings } from '@/types';

const ALL_OPTIONS = ['Payment link by SMS', 'Mobile app payment', 'Branch visit', 'UPI collect request'];

interface FieldErrors {
  callingStart?: string;
  callingEnd?: string;
  maxPtpDays?: string;
  humanQueuePhone?: string;
  alertWebhookUrl?: string;
}

function validate(form: AppSettings): FieldErrors {
  const errors: FieldErrors = { ...validateCallingWindow(form.callingStart, form.callingEnd) };

  const days = Number(form.maxPtpDays);
  if (!Number.isInteger(days) || days < 1 || days > 14) {
    errors.maxPtpDays = 'Enter a whole number of days between 1 and 14.';
  }

  const phoneDigits = form.humanQueuePhone.replace(/\D/g, '');
  if (!/^91\d{10}$/.test(phoneDigits)) {
    errors.humanQueuePhone = 'Use an Indian number with +91 and 10 digits.';
  }

  if (!/^https:\/\/\S+$/i.test(form.alertWebhookUrl.trim())) {
    errors.alertWebhookUrl = 'Use an https:// webhook URL.';
  }

  return errors;
}

function Toggle({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
      <span className="text-sm text-content">{label}</span>
      <span className="relative ml-auto">
        <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="block h-6 w-11 rounded-full bg-surface-3 transition-colors peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500/30" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  prefix,
  error,
  disabled,
  hint,
  min,
  max,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  prefix?: ReactNode;
  error?: string;
  disabled?: boolean;
  hint?: string;
  min?: number;
  max?: number;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
        <input
          id={id}
          type={type}
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border bg-surface-2 py-2 ${prefix ? 'pl-9' : 'pl-3'} pr-3 text-sm text-content focus:outline-none focus:ring-2 disabled:opacity-70 ${
            error
              ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/20 dark:border-rose-500/40'
              : 'border-line focus:border-indigo-400 focus:ring-indigo-500/20'
          }`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function SettingsForm({ initial }: { initial: AppSettings }) {
  const { canEditSettings } = usePermissions();
  const [form, setForm] = useState<AppSettings>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState<AppSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [touched, setTouched] = useState(false);
  const telephony = useLiveData(fetchTelephony, []);

  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(savedSnapshot);
  const windowStatus = callingWindowStatus(form.callingStart, form.callingEnd);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const toggleOption = (option: string, on: boolean) => {
    update('approvedOptions', on ? [...form.approvedOptions, option] : form.approvedOptions.filter((o) => o !== option));
  };

  const save = async () => {
    setTouched(true);
    if (hasErrors) {
      setMessage({ tone: 'error', text: 'Fix the highlighted fields before saving.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = { ...form, maxPtpDays: Number(form.maxPtpDays) };
      await updateSettings(payload);
      setSavedSnapshot(payload);
      setForm(payload);
      setMessage({ tone: 'ok', text: 'Settings saved.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Settings could not be saved.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Operational configuration for the Vaani agent"
        action={
          canEditSettings ? (
            <Button size="sm" disabled={!dirty || saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          ) : undefined
        }
      />

      {!canEditSettings && (
        <p className="rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-sm text-muted">
          Read-only. Only a manager can change these settings.
        </p>
      )}

      {message && (
        <div
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            message.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-content-strong">Calling hours</h3>
          </div>
          <p className="mb-4 text-xs text-muted">Hours during which the Vaani agent may place outbound calls (IST)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Start time"
              type="time"
              value={form.callingStart}
              disabled={!canEditSettings}
              error={touched ? errors.callingStart : undefined}
              onChange={(v) => update('callingStart', v)}
            />
            <Field
              label="End time"
              type="time"
              value={form.callingEnd}
              disabled={!canEditSettings}
              error={touched ? errors.callingEnd : undefined}
              onChange={(v) => update('callingEnd', v)}
            />
          </div>
          <p className="mt-2 text-xs text-muted">Allowed window: {formatClock('08:00')} to {formatClock('19:00')} IST.</p>
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-xs ${
              windowStatus.open
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-line bg-surface-2 text-muted'
            }`}
          >
            {windowStatus.label}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-content-strong">Promise to pay</h3>
          </div>
          <div className="space-y-4">
            <Field
              label="Maximum days allowed for a promise"
              type="number"
              min={1}
              max={14}
              value={form.maxPtpDays}
              disabled={!canEditSettings}
              error={touched ? errors.maxPtpDays : undefined}
              hint="Between 1 and 14 days."
              onChange={(v) => update('maxPtpDays', Number(v))}
            />
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-3 text-xs font-medium text-muted">Approved payment options</div>
              <div className="space-y-2.5">
                {ALL_OPTIONS.map((option) => (
                  <Toggle
                    key={option}
                    label={option}
                    disabled={!canEditSettings}
                    on={form.approvedOptions.includes(option)}
                    onChange={(on) => toggleOption(option, on)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Phone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-content-strong">Human handoff &amp; alerts</h3>
          </div>
          <div className="space-y-4">
            <Field
              label="Human queue phone number"
              value={form.humanQueuePhone}
              prefix={<PhoneCall className="h-4 w-4" />}
              disabled={!canEditSettings}
              error={touched ? errors.humanQueuePhone : undefined}
              hint="Indian number, for example +91 98765 43210."
              onChange={(v) => update('humanQueuePhone', v)}
            />
            <Field
              label="Alert webhook URL"
              value={form.alertWebhookUrl}
              prefix={<Webhook className="h-4 w-4" />}
              disabled={!canEditSettings}
              error={touched ? errors.alertWebhookUrl : undefined}
              hint="Must start with https://"
              onChange={(v) => update('alertWebhookUrl', v)}
            />
            <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 p-3 text-xs">
              <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-content">Manager alerts are delivered via webhook for sensitive escalations</span>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-semibold text-content-strong">Telephony providers</h3>
          </div>
          {telephony.loading && !telephony.data ? (
            <div className="space-y-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : telephony.error ? (
            <EmptyState icon={<AlertCircle className="h-6 w-6" />} title="Providers unavailable" description={telephony.error} />
          ) : (telephony.data ?? []).length === 0 ? (
            <EmptyState icon={<PhoneCall className="h-6 w-6" />} title="No providers added" description="Connected calling providers will be listed here." />
          ) : (
            <div className="space-y-3">
              {(telephony.data ?? []).map((p) => (
                <div key={p.name} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2 p-3">
                  <div>
                    <div className="text-sm font-medium text-content-strong">{p.name}</div>
                    <div className="text-xs text-muted">{p.role}</div>
                    <div className="tabular mt-0.5 text-[11px] text-muted">
                      Last heartbeat: {p.lastHeartbeat ? formatDateTime(p.lastHeartbeat) : 'never'}
                    </div>
                  </div>
                  {p.connected ? <Chip color="success" dot>Connected</Chip> : <Chip color="neutral" dot>Not connected</Chip>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content-strong">Fair-practice compliance</h3>
            <p className="mt-1 text-sm text-muted">
              Calls stay inside the configured calling window, identity is verified before any loan detail is disclosed, and
              customers in distress or bereavement are routed to a human officer with priority.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function SettingsScreen() {
  const state = useLiveData(fetchSettings, []);

  if (state.loading && !state.data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }
  if (state.error || !state.data) {
    return (
      <Card>
        <ErrorState title="Couldn't load settings" message={state.error ?? 'Settings are not available right now.'} onRetry={state.reload} />
      </Card>
    );
  }
  return <SettingsForm key={JSON.stringify(state.data)} initial={state.data} />;
}
