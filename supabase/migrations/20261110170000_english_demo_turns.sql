/*
# English transcripts for the demo calls

Plain-English summary:
- `20261110160000_english_call_language.sql` relabelled the demo calls as English
  and removed their romanised-Hindi turns. This migration restores those turns in
  English so Call History, Live Calls and Call Detail read naturally.
- Inserts are idempotent: `on conflict (call_id, seq) do nothing`, so the same
  rows in `supabase/seed.sql` never conflict.
- Only the five previously-Hinglish demo calls are touched.
*/

INSERT INTO call_turns (call_id, seq, speaker, text, language, created_at) VALUES
('CALL-90021',1,'agent','Hello, this is Vaani calling from Sterling Credit. Am I speaking with Rohan Mehta?','English','2026-11-10 11:42:00+05:30'),
('CALL-90021',2,'customer','Yes, I am Rohan.','English','2026-11-10 11:42:20+05:30'),
('CALL-90021',3,'agent','Thank you. This call is about the 4,500 rupees overdue on your loan LN-00482917.','English','2026-11-10 11:43:00+05:30'),
('CALL-90021',4,'customer','Look, this month is a bit tight. My salary comes on the 5th.','English','2026-11-10 11:44:00+05:30'),
('CALL-90021',5,'agent','I understand. Can you pay 4,500 rupees on the 5th? I can send a payment link by SMS.','English','2026-11-10 11:45:00+05:30'),
('CALL-90021',6,'customer','Yes, I will arrange it by the 5th. Send the link.','English','2026-11-10 11:45:30+05:30'),

('CALL-90024',1,'agent','Hello, this is Vaani calling from Sterling Credit. Am I speaking with Sandeep Yadav?','English','2026-11-10 11:58:00+05:30'),

('CALL-90014',1,'agent','Hello, this is Vaani. Am I speaking with Meera Joshi?','English','2026-11-10 11:08:00+05:30'),
('CALL-90014',2,'customer','Yes.','English','2026-11-10 11:08:20+05:30'),
('CALL-90014',3,'agent','Your loan LN-00482972 had 5,400 rupees overdue. It now shows as paid. Thank you!','English','2026-11-10 11:09:00+05:30'),

('CALL-90019',1,'agent','Hello, this is Vaani. Am I speaking with Sandeep Yadav?','English','2026-11-09 16:10:00+05:30'),
('CALL-90019',2,'customer','Yes, go ahead.','English','2026-11-09 16:10:20+05:30'),
('CALL-90019',3,'agent','Your loan LN-00482960 has 15,800 rupees overdue. When will the payment be made?','English','2026-11-09 16:11:00+05:30'),
('CALL-90019',4,'customer','I will do it on 1 November.','English','2026-11-09 16:13:00+05:30'),

('CALL-90002',1,'agent','Hello, this is Vaani calling from Sterling Credit.','English','2026-11-10 09:52:00+05:30')
ON CONFLICT (call_id, seq) DO NOTHING;
