-- ---------------------------------------------------------------------------
-- Public (signed-out) read access for the dashboard.
--
-- The dashboard is viewable without signing in. Anonymous visitors may only
-- READ operational data; every write (escalation updates, settings, queued
-- SMS/callbacks, CSV export audit rows) still requires a signed-in
-- manager/officer with the policies from the earlier migrations.
--
-- This is intended for public demos. For a production deployment that must not
-- expose borrower data, drop these policies again:
--
--   drop policy if exists "<table>_public_read" on <table>;
--   revoke select on <table> from anon;
--
-- No table containing account data (profiles) or internal-only rows is exposed.
-- ---------------------------------------------------------------------------

GRANT SELECT ON loans, calls, call_turns, escalations, promises_to_pay TO anon;
GRANT SELECT ON outbound_messages, callback_requests, app_settings, telephony_providers, audit_log TO anon;
GRANT SELECT ON daily_kpis, hourly_promises, flagged_calls, compliance_metrics TO anon;

DROP POLICY IF EXISTS "loans_public_read" ON loans;
CREATE POLICY "loans_public_read" ON loans FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "calls_public_read" ON calls;
CREATE POLICY "calls_public_read" ON calls FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "call_turns_public_read" ON call_turns;
CREATE POLICY "call_turns_public_read" ON call_turns FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "escalations_public_read" ON escalations;
CREATE POLICY "escalations_public_read" ON escalations FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "promises_public_read" ON promises_to_pay;
CREATE POLICY "promises_public_read" ON promises_to_pay FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "outbound_messages_public_read" ON outbound_messages;
CREATE POLICY "outbound_messages_public_read" ON outbound_messages FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "callback_requests_public_read" ON callback_requests;
CREATE POLICY "callback_requests_public_read" ON callback_requests FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "app_settings_public_read" ON app_settings;
CREATE POLICY "app_settings_public_read" ON app_settings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "telephony_public_read" ON telephony_providers;
CREATE POLICY "telephony_public_read" ON telephony_providers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "audit_log_public_read" ON audit_log;
CREATE POLICY "audit_log_public_read" ON audit_log FOR SELECT TO anon USING (true);
