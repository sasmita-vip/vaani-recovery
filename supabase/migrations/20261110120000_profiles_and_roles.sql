/*
# Profiles, sign-in roles and row-level security

Plain-English summary:
- Adds a `profiles` table linked to Supabase Auth users (name + role).
- Removes every policy that let the public `anon` role read or write data.
- Dashboard users must be signed in. Only signed-in users can read data.
- Officers and managers may update an escalation (queue status, assigned
  officer, notes). Compliance users are read-only.
- Only managers may update `app_settings`.
- Settings values are constrained to sane operating limits.

No table data is changed here except clamping the settings row so that the
new constraints apply cleanly.
*/

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  role text NOT NULL DEFAULT 'officer' CHECK (role IN ('manager', 'officer', 'compliance')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Dashboard user profile. Rows are created automatically when an admin adds a user in Supabase Auth.';

-- Keep a profile in step with every new auth user (admin-created users included).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    NEW.email,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('manager', 'officer', 'compliance')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'officer'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for users that already exist.
INSERT INTO public.profiles (id, full_name, email, role)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(COALESCE(u.email, ''), '@', 1)),
  u.email,
  'officer'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Role helpers (stable, security definer so policies can read profiles safely)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_work_escalations()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_profile_role() IN ('manager', 'officer'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(public.current_profile_role() = 'manager', false);
$$;

-- ---------------------------------------------------------------------------
-- Revoke everything from the public (anon) role
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "read_loans" ON loans;
DROP POLICY IF EXISTS "read_calls" ON calls;
DROP POLICY IF EXISTS "read_promises" ON promises_to_pay;
DROP POLICY IF EXISTS "read_escalations" ON escalations;
DROP POLICY IF EXISTS "update_escalations" ON escalations;
DROP POLICY IF EXISTS "read_flagged" ON flagged_calls;
DROP POLICY IF EXISTS "read_hourly" ON hourly_promises;
DROP POLICY IF EXISTS "read_kpis" ON daily_kpis;
DROP POLICY IF EXISTS "read_settings" ON app_settings;
DROP POLICY IF EXISTS "update_settings" ON app_settings;
DROP POLICY IF EXISTS "read_telephony" ON telephony_providers;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- ---------------------------------------------------------------------------
-- Signed-in users: read everything the dashboard shows
-- ---------------------------------------------------------------------------

GRANT SELECT ON loans, calls, promises_to_pay, escalations, telephony_providers TO authenticated;
GRANT SELECT ON app_settings TO authenticated;
GRANT SELECT ON profiles TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read" ON profiles;
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_manager());

DROP POLICY IF EXISTS "profiles_manager_update" ON profiles;
CREATE POLICY "profiles_manager_update" ON profiles
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

DROP POLICY IF EXISTS "loans_read" ON loans;
CREATE POLICY "loans_read" ON loans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "calls_read" ON calls;
CREATE POLICY "calls_read" ON calls FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "promises_read" ON promises_to_pay;
CREATE POLICY "promises_read" ON promises_to_pay FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "escalations_read" ON escalations;
CREATE POLICY "escalations_read" ON escalations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "escalations_update" ON escalations;
CREATE POLICY "escalations_update" ON escalations
  FOR UPDATE TO authenticated
  USING (public.can_work_escalations())
  WITH CHECK (public.can_work_escalations());

-- Only these three columns may be written by dashboard users.
REVOKE UPDATE ON escalations FROM authenticated;
GRANT UPDATE (queue_status, assigned_officer, notes) ON escalations TO authenticated;

DROP POLICY IF EXISTS "flagged_read" ON flagged_calls;
CREATE POLICY "flagged_read" ON flagged_calls FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "hourly_read" ON hourly_promises;
CREATE POLICY "hourly_read" ON hourly_promises FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kpis_read" ON daily_kpis;
CREATE POLICY "kpis_read" ON daily_kpis FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_read" ON app_settings;
CREATE POLICY "settings_read" ON app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_manager_update" ON app_settings;
CREATE POLICY "settings_manager_update" ON app_settings
  FOR UPDATE TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

GRANT UPDATE ON app_settings TO authenticated;

DROP POLICY IF EXISTS "telephony_read" ON telephony_providers;
CREATE POLICY "telephony_read" ON telephony_providers FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Settings constraints
-- ---------------------------------------------------------------------------

UPDATE app_settings
SET max_ptp_days = LEAST(GREATEST(max_ptp_days, 1), 14)
WHERE max_ptp_days NOT BETWEEN 1 AND 14;

ALTER TABLE app_settings ALTER COLUMN max_ptp_days SET DEFAULT 14;

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_time_format_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_time_format_check
  CHECK (calling_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND calling_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_calling_start_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_calling_start_check
  CHECK (calling_start >= '08:00');

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_calling_end_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_calling_end_check
  CHECK (calling_end <= '19:00');

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_window_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_window_check
  CHECK (calling_start < calling_end);

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_max_ptp_days_check;
ALTER TABLE app_settings ADD CONSTRAINT app_settings_max_ptp_days_check
  CHECK (max_ptp_days BETWEEN 1 AND 14);
