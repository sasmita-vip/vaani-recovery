/*
# Fix: callback audit trigger referenced a column callback_requests does not have

Plain-English summary:
- `outbound_messages` and `callback_requests` share one audit trigger function.
- That function read `NEW.created_by`, but `callback_requests` records the user in
  `requested_by`. Every callback insert therefore failed with
  `record "new" has no field "created_by"` (SQLSTATE 42703), which broke the
  "schedule callback" action and stopped `supabase/seed.sql` from loading.
- The function now reads the actor from the row as JSON, so it works for both
  tables and still falls back to `auth.uid()`.

No tables, columns or data are changed; the trigger definitions stay the same.
*/

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
