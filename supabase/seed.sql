/*
# Development seed data

Run this only against a local or development database, after all migrations:

  psql "$SUPABASE_DB_URL" -f supabase/seed.sql

Every date below is in November 2026 and every calendar date is a weekday.
The same eight customers, loan IDs and amounts are used across loans, calls,
promises to pay and escalations.
*/

-- ---------------------------------------------------------------------------
-- Loans
-- ---------------------------------------------------------------------------

INSERT INTO loans (loan_id, customer_id, customer_name, lender_name, loan_type, overdue_amount, due_date, status, phone, created_at) VALUES
('LN-00482917','CUST1001','Rohan Mehta','Sterling Credit NBFC','Personal loan',4500,'2026-11-03','Overdue','+91 98201 44710','2026-10-01 10:00:00+05:30'),
('LN-00482920','CUST1002','Anjali Sharma','Sterling Credit NBFC','Two-wheeler loan',125000,'2026-11-02','Escalated / Disputed','+91 99720 11830','2026-10-01 10:05:00+05:30'),
('LN-00482935','CUST1003','Karthik Reddy','Sterling Credit NBFC','Business loan',84500,'2026-11-06','PTP Promised','+91 90100 55221','2026-10-01 10:10:00+05:30'),
('LN-00482941','CUST1004','Priya Nair','Sterling Credit NBFC','Personal loan',7200,'2026-11-04','Overdue','+91 98460 33902','2026-10-01 10:15:00+05:30'),
('LN-00482948','CUST1005','Imran Khan','Sterling Credit NBFC','Two-wheeler loan',3200,'2026-11-09','Overdue','+91 97000 22814','2026-10-01 10:20:00+05:30'),
('LN-00482955','CUST1006','Lakshmi Iyer','Sterling Credit NBFC','Business loan',210000,'2026-11-05','Escalated / Disputed','+91 95000 88120','2026-10-01 10:25:00+05:30'),
('LN-00482960','CUST1007','Sandeep Yadav','Sterling Credit NBFC','Personal loan',15800,'2026-11-10','PTP Promised','+91 96400 11755','2026-10-01 10:30:00+05:30'),
('LN-00482972','CUST1008','Meera Joshi','Sterling Credit NBFC','Two-wheeler loan',5400,'2026-11-10','Paid','+91 98900 44120','2026-10-01 10:35:00+05:30')
ON CONFLICT (loan_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Calls (Tuesday 10 November 2026, plus two Monday 9 November calls)
-- ---------------------------------------------------------------------------

INSERT INTO calls (
  call_id, loan_id, customer_name, loan_type, overdue_amount, started_at, duration_sec,
  status, language, stage, agent_intent, identity_verified, within_calling_hours,
  no_unapproved_offers, transcript, ended_at, provider, provider_status
) VALUES
('CALL-90021','LN-00482917','Rohan Mehta','Personal loan',4500,'2026-11-10 11:42:00+05:30',187,
 'In Progress','English','Negotiation','Offer partial payment before due date',true,true,true,'[]'::jsonb,NULL,'twilio','in_progress'),
('CALL-90022','LN-00482941','Priya Nair','Personal loan',7200,'2026-11-10 11:50:00+05:30',96,
 'In Progress','Tamil','Payment demand','Confirm identity and state overdue',true,true,true,'[]'::jsonb,NULL,'twilio','in_progress'),
('CALL-90023','LN-00482948','Imran Khan','Two-wheeler loan',3200,'2026-11-10 11:55:00+05:30',42,
 'In Progress','Hindi','Identity verification','Verify identity before disclosing',false,true,true,'[]'::jsonb,NULL,'exotel','in_progress'),
('CALL-90024','LN-00482960','Sandeep Yadav','Personal loan',15800,'2026-11-10 11:58:00+05:30',18,
 'In Progress','English','Identity verification','Verify identity',false,true,true,'[]'::jsonb,NULL,'exotel','in_progress'),
('CALL-90005','LN-00482920','Anjali Sharma','Two-wheeler loan',125000,'2026-11-10 10:18:00+05:30',412,
 'Escalated / Disputed','Hindi','Negotiation','Customer disputed charges',true,true,true,'[]'::jsonb,'2026-11-10 10:25:00+05:30','twilio','completed'),
('CALL-90008','LN-00482935','Karthik Reddy','Business loan',84500,'2026-11-10 10:42:00+05:30',318,
 'PTP Promised','Telugu','Promise to pay','Captured promise for 15th',true,true,true,'[]'::jsonb,'2026-11-10 10:47:00+05:30','twilio','completed'),
('CALL-90011','LN-00482955','Lakshmi Iyer','Business loan',210000,'2026-11-10 10:55:00+05:30',286,
 'Escalated / Disputed','Tamil','Negotiation','Hardship disclosed',true,true,true,'[]'::jsonb,'2026-11-10 11:00:00+05:30','twilio','completed'),
('CALL-90014','LN-00482972','Meera Joshi','Two-wheeler loan',5400,'2026-11-10 11:08:00+05:30',154,
 'Completed','English','Promise to pay','No promise, customer will check',true,true,true,'[]'::jsonb,'2026-11-10 11:11:00+05:30','twilio','completed'),
('CALL-90002','LN-00482917','Rohan Mehta','Personal loan',4500,'2026-11-10 09:52:00+05:30',22,
 'Failed','English','Identity verification','No answer',false,true,true,'[]'::jsonb,'2026-11-10 09:52:00+05:30','twilio','no_answer'),
('CALL-90019','LN-00482960','Sandeep Yadav','Personal loan',15800,'2026-11-09 16:10:00+05:30',205,
 'PTP Promised','English','Promise to pay','Captured promise for 1 November',true,true,true,'[]'::jsonb,'2026-11-09 16:14:00+05:30','exotel','completed'),
('CALL-90004','LN-00482920','Anjali Sharma','Two-wheeler loan',125000,'2026-11-09 07:40:00+05:30',64,
 'Failed','Hindi','Identity verification','Customer asked to call later',false,false,true,'[]'::jsonb,'2026-11-09 07:41:00+05:30','exotel','completed')
ON CONFLICT (call_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Call turns (one row per spoken line, as the voice backend writes them)
-- ---------------------------------------------------------------------------

INSERT INTO call_turns (call_id, seq, speaker, text, language, created_at) VALUES
('CALL-90021',1,'agent','Hello, this is Vaani calling from Sterling Credit. Am I speaking with Rohan Mehta?','English','2026-11-10 11:42:00+05:30'),
('CALL-90021',2,'customer','Yes, I am Rohan.','English','2026-11-10 11:42:20+05:30'),
('CALL-90021',3,'agent','Thank you. This call is about the 4,500 rupees overdue on your loan LN-00482917.','English','2026-11-10 11:43:00+05:30'),
('CALL-90021',4,'customer','Look, this month is a bit tight. My salary comes on the 5th.','English','2026-11-10 11:44:00+05:30'),
('CALL-90021',5,'agent','I understand. Can you pay 4,500 rupees on the 5th? I can send a payment link by SMS.','English','2026-11-10 11:45:00+05:30'),
('CALL-90021',6,'customer','Yes, I will arrange it by the 5th. Send the link.','English','2026-11-10 11:45:30+05:30'),

('CALL-90022',1,'agent','Vanakkam, naan Vaani, Sterling Credit lenthu. Priya Nair idam pesalaama?','Tamil','2026-11-10 11:50:00+05:30'),
('CALL-90022',2,'customer','Aam, naan Priya.','Tamil','2026-11-10 11:50:20+05:30'),
('CALL-90022',3,'agent','Ungal LN-00482941 loan-ku 7,200 rupaye overdue irukku.','Tamil','2026-11-10 11:52:00+05:30'),

('CALL-90023',1,'agent','Namaste, main Vaani hoon, Sterling Credit ki taraf se. Kya main Imran Khan se baat kar sakti hoon?','Hindi','2026-11-10 11:55:00+05:30'),
('CALL-90023',2,'customer','Haan boliye.','Hindi','2026-11-10 11:55:15+05:30'),

('CALL-90024',1,'agent','Hello, this is Vaani calling from Sterling Credit. Am I speaking with Sandeep Yadav?','English','2026-11-10 11:58:00+05:30'),

('CALL-90005',1,'agent','Namaste, main Vaani hoon, Sterling Credit ki taraf se. Anjali Sharma se baat ho sakti hai?','Hindi','2026-11-10 10:18:00+05:30'),
('CALL-90005',2,'customer','Haan boliye.','Hindi','2026-11-10 10:18:15+05:30'),
('CALL-90005',3,'agent','Aapke LN-00482920 loan ka 1,25,000 rupaye overdue hai.','Hindi','2026-11-10 10:19:00+05:30'),
('CALL-90005',4,'customer','Ye amount galat hai. Maine do instalment already pay kiye the.','Hindi','2026-11-10 10:21:00+05:30'),
('CALL-90005',5,'agent','Main check kar leti hoon. Aapko human officer se baat karni hai?','Hindi','2026-11-10 10:22:00+05:30'),
('CALL-90005',6,'customer','Haan, please kisi officer ko connect karo.','Hindi','2026-11-10 10:22:20+05:30'),

('CALL-90008',1,'agent','Namaste, main Vaani hoon. Karthik Reddy garu matladutunnara?','Telugu','2026-11-10 10:42:00+05:30'),
('CALL-90008',2,'customer','Aam, naene.','Telugu','2026-11-10 10:42:20+05:30'),
('CALL-90008',3,'agent','Mee LN-00482935 loan 84,500 rupaye overdue undi.','Telugu','2026-11-10 10:43:00+05:30'),
('CALL-90008',4,'customer','15th ki pay chestanu. App link pampu.','Telugu','2026-11-10 10:46:00+05:30'),
('CALL-90008',5,'agent','Sure, app link pampistanu. 15th ki 84,500 rupaye pay chestara?','Telugu','2026-11-10 10:46:30+05:30'),
('CALL-90008',6,'customer','Aam, correct.','Telugu','2026-11-10 10:47:00+05:30'),

('CALL-90011',1,'agent','Vanakkam, naan Vaani. Lakshmi Iyer idam pesalaama?','Tamil','2026-11-10 10:55:00+05:30'),
('CALL-90011',2,'customer','Aam.','Tamil','2026-11-10 10:55:20+05:30'),
('CALL-90011',3,'agent','Ungal LN-00482955 loan 2,10,000 rupaye overdue irukku.','Tamil','2026-11-10 10:56:00+05:30'),
('CALL-90011',4,'customer','En kanavar hospital-la irukkaar. Medical expenses-kku pay panna mudila ippo.','Tamil','2026-11-10 10:59:00+05:30'),
('CALL-90011',5,'agent','Kalakkama pesunga. Human officer-ku transfer pannugiren.','Tamil','2026-11-10 11:00:00+05:30'),

('CALL-90014',1,'agent','Hello, this is Vaani. Am I speaking with Meera Joshi?','English','2026-11-10 11:08:00+05:30'),
('CALL-90014',2,'customer','Yes.','English','2026-11-10 11:08:20+05:30'),
('CALL-90014',3,'agent','Your loan LN-00482972 had 5,400 rupees overdue. It now shows as paid. Thank you!','English','2026-11-10 11:09:00+05:30'),

('CALL-90002',1,'agent','Hello, this is Vaani calling from Sterling Credit.','English','2026-11-10 09:52:00+05:30'),

('CALL-90019',1,'agent','Hello, this is Vaani. Am I speaking with Sandeep Yadav?','English','2026-11-09 16:10:00+05:30'),
('CALL-90019',2,'customer','Yes, go ahead.','English','2026-11-09 16:10:20+05:30'),
('CALL-90019',3,'agent','Your loan LN-00482960 has 15,800 rupees overdue. When will the payment be made?','English','2026-11-09 16:11:00+05:30'),
('CALL-90019',4,'customer','I will do it on 1 November.','English','2026-11-09 16:13:00+05:30'),

('CALL-90004',1,'agent','Namaste, main Vaani hoon, Sterling Credit ki taraf se. Anjali Sharma se baat ho sakti hai?','Hindi','2026-11-09 07:40:00+05:30'),
('CALL-90004',2,'customer','Abhi busy hoon, baad mein call kijiye.','Hindi','2026-11-09 07:40:40+05:30')
ON CONFLICT (call_id, seq) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Promises to pay
-- ---------------------------------------------------------------------------

INSERT INTO promises_to_pay (id, loan_id, customer_name, promised_date, promised_amount, source_call_id, created_at, paid_at) VALUES
('PTP-1','LN-00482935','Karthik Reddy','2026-11-10',84500,'CALL-90008','2026-11-10 10:46:00+05:30',NULL),
('PTP-2','LN-00482917','Rohan Mehta','2026-11-10',4500,'CALL-90021','2026-11-10 11:45:00+05:30',NULL),
('PTP-3','LN-00482960','Sandeep Yadav','2026-11-12',15800,'CALL-90024','2026-11-10 11:57:00+05:30',NULL),
('PTP-4','LN-00482948','Imran Khan','2026-11-13',3200,'CALL-90023','2026-11-09 15:20:00+05:30',NULL),
('PTP-5','LN-00482941','Priya Nair','2026-11-16',7200,'CALL-90022','2026-11-10 11:52:00+05:30',NULL),
('PTP-6','LN-00482972','Meera Joshi','2026-11-17',5400,'CALL-90014','2026-11-09 12:05:00+05:30',NULL),
('PTP-7','LN-00482920','Anjali Sharma','2026-11-05',60000,'CALL-90005','2026-11-02 11:10:00+05:30',NULL),
('PTP-8','LN-00482955','Lakshmi Iyer','2026-11-03',100000,'CALL-90011','2026-11-02 14:30:00+05:30',NULL),
('PTP-9','LN-00482960','Sandeep Yadav','2026-11-06',15800,'CALL-90019','2026-11-06 09:45:00+05:30','2026-11-06 16:00:00+05:30'),
('PTP-10','LN-00482972','Meera Joshi','2026-11-04',5400,'CALL-90014','2026-11-04 11:15:00+05:30','2026-11-04 12:00:00+05:30')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Escalations
-- ---------------------------------------------------------------------------

INSERT INTO escalations (id, call_id, loan_id, customer_name, reason, queue_status, assigned_officer, alert_delivered, sensitive, notes, timeline, created_at) VALUES
('ESC-1','CALL-90011','LN-00482955','Lakshmi Iyer','hardship_medical','Open',NULL,true,true,'','[]'::jsonb,'2026-11-10 11:00:00+05:30'),
('ESC-2','CALL-90005','LN-00482920','Anjali Sharma','dispute','Assigned','Neha R.',true,false,'Customer claims two EMIs already paid. Need to verify with billing.','[]'::jsonb,'2026-11-10 10:22:00+05:30'),
('ESC-3','CALL-90022','LN-00482941','Priya Nair','bereavement','Open',NULL,false,true,'','[]'::jsonb,'2026-11-10 11:46:00+05:30'),
('ESC-4','CALL-90024','LN-00482960','Sandeep Yadav','customer_requested_human','Open',NULL,true,false,'','[]'::jsonb,'2026-11-10 11:33:00+05:30'),
('ESC-5','CALL-90019','LN-00482948','Imran Khan','complaint','Resolved','Neha R.',true,false,'Complaint about call frequency. Acknowledged and logged.','[]'::jsonb,'2026-11-10 10:30:00+05:30'),
('ESC-6','CALL-90002','LN-00482972','Meera Joshi','technical_failure','Resolved','Arjun K.',true,false,'Call dropped due to telephony error. Retry scheduled.','[]'::jsonb,'2026-11-10 09:40:00+05:30')
ON CONFLICT (id) DO NOTHING;

-- A starting audit trail for the seeded escalations.
INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
SELECT NULL, 'escalation.created', 'escalations', e.id, NULL,
       jsonb_build_object('reason', e.reason, 'queue_status', e.queue_status, 'assigned_officer', e.assigned_officer)
FROM escalations e
WHERE e.id IN ('ESC-1','ESC-2','ESC-3','ESC-4','ESC-5','ESC-6')
  AND NOT EXISTS (
    SELECT 1 FROM audit_log a WHERE a.entity = 'escalations' AND a.entity_id = e.id
  );

-- ---------------------------------------------------------------------------
-- Queued dashboard actions
-- ---------------------------------------------------------------------------

INSERT INTO outbound_messages (loan_id, channel, template, scheduled_for, status, created_by, created_at)
SELECT 'LN-00482935', 'sms', 'payment_link', '2026-11-10 10:47:00+05:30', 'sent', NULL, '2026-11-10 10:47:00+05:30'
WHERE NOT EXISTS (
  SELECT 1 FROM outbound_messages WHERE loan_id = 'LN-00482935' AND template = 'payment_link'
);

INSERT INTO callback_requests (loan_id, scheduled_for, status, requested_by, created_at)
SELECT 'LN-00482920', '2026-11-10 15:00:00+05:30', 'queued', NULL, '2026-11-10 10:30:00+05:30'
WHERE NOT EXISTS (
  SELECT 1 FROM callback_requests WHERE loan_id = 'LN-00482920'
);

-- ---------------------------------------------------------------------------
-- Telephony providers
-- ---------------------------------------------------------------------------

INSERT INTO telephony_providers (name, role, connected, last_heartbeat) VALUES
('Twilio','Primary outbound, India',true,'2026-11-10 11:59:00+05:30'),
('Exotel','Failover, India',true,'2026-11-10 11:57:00+05:30'),
('Knowlarity','Backup, not configured',false,NULL)
ON CONFLICT (name) DO NOTHING;

-- English demo transcripts (Hinglish labels removed 2026-11-10).
