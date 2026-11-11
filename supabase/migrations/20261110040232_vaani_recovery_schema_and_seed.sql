/*
# Vaani Recovery: core tables, policies and sample data

Plain-English summary: creates the tables behind the collections dashboard (loans, calls, promises to pay, escalations, compliance flags, daily KPIs, and settings) and loads the sample Indian borrower data the screens display.

## New tables
1. `loans`: overdue loans with loan ID, customer, lender, type, amount in rupees, due date, days past due, status, phone.
2. `calls`: AI agent calls with status, language, conversation stage, detected intent, compliance checks, and the full transcript stored as JSON.
3. `promises_to_pay`: promised payments with date, amount, source call and state.
4. `escalations`: calls handed to human officers, with reason, queue status, waiting minutes, assigned officer, alert delivery, sensitivity flag, officer notes and a timeline stored as JSON.
5. `flagged_calls`: calls where a compliance rule was triggered.
6. `hourly_promises`: promises captured per hour, today and yesterday.
7. `daily_kpis`: single-row summary of today's headline numbers, outcome breakdown and compliance metrics.
8. `app_settings`: single-row operational settings (calling hours, promise limits, approved options, human queue number, alert webhook).
9. `telephony_providers`: status of connected voice providers.

## Security
- Row level security is enabled on every table.
- The app has no sign-in screen, so policies target `anon` and `authenticated`.
- Read access is granted on all tables.
- Clients may update only: escalation queue status, assigned officer and notes; and the settings row.
- No client may insert or delete rows.

## Notes
1. Sample data is idempotent: rows are inserted with `ON CONFLICT DO NOTHING`.
2. Money is stored in whole rupees (bigint).
*/

CREATE TABLE IF NOT EXISTS loans (
  loan_id text PRIMARY KEY,
  customer_id text NOT NULL,
  customer_name text NOT NULL,
  lender_name text NOT NULL,
  loan_type text NOT NULL,
  overdue_amount bigint NOT NULL,
  due_date date NOT NULL,
  days_past_due integer NOT NULL,
  status text NOT NULL,
  phone text NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  call_id text PRIMARY KEY,
  loan_id text NOT NULL REFERENCES loans(loan_id),
  customer_name text NOT NULL,
  loan_type text NOT NULL,
  overdue_amount bigint NOT NULL,
  started_at text NOT NULL,
  duration_sec integer NOT NULL,
  status text NOT NULL,
  language text NOT NULL,
  stage text NOT NULL,
  agent_intent text,
  identity_verified boolean NOT NULL DEFAULT false,
  within_calling_hours boolean NOT NULL DEFAULT true,
  no_unapproved_offers boolean NOT NULL DEFAULT true,
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS calls_loan_id_idx ON calls(loan_id);
CREATE INDEX IF NOT EXISTS calls_status_idx ON calls(status);

CREATE TABLE IF NOT EXISTS promises_to_pay (
  id text PRIMARY KEY,
  loan_id text NOT NULL REFERENCES loans(loan_id),
  customer_name text NOT NULL,
  promised_date date NOT NULL,
  promised_amount bigint NOT NULL,
  source_call_id text NOT NULL,
  state text NOT NULL
);
CREATE INDEX IF NOT EXISTS promises_state_idx ON promises_to_pay(state);

CREATE TABLE IF NOT EXISTS escalations (
  id text PRIMARY KEY,
  call_id text NOT NULL,
  loan_id text NOT NULL REFERENCES loans(loan_id),
  customer_name text NOT NULL,
  reason text NOT NULL,
  queue_status text NOT NULL,
  waiting_minutes integer NOT NULL DEFAULT 0,
  assigned_officer text,
  alert_delivered boolean NOT NULL DEFAULT false,
  sensitive boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS flagged_calls (
  call_id text PRIMARY KEY,
  customer_name text NOT NULL,
  time_label text NOT NULL,
  rule text NOT NULL,
  severity text NOT NULL
);

CREATE TABLE IF NOT EXISTS hourly_promises (
  hour_label text PRIMARY KEY,
  sort_order integer NOT NULL,
  today integer NOT NULL,
  yesterday integer NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_kpis (
  id integer PRIMARY KEY CHECK (id = 1),
  calls_today integer NOT NULL,
  connect_rate numeric NOT NULL,
  ptp_captured integer NOT NULL,
  ptp_amount bigint NOT NULL,
  avg_call_length_sec integer NOT NULL,
  outcomes jsonb NOT NULL,
  compliance jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  calling_start text NOT NULL DEFAULT '08:00',
  calling_end text NOT NULL DEFAULT '19:00',
  max_ptp_days integer NOT NULL DEFAULT 15,
  approved_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  human_queue_phone text NOT NULL DEFAULT '',
  alert_webhook_url text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS telephony_providers (
  name text PRIMARY KEY,
  role text NOT NULL,
  connected boolean NOT NULL DEFAULT false
);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE promises_to_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flagged_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_promises ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE telephony_providers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON loans, calls, promises_to_pay, flagged_calls, hourly_promises, daily_kpis, telephony_providers TO anon, authenticated;
GRANT SELECT, UPDATE ON app_settings TO anon, authenticated;
GRANT SELECT ON escalations TO anon, authenticated;
GRANT UPDATE (queue_status, assigned_officer, notes) ON escalations TO anon, authenticated;

DROP POLICY IF EXISTS "read_loans" ON loans;
CREATE POLICY "read_loans" ON loans FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_calls" ON calls;
CREATE POLICY "read_calls" ON calls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_promises" ON promises_to_pay;
CREATE POLICY "read_promises" ON promises_to_pay FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_escalations" ON escalations;
CREATE POLICY "read_escalations" ON escalations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "update_escalations" ON escalations;
CREATE POLICY "update_escalations" ON escalations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "read_flagged" ON flagged_calls;
CREATE POLICY "read_flagged" ON flagged_calls FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_hourly" ON hourly_promises;
CREATE POLICY "read_hourly" ON hourly_promises FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_kpis" ON daily_kpis;
CREATE POLICY "read_kpis" ON daily_kpis FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "read_settings" ON app_settings;
CREATE POLICY "read_settings" ON app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "update_settings" ON app_settings;
CREATE POLICY "update_settings" ON app_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "read_telephony" ON telephony_providers;
CREATE POLICY "read_telephony" ON telephony_providers FOR SELECT TO anon, authenticated USING (true);

INSERT INTO loans (loan_id, customer_id, customer_name, lender_name, loan_type, overdue_amount, due_date, days_past_due, status, phone) VALUES
('LN-00482917','CUST1001','Rohan Mehta','Sterling Credit NBFC','Personal loan',4500,'2026-10-12',29,'Overdue','+91 98201 44710'),
('LN-00482920','CUST1002','Anjali Sharma','Sterling Credit NBFC','Two-wheeler loan',125000,'2026-09-28',43,'Escalated / Disputed','+91 99720 11830'),
('LN-00482935','CUST1003','Karthik Reddy','Sterling Credit NBFC','Business loan',84500,'2026-10-20',21,'PTP Promised','+91 90100 55221'),
('LN-00482941','CUST1004','Priya Nair','Sterling Credit NBFC','Personal loan',7200,'2026-10-25',16,'Overdue','+91 98460 33902'),
('LN-00482948','CUST1005','Imran Khan','Sterling Credit NBFC','Two-wheeler loan',3200,'2026-11-01',9,'Overdue','+91 97000 22814'),
('LN-00482955','CUST1006','Lakshmi Iyer','Sterling Credit NBFC','Business loan',210000,'2026-09-15',56,'Escalated / Disputed','+91 95000 88120'),
('LN-00482960','CUST1007','Sandeep Yadav','Sterling Credit NBFC','Personal loan',15800,'2026-10-30',11,'PTP Promised','+91 96400 11755'),
('LN-00482972','CUST1008','Meera Joshi','Sterling Credit NBFC','Two-wheeler loan',5400,'2026-10-18',23,'Paid','+91 98900 44120')
ON CONFLICT (loan_id) DO NOTHING;

INSERT INTO calls (call_id, loan_id, customer_name, loan_type, overdue_amount, started_at, duration_sec, status, language, stage, agent_intent, identity_verified, within_calling_hours, no_unapproved_offers, transcript) VALUES
('CALL-90021','LN-00482917','Rohan Mehta','Personal loan',4500,'11:42 AM',187,'In Progress','Hinglish','Negotiation','Offer partial payment before due date',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani bol rahi hoon, Sterling Credit ki taraf se. Kya main Rohan Mehta se baat kar rahi hoon?","time":"11:42 AM"},{"id":"2","speaker":"customer","text":"Haan, main Rohan bol raha hoon.","time":"11:42 AM"},{"id":"3","speaker":"agent","text":"Dhanyavaad. Ye call aapke LN-00482917 loan ke ₹4,500 ke overdue amount ke baare mein hai. Kya aap iske baare mein discuss kar sakte hain?","time":"11:43 AM","intent":"Identity verified"},{"id":"4","speaker":"customer","text":"Dekho, is month thoda tight hai. Salary 5th ko aayegi.","time":"11:44 AM"},{"id":"5","speaker":"agent","text":"Samajh gaya. Kya aap 5th ko ₹4,500 ka payment kar sakte hain? Main ek payment link SMS pe bhej sakta hoon.","time":"11:45 AM","intent":"Proposing PTP"},{"id":"6","speaker":"customer","text":"Haan 5th tak arrange kar lunga. Link bhej do.","time":"11:45 AM"}]$j$::jsonb),
('CALL-90022','LN-00482941','Priya Nair','Personal loan',7200,'11:50 AM',96,'In Progress','Tamil','Payment demand','Confirm identity and state overdue',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Vanakkam, Naan Vaani, Sterling Credit lenthu. Priya Nair idamda pechu vechu irukira?","time":"11:50 AM"},{"id":"2","speaker":"customer","text":"Aam, naan Priya.","time":"11:50 AM"},{"id":"3","speaker":"agent","text":"Ungal LN-00482941 loan-ku ₹7,200 overdue irukku. 16 naatkal aagi viduthu.","time":"11:52 AM","intent":"Demand stated"}]$j$::jsonb),
('CALL-90023','LN-00482948','Imran Khan','Two-wheeler loan',3200,'11:55 AM',42,'In Progress','Hindi','Identity verification','Verify identity before disclosing',false,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon, Sterling Credit ki taraf se. Kya main Imran Khan se baat kar sakti hoon?","time":"11:55 AM"},{"id":"2","speaker":"customer","text":"Haan boliye.","time":"11:55 AM"}]$j$::jsonb),
('CALL-90024','LN-00482960','Sandeep Yadav','Personal loan',15800,'11:58 AM',18,'In Progress','Hinglish','Identity verification','Verify identity',false,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon, Sterling Credit ki taraf se. Sandeep Yadav se baat ho sakti hai?","time":"11:58 AM"}]$j$::jsonb),
('CALL-90005','LN-00482920','Anjali Sharma','Two-wheeler loan',125000,'10:18 AM',412,'Escalated / Disputed','Hindi','Negotiation','Customer disputed charges',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon, Sterling Credit ki taraf se. Anjali Sharma se baat ho sakti hai?","time":"10:18 AM"},{"id":"2","speaker":"customer","text":"Haan boliye.","time":"10:18 AM"},{"id":"3","speaker":"agent","text":"Aapke LN-00482920 loan ka ₹1,25,000 overdue hai. 43 din ho gaye.","time":"10:19 AM","intent":"Demand stated"},{"id":"4","speaker":"customer","text":"Ye amount galat hai. Maine 2 instalment already pay kiye the.","time":"10:21 AM"},{"id":"5","speaker":"agent","text":"Main check kar leti hoon. Aapko human officer se baat karna chahiye?","time":"10:22 AM","intent":"Escalation triggered"},{"id":"6","speaker":"customer","text":"Haan, please kisi officer ko connect karo.","time":"10:22 AM"}]$j$::jsonb),
('CALL-90008','LN-00482935','Karthik Reddy','Business loan',84500,'10:42 AM',318,'PTP Promised','Telugu','Promise to pay','Captured promise for 15th',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon. Karthik Reddy idama matladachaa?","time":"10:42 AM"},{"id":"2","speaker":"customer","text":"Aam, naene.","time":"10:42 AM"},{"id":"3","speaker":"agent","text":"Mee LN-00482935 loan ₹84,500 overdue. 21 days aipoyayi.","time":"10:43 AM"},{"id":"4","speaker":"customer","text":"15th ki pay chestanu. App link pampu.","time":"10:46 AM"},{"id":"5","speaker":"agent","text":"Sure, app link pampistanu. 15th ki ₹84,500 pay chestara?","time":"10:46 AM","intent":"PTP captured"},{"id":"6","speaker":"customer","text":"Aam, correct.","time":"10:47 AM"}]$j$::jsonb),
('CALL-90011','LN-00482955','Lakshmi Iyer','Business loan',210000,'10:55 AM',286,'Escalated / Disputed','Tamil','Negotiation','Hardship — medical',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Vanakkam, Naan Vaani. Lakshmi Iyer idamda?","time":"10:55 AM"},{"id":"2","speaker":"customer","text":"Aam.","time":"10:55 AM"},{"id":"3","speaker":"agent","text":"Ungal LN-00482955 loan ₹2,10,000 overdue. 56 naatkal.","time":"10:56 AM"},{"id":"4","speaker":"customer","text":"En kanavan hospital-la irukkaar. Medical expenses-kku pay panna mudila ippo.","time":"10:59 AM"},{"id":"5","speaker":"agent","text":"Kalakkama pesungo. Human officer-ku transfer pannatten. Avanga udhavi vaanga.","time":"11:00 AM","intent":"Hardship — escalate"}]$j$::jsonb),
('CALL-90014','LN-00482972','Meera Joshi','Two-wheeler loan',5400,'11:08 AM',154,'Completed','Hinglish','Promise to pay','No promise — customer will check',true,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon. Meera Joshi se baat ho sakti hai?","time":"11:08 AM"},{"id":"2","speaker":"customer","text":"Haan.","time":"11:08 AM"},{"id":"3","speaker":"agent","text":"Aapke LN-00482972 loan ka ₹5,400 overdue tha. Abhi paid dikh raha hai. Thank you!","time":"11:09 AM"}]$j$::jsonb),
('CALL-90002','LN-00482917','Rohan Mehta','Personal loan',4500,'09:52 AM',22,'Failed','Hinglish','Identity verification','No answer',false,true,true,$j$[{"id":"1","speaker":"agent","text":"Namaste, main Vaani hoon, Sterling Credit ki taraf se.","time":"09:52 AM"}]$j$::jsonb)
ON CONFLICT (call_id) DO NOTHING;

INSERT INTO promises_to_pay (id, loan_id, customer_name, promised_date, promised_amount, source_call_id, state) VALUES
('PTP-1','LN-00482935','Karthik Reddy','2026-11-10',84500,'CALL-90008','Due today'),
('PTP-2','LN-00482917','Rohan Mehta','2026-11-10',4500,'CALL-90021','Due today'),
('PTP-3','LN-00482960','Sandeep Yadav','2026-11-12',15800,'CALL-90024','Upcoming'),
('PTP-4','LN-00482948','Imran Khan','2026-11-14',3200,'CALL-90023','Upcoming'),
('PTP-5','LN-00482941','Priya Nair','2026-11-15',7200,'CALL-90022','Upcoming'),
('PTP-6','LN-00482972','Meera Joshi','2026-11-16',5400,'CALL-90014','Upcoming'),
('PTP-7','LN-00482920','Anjali Sharma','2026-11-05',60000,'CALL-90005','Missed'),
('PTP-8','LN-00482955','Lakshmi Iyer','2026-11-03',100000,'CALL-90011','Missed'),
('PTP-9','LN-00482960','Sandeep Yadav','2026-11-01',15800,'CALL-90019','Paid'),
('PTP-10','LN-00482972','Meera Joshi','2026-10-28',5400,'CALL-90014','Paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO escalations (id, call_id, loan_id, customer_name, reason, queue_status, waiting_minutes, assigned_officer, alert_delivered, sensitive, notes, timeline) VALUES
('ESC-1','CALL-90011','LN-00482955','Lakshmi Iyer','Hardship or medical','Open',38,NULL,true,true,'',$j$[{"time":"11:00 AM","event":"Hardship / medical disclosed — escalated"},{"time":"11:02 AM","event":"Manager alert sent"},{"time":"11:05 AM","event":"Awaiting officer assignment"}]$j$::jsonb),
('ESC-2','CALL-90005','LN-00482920','Anjali Sharma','Dispute','Assigned',52,'Vikram S.',true,false,'Customer claims 2 EMIs already paid. Need to verify with billing.',$j$[{"time":"10:22 AM","event":"Customer disputed charges — escalated"},{"time":"10:24 AM","event":"Assigned to Vikram S."}]$j$::jsonb),
('ESC-3','CALL-90018','LN-00482941','Priya Nair','Bereavement','Open',14,NULL,false,true,'',$j$[{"time":"11:46 AM","event":"Bereavement disclosed — escalated"},{"time":"11:46 AM","event":"Manager alert queued (pending delivery)"}]$j$::jsonb),
('ESC-4','CALL-90015','LN-00482960','Sandeep Yadav','Customer asked for human','Open',27,NULL,true,false,'',$j$[{"time":"11:33 AM","event":"Customer requested human officer"},{"time":"11:34 AM","event":"Manager alert sent"}]$j$::jsonb),
('ESC-5','CALL-90007','LN-00482948','Imran Khan','Complaint','Resolved',0,'Neha R.',true,false,'Complaint about call frequency. Acknowledged and logged.',$j$[{"time":"10:30 AM","event":"Complaint raised"},{"time":"10:35 AM","event":"Assigned to Neha R."},{"time":"10:58 AM","event":"Resolved"}]$j$::jsonb),
('ESC-6','CALL-90003','LN-00482972','Meera Joshi','Technical failure','Resolved',0,'Vikram S.',true,false,'Call dropped due to telephony error. Retry scheduled.',$j$[{"time":"09:40 AM","event":"Technical failure — call dropped"},{"time":"09:42 AM","event":"Resolved — retry scheduled"}]$j$::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO flagged_calls (call_id, customer_name, time_label, rule, severity) VALUES
('CALL-90009','Rajesh Kumar','09:48 AM','Call placed outside permitted hours','high'),
('CALL-90012','Fatima Sheikh','10:31 AM','Identity not verified before disclosure','high'),
('CALL-90016','Arjun Nair','11:14 AM','Distress language detected','medium'),
('CALL-90019','Deepika Rao','11:22 AM','Unapproved settlement offer mentioned','medium'),
('CALL-90020','Suresh Pillai','11:36 AM','Grievance helpline not mentioned on complaint','low'),
('CALL-90004','Anjali Sharma','08:02 AM','Call placed outside permitted hours','high')
ON CONFLICT (call_id) DO NOTHING;

INSERT INTO hourly_promises (hour_label, sort_order, today, yesterday) VALUES
('8 AM',1,12,9),('9 AM',2,28,22),('10 AM',3,41,35),('11 AM',4,53,44),('12 PM',5,38,40),('1 PM',6,31,28),
('2 PM',7,45,39),('3 PM',8,48,42),('4 PM',9,36,33),('5 PM',10,29,25),('6 PM',11,18,14)
ON CONFLICT (hour_label) DO NOTHING;

INSERT INTO daily_kpis (id, calls_today, connect_rate, ptp_captured, ptp_amount, avg_call_length_sec, outcomes, compliance) VALUES
(1, 1284, 0.68, 342, 4865000, 184,
 '[{"label":"PTP Promised","value":342,"color":"#16a34a"},{"label":"Escalated","value":86,"color":"#dc2626"},{"label":"Completed without promise","value":612,"color":"#4f46e5"},{"label":"Failed","value":244,"color":"#94a3b8"}]'::jsonb,
 '{"adherenceRate":0.984,"callsBlockedOutsideHours":18,"idvFailureRate":0.021,"distressFlags":3,"grievanceMentions":96}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings (id, calling_start, calling_end, max_ptp_days, approved_options, human_queue_phone, alert_webhook_url) VALUES
(1, '08:00', '19:00', 15, '["Payment link by SMS","Mobile app payment","Branch visit"]'::jsonb, '+91 80 4567 8900', 'https://hooks.vaani.co/escalations')
ON CONFLICT (id) DO NOTHING;

INSERT INTO telephony_providers (name, role, connected) VALUES
('Twilio','Primary outbound · India',true),
('Exotel','Failover · India',true),
('Knowlarity','Backup · not configured',false)
ON CONFLICT (name) DO NOTHING;
