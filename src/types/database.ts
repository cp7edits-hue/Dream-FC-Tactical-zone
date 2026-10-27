export type MeetingStatus = 'scheduled' | 'active' | 'locked' | 'ended';
export type BoardPermissionMode = 'coach_only' | 'open_collaboration' | 'host_assigned';
export type ParticipantRole = 'host' | 'player' | 'collaborator' | 'assistant_coach';
export type AdmissionStatus = 'waiting_lobby' | 'admitted' | 'denied' | 'removed';

export interface ProfileRecord {
  id: string;
  display_name: string;
  role: 'coach' | 'analyst' | 'player';
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingRecord {
  id: string;
  code: string;
  title: string;
  host_user_id: string;
  team_label: string;
  status: MeetingStatus;
  access_secret_hash: string;
  access_secret_expires_at?: string;
  max_participants: number;
  board_permission_mode: BoardPermissionMode;
  allow_chat: boolean;
  lobby_enabled: boolean;
  created_at: string;
  started_at: string;
  ended_at?: string;
}

export interface MeetingParticipantRecord {
  id: string;
  meeting_id: string;
  authenticated_user_id?: string;
  session_identifier: string;
  display_name: string;
  role: ParticipantRole;
  admission_status: AdmissionStatus;
  is_muted: boolean;
  can_edit_board: boolean;
  joined_at: string;
  last_seen_at: string;
  left_at?: string;
}

export interface TacticalBoardRecord {
  id: string;
  meeting_id: string;
  board_state: any;
  revision: number;
  updated_by?: string;
  updated_at: string;
}

export interface SavedTacticRecord {
  id: string;
  owner_user_id: string;
  title: string;
  field_type: string;
  formation_type: string;
  board_state: any;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface MeetingMessageRecord {
  id: string;
  meeting_id: string;
  sender_participant_id: string;
  sender_name: string;
  message: string;
  created_at: string;
}
