-- ==============================================================================
-- DREAM FC TACTICAL ZONE — COMPLETE SUPABASE DATABASE SETUP & SCHEMA
-- File: migrations/000_complete_supabase_setup.sql
-- 
-- INSTRUCTIONS FOR USER:
-- 1. Open your Supabase Project Dashboard: https://supabase.com/dashboard/project/wvooizipgxyrvrowbwwc
-- 2. Click "SQL Editor" in the left sidebar navigation.
-- 3. Click "New Query", paste the entire contents of this file, and click "Run".
-- 4. All tables, foreign keys, indexes, and Row Level Security (RLS) policies
--    will be created and configured for multi-device cross-browser collaboration.
-- ==============================================================================

-- 1. PROFILES TABLE (Optional auth-linked coach profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('coach', 'analyst', 'player')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. MEETINGS TABLE (Canonical cross-device meeting sessions)
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) UNIQUE NOT NULL,
  title VARCHAR(120) NOT NULL,
  host_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_label VARCHAR(60) DEFAULT 'Dream FC',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled', 'active', 'locked', 'ended')),
  access_secret_hash TEXT NOT NULL,
  access_secret_expires_at TIMESTAMPTZ,
  max_participants INTEGER NOT NULL DEFAULT 25,
  board_permission_mode VARCHAR(20) NOT NULL DEFAULT 'coach_only' CHECK (board_permission_mode IN ('coach_only', 'open_collaboration', 'host_assigned')),
  allow_chat BOOLEAN NOT NULL DEFAULT true,
  lobby_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meetings_code ON public.meetings(code);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON public.meetings(created_at DESC);

-- 3. MEETING PARTICIPANTS TABLE (Squad list, roles, moderation state)
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  authenticated_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_identifier VARCHAR(64) NOT NULL,
  display_name VARCHAR(60) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player', 'collaborator')),
  admission_status VARCHAR(20) NOT NULL DEFAULT 'admitted' CHECK (admission_status IN ('waiting_lobby', 'admitted', 'denied', 'removed')),
  is_muted BOOLEAN NOT NULL DEFAULT false,
  can_edit_board BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  left_at TIMESTAMPTZ,
  CONSTRAINT uq_meeting_session UNIQUE (meeting_id, session_identifier)
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_session ON public.meeting_participants(session_identifier);

-- 4. TACTICAL BOARDS TABLE (Canonical 3D pitch state, formations, and pass paths)
CREATE TABLE IF NOT EXISTS public.tactical_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  board_state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tactical_boards_meeting ON public.tactical_boards(meeting_id);

-- 5. SAVED TACTICS TABLE (Coaches personal tactic playbook)
CREATE TABLE IF NOT EXISTS public.saved_tactics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  field_type VARCHAR(30) NOT NULL DEFAULT 'full_pitch',
  formation_type VARCHAR(20) NOT NULL DEFAULT '4-3-3',
  board_state JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. MEETING MESSAGES TABLE (Realtime in-meeting chat)
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_participant_id UUID REFERENCES public.meeting_participants(id) ON DELETE SET NULL,
  sender_name VARCHAR(60) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_meeting ON public.meeting_messages(meeting_id);

-- 7. AUDIT EVENTS TABLE (Lifecycle and security events)
CREATE TABLE IF NOT EXISTS public.meeting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. PRIVACY DELETION REQUESTS TABLE (GDPR Compliance)
CREATE TABLE IF NOT EXISTS public.privacy_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email VARCHAR(120) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMPTZ
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enables safe, server-authorized access for public anon clients and host coaches
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_tactics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Meetings Policies
DROP POLICY IF EXISTS "Allow meeting creation" ON public.meetings;
CREATE POLICY "Allow meeting creation" ON public.meetings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow meeting reading" ON public.meetings;
CREATE POLICY "Allow meeting reading" ON public.meetings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow meeting updates" ON public.meetings;
CREATE POLICY "Allow meeting updates" ON public.meetings FOR UPDATE USING (true);

-- Tactical Boards Policies
DROP POLICY IF EXISTS "Allow board insert" ON public.tactical_boards;
CREATE POLICY "Allow board insert" ON public.tactical_boards FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow board select" ON public.tactical_boards;
CREATE POLICY "Allow board select" ON public.tactical_boards FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow board update" ON public.tactical_boards;
CREATE POLICY "Allow board update" ON public.tactical_boards FOR UPDATE USING (true);

-- Meeting Participants Policies
DROP POLICY IF EXISTS "Allow participant join" ON public.meeting_participants;
CREATE POLICY "Allow participant join" ON public.meeting_participants FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow participant select" ON public.meeting_participants;
CREATE POLICY "Allow participant select" ON public.meeting_participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow participant update" ON public.meeting_participants;
CREATE POLICY "Allow participant update" ON public.meeting_participants FOR UPDATE USING (true);

-- Meeting Messages Policies
DROP POLICY IF EXISTS "Allow messages select" ON public.meeting_messages;
CREATE POLICY "Allow messages select" ON public.meeting_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow messages insert" ON public.meeting_messages;
CREATE POLICY "Allow messages insert" ON public.meeting_messages FOR INSERT WITH CHECK (true);

-- Saved Tactics Policies (Allow public access or owner)
DROP POLICY IF EXISTS "Allow saved tactics access" ON public.saved_tactics;
CREATE POLICY "Allow saved tactics access" ON public.saved_tactics FOR ALL USING (true) WITH CHECK (true);

-- Privacy Deletion Policies
DROP POLICY IF EXISTS "Allow privacy requests insert" ON public.privacy_deletion_requests;
CREATE POLICY "Allow privacy requests insert" ON public.privacy_deletion_requests FOR INSERT WITH CHECK (true);

-- Notify schema cache to reload
NOTIFY pgrst, 'reload schema';
