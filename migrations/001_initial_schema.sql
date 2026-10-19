-- ==============================================================================
-- DREAM FC TACTICAL ZONE — POSTGRESQL SCHEMA & ROW LEVEL SECURITY (RLS)
-- Version: 001_initial_schema.sql
-- ==============================================================================

-- 1. PROFILES TABLE (Authentication-linked coach profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coach' CHECK (role IN ('coach', 'analyst', 'player')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. MEETINGS TABLE (Tactical strategy session lifecycle)
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(16) UNIQUE NOT NULL,
  title VARCHAR(120) NOT NULL,
  host_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_meetings_host_user_id ON public.meetings(host_user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON public.meetings(status);

-- 3. MEETING PARTICIPANTS TABLE (Roles, guest sessions & moderation state)
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

-- 4. TACTICAL BOARDS TABLE (Canonical persistent 3D pitch state with revision tracking)
CREATE TABLE IF NOT EXISTS public.tactical_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  board_state JSONB NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tactical_boards_meeting ON public.tactical_boards(meeting_id);

-- 5. SAVED TACTICS TABLE (Personal library of drills & formations for coaches)
CREATE TABLE IF NOT EXISTS public.saved_tactics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  field_type VARCHAR(30) NOT NULL DEFAULT 'full_pitch',
  formation_type VARCHAR(20) NOT NULL DEFAULT '4-3-3',
  board_state JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_saved_tactics_owner ON public.saved_tactics(owner_user_id);

-- 6. MEETING MESSAGES TABLE (Realtime in-meeting tactical discussion)
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_participant_id UUID NOT NULL REFERENCES public.meeting_participants(id) ON DELETE CASCADE,
  sender_name VARCHAR(60) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_messages_meeting ON public.meeting_messages(meeting_id);

-- 7. AUDIT EVENTS TABLE (Lifecycle and security audit log)
CREATE TABLE IF NOT EXISTS public.meeting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. PRIVACY DELETION REQUESTS TABLE (GDPR / privacy compliance)
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

-- Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Meetings Policies
-- Hosts can manage their meetings
CREATE POLICY "Host can do everything with their meetings"
  ON public.meetings FOR ALL
  USING (auth.uid() = host_user_id);

-- Admitted participants can read the meeting details (excluding passcodes)
CREATE POLICY "Admitted participants can view meeting"
  ON public.meetings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_participants
      WHERE meeting_participants.meeting_id = meetings.id
        AND (meeting_participants.authenticated_user_id = auth.uid() OR meeting_participants.session_identifier IS NOT NULL)
        AND meeting_participants.admission_status = 'admitted'
    )
  );

-- Meeting Participants Policies
CREATE POLICY "Host can manage participants"
  ON public.meeting_participants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = meeting_participants.meeting_id
        AND meetings.host_user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can view other members in same meeting"
  ON public.meeting_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_participants AS me
      WHERE me.meeting_id = meeting_participants.meeting_id
        AND (me.authenticated_user_id = auth.uid())
        AND me.admission_status = 'admitted'
    )
  );

-- Tactical Boards Policies
CREATE POLICY "Admitted members can read the board"
  ON public.tactical_boards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_participants
      WHERE meeting_participants.meeting_id = tactical_boards.meeting_id
        AND (meeting_participants.authenticated_user_id = auth.uid())
        AND meeting_participants.admission_status = 'admitted'
    )
    OR
    EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = tactical_boards.meeting_id
        AND meetings.host_user_id = auth.uid()
    )
  );

CREATE POLICY "Authorized editors can update the board"
  ON public.tactical_boards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = tactical_boards.meeting_id
        AND meetings.host_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.meeting_participants
      WHERE meeting_participants.meeting_id = tactical_boards.meeting_id
        AND meeting_participants.authenticated_user_id = auth.uid()
        AND (meeting_participants.can_edit_board = true OR meeting_participants.role = 'host')
    )
  );

-- Saved Tactics Policies (Strictly Owner-Only)
CREATE POLICY "Users can only manage their own saved tactics"
  ON public.saved_tactics FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Meeting Messages Policies
CREATE POLICY "Admitted participants can read chat"
  ON public.meeting_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meeting_participants
      WHERE meeting_participants.meeting_id = meeting_messages.meeting_id
        AND (meeting_participants.authenticated_user_id = auth.uid())
        AND meeting_participants.admission_status = 'admitted'
    )
  );

CREATE POLICY "Admitted participants can send chat"
  ON public.meeting_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meeting_participants
      WHERE meeting_participants.id = meeting_messages.sender_participant_id
        AND meeting_participants.meeting_id = meeting_messages.meeting_id
        AND (meeting_participants.authenticated_user_id = auth.uid())
        AND meeting_participants.admission_status = 'admitted'
    )
  );
