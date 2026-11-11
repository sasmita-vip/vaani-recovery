/*
# Demo calls are labelled and transcribed in English

Plain-English summary:
- The dashboard now records English conversations only; "Hinglish" was the wrong
  label for these demo calls and has been removed from the app's language list.
- Rows that were stored as `Hinglish` are relabelled `English`.
- The old romanised-Hindi turns for the affected demo calls are removed so
  `supabase/seed.sql` (re-run with `supabase db push --include-seed`) inserts the
  English transcripts with the same sequence numbers.

Hindi, Tamil and Telugu calls are untouched: they are genuinely other languages.
*/

UPDATE calls SET language = 'English' WHERE language = 'Hinglish';

DELETE FROM call_turns
WHERE call_id IN ('CALL-90021', 'CALL-90024', 'CALL-90014', 'CALL-90019', 'CALL-90002');
