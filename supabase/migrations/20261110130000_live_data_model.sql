/*
# Live data model: backend-written tables, call turns, audit log and live views

Plain-English summary:
- Call start times become real timestamps (Asia/Kolkata), so timers and
  "today" reports can be calculated instead of stored.
- Stored waiting time / days past due are removed; they are calculated.
- A new `call_turns` table holds one row per spoken line, written by the voice
  backend. Call Detail and Live Calls read it.
- The voice backend writes calls, call_turns, promises to pay and escalations
  with the service role, so dashboard users get no insert rights on those.
  Their extra columns (provider, reason codes, delivery flag) are added here.
- Dashboard actions are queued in `outbound_messages` and `callback_requests`.
  Callbacks outside calling hours are rejected by the database.
- Every escalation/settings change and every queued message or callback is
  written to `audit_log`.
- Seeded summary tables are replaced by views computed from live rows.
- The demo rows from the first migration are removed; development data now
  lives in supabase/seed.sql.
*/

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ist_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date;
$$;

-- ---------------------------------------------------------------------------
-- 1. Time columns
-- ---------------------------------------------------------------------------

-- calls.started_at: text ("11:42 AM") -> timestamptz
ALTER TABLE calls ADD COLUMN IF NOT EXISTS started_at_ts timestamptz;

UPDATE calls
SET started_at_ts = ((now() AT TIME ZONE 'Asia/Kolkata')::date + started_at::time) AT TIME ZONE 'Asia/Kolkata'
WHERE started_at_ts IS NULL AND started_at IS NOT NULL;

ALTER TABLE calls ALTER COLUMN started_at_ts SET NOT NULL;
ALTER TABLE calls DROP COLUMN IF EXISTS started_at;
ALTER TABLE calls RENAME COLUMN started_at_ts TO started_at;

ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS provider_status text;

ALTER TABLE telephony_providers ADD COLUMN IF NOT EXISTS last_heartbeat timestamptz;

CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);

-- Created-at columns so dates can drive the live numbers.
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE escalations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE escalations
SET created_at = now() - make_interval(mins => COALESCE(waiting_minutes, 0))
WHERE waiting_minutes IS NOT NULL;

ALTER TABLE escalations DROP COLUMN IF EXISTS waiting_minutes;

ALTER TABLE promises_to_pay ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE promises_to_pay ADD COLUMN IF NOT EXISTS paid_at timestamptz;

UPDATE promises_to_pay
SET created_at = (promised_date::timestamp + time '10:00') AT TIME ZONE 'Asia/Kolkata'
WHERE created_at > now() - interval '1 minute';

UPDATE promises_to_pay SET paid_at = created_at WHERE state = 'Paid' AND paid_at IS NULL;

ALTER TABLE promises_to_pay DROP COLUMN IF EXISTS state;

ALTER TABLE loans ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE loans DROP COLUMN IF EXISTS days_past_due;

CREATE INDEX IF NOT EXISTS escalations_created_at_idx ON escalations (created_at DESC);
CREATE INDEX IF NOT EXISTS promises_date_idx ON promises_to_pay (promised_date);

-- ---------------------------------------------------------------------------
-- 2. Call turns (one row per spoken line, written by the voice backend)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_turns (
  id bigserial PRIMARY KEY,
  call_id text NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
  seq int NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('customer', 'agent')),
  text text NOT NULL,
  language text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id, seq)
);

CREATE INDEX IF NOT EXISTS call_turns_call_id_idx ON call_turns (call_id, seq);

-- Carry any transcript JSON from the first migration into call_turns.
INSERT INTO call_turns (call_id, seq, speaker, text, language, created_at)
SELECT
  c.call_id,
  t.ord,
  CASE WHEN t.line->>'speaker' IN ('agent', 'customer') THEN t.line->>'speaker' ELSE 'agent' END,
  COALESCE(t.line->>'text', ''),
  c.language,
  c.started_at + make_interval(secs => t.ord * 20)
FROM calls c
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(c.transcript) = 'array' THEN c.transcript ELSE '[]'::jsonb END
) WITH ORDINALITY AS t(line, ord)
ON CONFLICT (call_id, seq) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Escalation reason codes + backend columns
-- ---------------------------------------------------------------------------

UPDATE escalations SET reason = CASE reason
  WHEN 'Customer asked for human' THEN 'customer_requested_human'
  WHEN 'Dispute' THEN 'dispute'
  WHEN 'Hardship or medical' THEN 'hardship_medical'
  WHEN 'Bereavement' THEN 'bereavement'
  WHEN 'Complaint' THEN 'complaint'
  WHEN 'Technical failure' THEN 'technical_failure'
  ELSE reason
END;

ALTER TABLE escalations DROP CONSTRAINT IF EXISTS escalations_reason_check;
ALTER TABLE escalations ADD CONSTRAINT escalations_reason_check CHECK (reason IN (
  'customer_requested_human',
  'dispute',
  'hardship_medical',
  'hardship_income',
  'bereavement',
  'complaint',
  'negotiation_request',
  'technical_failure',
  'supervisor_transfer'
));

ALTER TABLE escalations DROP CONSTRAINT IF EXISTS escalations_queue_status_check;
ALTER TABLE escalations ADD CONSTRAINT escalations_queue_status_check
  CHECK (queue_status IN ('Open', 'Assigned', 'Resolved'));

ALTER TABLE escalations ADD COLUMN IF NOT EXISTS alert_delivered boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 4. Dashboard write model: queued messages and callbacks
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS outbound_messages (
  id bigserial PRIMARY KEY,
  loan_id text NOT NULL REFERENCES loans(loan_id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('sms')),
  template text NOT NULL,
  scheduled_for timestamptz,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outbound_messages_loan_idx ON outbound_messages (loan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS callback_requests (
  id bigserial PRIMARY KEY,
  loan_id text NOT NULL REFERENCES loans(loan_id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'done', 'cancelled')),
  requested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS callback_requests_loan_idx ON callback_requests (loan_id, created_at DESC);

-- Callbacks must fall inside the configured calling hours (Asia/Kolkata).
CREATE OR REPLACE FUNCTION public.enforce_callback_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s app_settings%ROWTYPE;
  local_time time;
BEGIN
  SELECT * INTO s FROM app_settings WHERE id = 1;
  IF s.id IS NULL THEN
    RETURN NEW;
  END IF;

  local_time := (NEW.scheduled_for AT TIME ZONE 'Asia/Kolkata')::time;

  IF local_time < s.calling_start::time OR local_time >= s.calling_end::time THEN
    RAISE EXCEPTION
      'Callback at % IST is outside calling hours (%-% IST)',
      to_char(local_time, 'HH24:MI'), s.calling_start, s.calling_end
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS callback_requests_window ON callback_requests;
CREATE TRIGGER callback_requests_window
  BEFORE INSERT OR UPDATE OF scheduled_for ON callback_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_callback_window();

ALTER TABLE outbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON outbound_messages TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE outbound_messages_id_seq TO authenticated;
GRANT SELECT, INSERT ON callback_requests TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE callback_requests_id_seq TO authenticated;

DROP POLICY IF EXISTS "outbound_messages_read" ON outbound_messages;
CREATE POLICY "outbound_messages_read" ON outbound_messages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "outbound_messages_insert" ON outbound_messages;
CREATE POLICY "outbound_messages_insert" ON outbound_messages
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "callback_requests_read" ON callback_requests;
CREATE POLICY "callback_requests_read" ON callback_requests FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "callback_requests_insert" ON callback_requests;
CREATE POLICY "callback_requests_insert" ON callback_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- The backend (service role) processes the queues; dashboard users may not edit them.
REVOKE UPDATE, DELETE ON outbound_messages, callback_requests FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity, entity_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON audit_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO authenticated;

DROP POLICY IF EXISTS "audit_log_read" ON audit_log;
CREATE POLICY "audit_log_read" ON audit_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "audit_log_insert" ON audit_log;
CREATE POLICY "audit_log_insert" ON audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid());

REVOKE UPDATE, DELETE ON audit_log FROM authenticated;

CREATE OR REPLACE FUNCTION public.audit_escalation_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (auth.uid(), 'escalation.updated', 'escalations', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escalations_audit ON escalations;
CREATE TRIGGER escalations_audit
  BEFORE UPDATE ON escalations
  FOR EACH ROW EXECUTE FUNCTION public.audit_escalation_change();

CREATE OR REPLACE FUNCTION public.audit_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (auth.uid(), 'settings.updated', 'app_settings', NEW.id::text, to_jsonb(OLD), to_jsonb(NEW));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_settings_audit ON app_settings;
CREATE TRIGGER app_settings_audit
  AFTER UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_settings_change();

CREATE OR REPLACE FUNCTION public.audit_queued_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (
    COALESCE(auth.uid(), NULLIF(to_jsonb(NEW)->>'created_by', '')::uuid),
    TG_ARGV[0],
    TG_TABLE_NAME,
    NEW.id::text,
    NULL,
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outbound_messages_audit ON outbound_messages;
CREATE TRIGGER outbound_messages_audit
  AFTER INSERT ON outbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.audit_queued_row('message.queued');

DROP TRIGGER IF EXISTS callback_requests_audit ON callback_requests;
CREATE TRIGGER callback_requests_audit
  AFTER INSERT ON callback_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_queued_row('callback.queued');

-- ---------------------------------------------------------------------------
-- 6. Dashboard users cannot insert backend-written tables
-- ---------------------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE ON calls, call_turns, promises_to_pay, loans FROM authenticated;
REVOKE ALL ON calls, call_turns, promises_to_pay, loans FROM anon;

GRANT SELECT ON calls, call_turns, promises_to_pay, loans TO authenticated;

DROP POLICY IF EXISTS "call_turns_read" ON call_turns;
ALTER TABLE call_turns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_turns_read" ON call_turns FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 7. Live views replace the seeded summary tables
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS flagged_calls CASCADE;
DROP TABLE IF EXISTS hourly_promises CASCADE;
DROP TABLE IF EXISTS daily_kpis CASCADE;

CREATE OR REPLACE VIEW daily_kpis AS
WITH todays_calls AS (
  SELECT * FROM calls
  WHERE (started_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()
), todays_promises AS (
  SELECT * FROM promises_to_pay
  WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()
), totals AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE status <> 'Failed') AS connected,
    count(*) FILTER (WHERE status = 'PTP Promised') AS ptp,
    count(*) FILTER (WHERE status = 'Escalated / Disputed') AS escalated,
    count(*) FILTER (WHERE status = 'Completed') AS completed,
    count(*) FILTER (WHERE status = 'Failed') AS failed,
    avg(duration_sec) AS avg_duration
  FROM todays_calls
)
SELECT
  t.total AS calls_today,
  CASE WHEN t.total > 0 THEN round(t.connected::numeric / t.total, 4) ELSE 0 END AS connect_rate,
  (SELECT count(*) FROM todays_promises) AS ptp_captured,
  COALESCE((SELECT sum(promised_amount) FROM todays_promises), 0)::bigint AS ptp_amount,
  COALESCE(round(t.avg_duration)::int, 0) AS avg_call_length_sec,
  (SELECT count(*) FROM escalations WHERE queue_status <> 'Resolved') AS open_escalations,
  jsonb_build_array(
    jsonb_build_object('label', 'PTP Promised', 'value', t.ptp, 'color', '#16a34a'),
    jsonb_build_object('label', 'Escalated', 'value', t.escalated, 'color', '#dc2626'),
    jsonb_build_object('label', 'Completed without promise', 'value', t.completed, 'color', '#4f46e5'),
    jsonb_build_object('label', 'Failed', 'value', t.failed, 'color', '#94a3b8')
  ) AS outcomes
FROM totals t;

CREATE OR REPLACE VIEW hourly_promises AS
WITH hours AS (
  SELECT generate_series(8, 18) AS h
)
SELECT
  to_char(date_trunc('day', now()) + make_interval(hours => h.h), 'FMHH12 AM') AS hour_label,
  h.h AS sort_order,
  (SELECT count(*) FROM promises_to_pay p
   WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()
     AND extract(hour FROM (p.created_at AT TIME ZONE 'Asia/Kolkata')) = h.h) AS today,
  (SELECT count(*) FROM promises_to_pay p
   WHERE (p.created_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today() - 1
     AND extract(hour FROM (p.created_at AT TIME ZONE 'Asia/Kolkata')) = h.h) AS yesterday
FROM hours h
ORDER BY h.h;

CREATE OR REPLACE VIEW flagged_calls AS
WITH flags AS (
  SELECT call_id, customer_name, started_at,
         'Call placed outside permitted hours'::text AS rule, 'high'::text AS severity
  FROM calls WHERE NOT within_calling_hours
  UNION ALL
  SELECT call_id, customer_name, started_at,
         'Identity not verified before disclosure', 'high'
  FROM calls WHERE NOT identity_verified AND status <> 'Failed'
  UNION ALL
  SELECT call_id, customer_name, started_at,
         'Unapproved settlement offer mentioned', 'medium'
  FROM calls WHERE NOT no_unapproved_offers
  UNION ALL
  SELECT e.call_id, e.customer_name, e.created_at,
         'Distress language detected', 'medium'
  FROM escalations e WHERE e.reason IN ('hardship_medical', 'bereavement')
)
SELECT
  call_id,
  customer_name,
  to_char(started_at AT TIME ZONE 'Asia/Kolkata', 'HH12:MI AM') AS time_label,
  rule,
  severity,
  started_at
FROM flags
ORDER BY started_at DESC;

CREATE OR REPLACE VIEW compliance_metrics AS
WITH todays_calls AS (
  SELECT * FROM calls
  WHERE (started_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()
)
SELECT
  CASE WHEN count(*) > 0
    THEN round((count(*) FILTER (WHERE within_calling_hours))::numeric / count(*), 4)
    ELSE 0 END AS adherence_rate,
  count(*) FILTER (WHERE NOT within_calling_hours) AS calls_blocked_outside_hours,
  CASE WHEN count(*) > 0
    THEN round((count(*) FILTER (WHERE NOT identity_verified))::numeric / count(*), 4)
    ELSE 0 END AS idv_failure_rate,
  (SELECT count(*) FROM escalations
   WHERE reason IN ('hardship_medical', 'bereavement')
     AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()) AS distress_flags,
  (SELECT count(*) FROM call_turns
   WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = public.ist_today()
     AND (text ILIKE '%helpline%' OR text ILIKE '%grievance%')) AS grievance_mentions
FROM todays_calls;

GRANT SELECT ON daily_kpis, hourly_promises, flagged_calls, compliance_metrics TO authenticated;
REVOKE ALL ON daily_kpis, hourly_promises, flagged_calls, compliance_metrics FROM anon;

-- ---------------------------------------------------------------------------
-- 8. Realtime: the dashboard listens to these tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['calls', 'call_turns', 'escalations', 'promises_to_pay', 'outbound_messages']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Remove demo rows from the first migration (development data lives in
--    supabase/seed.sql)
-- ---------------------------------------------------------------------------

DELETE FROM escalations WHERE loan_id IN (
  'LN-00482917','LN-00482920','LN-00482935','LN-00482941',
  'LN-00482948','LN-00482955','LN-00482960','LN-00482972'
);
DELETE FROM promises_to_pay WHERE loan_id IN (
  'LN-00482917','LN-00482920','LN-00482935','LN-00482941',
  'LN-00482948','LN-00482955','LN-00482960','LN-00482972'
);
DELETE FROM calls WHERE loan_id IN (
  'LN-00482917','LN-00482920','LN-00482935','LN-00482941',
  'LN-00482948','LN-00482955','LN-00482960','LN-00482972'
);
DELETE FROM loans WHERE loan_id IN (
  'LN-00482917','LN-00482920','LN-00482935','LN-00482941',
  'LN-00482948','LN-00482955','LN-00482960','LN-00482972'
);
DELETE FROM telephony_providers WHERE name IN ('Twilio', 'Exotel', 'Knowlarity');
