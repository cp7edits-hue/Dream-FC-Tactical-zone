-- ==============================================================================
-- DREAM FC TACTICAL ZONE — CHAT & MEDIA RELAXED FOREIGN KEYS & RLS
-- Version: 003_chat_and_media.sql
-- ==============================================================================

-- 1. Make sender_participant_id nullable in meeting_messages to support guest participants
ALTER TABLE public.meeting_messages ALTER COLUMN sender_participant_id DROP NOT NULL;

-- 2. Drop strict foreign key constraint if it prevents guest messages
ALTER TABLE public.meeting_messages DROP CONSTRAINT IF EXISTS meeting_messages_sender_participant_id_fkey;
ALTER TABLE public.meeting_messages 
  ADD CONSTRAINT meeting_messages_sender_participant_id_fkey 
  FOREIGN KEY (sender_participant_id) REFERENCES public.meeting_participants(id) ON DELETE SET NULL;

-- 3. Ensure RLS policies permit chat insertion and selection for all active sessions
DROP POLICY IF EXISTS "Allow messages select" ON public.meeting_messages;
CREATE POLICY "Allow messages select"
  ON public.meeting_messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow messages insert" ON public.meeting_messages;
CREATE POLICY "Allow messages insert"
  ON public.meeting_messages FOR INSERT
  WITH CHECK (true);
