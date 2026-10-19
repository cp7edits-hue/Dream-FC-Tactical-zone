-- ==============================================================================
-- DREAM FC TACTICAL ZONE — FIX MEETING CREATION & RLS POLICIES
-- Version: 002_fix_rls_and_fk.sql
-- ==============================================================================

-- 1. Make host_user_id in meetings nullable to allow guest coaches and API-created sessions
ALTER TABLE public.meetings ALTER COLUMN host_user_id DROP NOT NULL;
ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_host_user_id_fkey;
ALTER TABLE public.meetings 
  ADD CONSTRAINT meetings_host_user_id_fkey 
  FOREIGN KEY (host_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Meetings table: Allow insert for meeting creation (both authenticated and anon guest coaches)
DROP POLICY IF EXISTS "Allow meeting creation" ON public.meetings;
CREATE POLICY "Allow meeting creation"
  ON public.meetings FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow meeting reading" ON public.meetings;
CREATE POLICY "Allow meeting reading"
  ON public.meetings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow meeting updates" ON public.meetings;
CREATE POLICY "Allow meeting updates"
  ON public.meetings FOR UPDATE
  USING (true);

-- 3. Tactical boards: Allow insert, select, and update for meeting strategy boards
DROP POLICY IF EXISTS "Allow board insert" ON public.tactical_boards;
CREATE POLICY "Allow board insert"
  ON public.tactical_boards FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow board select" ON public.tactical_boards;
CREATE POLICY "Allow board select"
  ON public.tactical_boards FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow board update" ON public.tactical_boards;
CREATE POLICY "Allow board update"
  ON public.tactical_boards FOR UPDATE
  USING (true);

-- 4. Meeting participants: Allow joining and viewing room squad
DROP POLICY IF EXISTS "Allow participant join" ON public.meeting_participants;
CREATE POLICY "Allow participant join"
  ON public.meeting_participants FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow participant select" ON public.meeting_participants;
CREATE POLICY "Allow participant select"
  ON public.meeting_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow participant update" ON public.meeting_participants;
CREATE POLICY "Allow participant update"
  ON public.meeting_participants FOR UPDATE
  USING (true);

-- 5. Meeting messages: Allow read & send
DROP POLICY IF EXISTS "Allow messages select" ON public.meeting_messages;
CREATE POLICY "Allow messages select"
  ON public.meeting_messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow messages insert" ON public.meeting_messages;
CREATE POLICY "Allow messages insert"
  ON public.meeting_messages FOR INSERT
  WITH CHECK (true);
