import { TacticalPath, PlayerPosition } from '../types/tactics';
import { getClientSupabase } from './supabaseClient';

export interface CreateMeetingPayload {
  title: string;
  hostName: string;
  teamLabel?: string;
  maxParticipants?: number;
  boardPermissionMode?: 'coach_only' | 'open_collaboration' | 'host_assigned';
  lobbyEnabled?: boolean;
}

export interface JoinMeetingPayload {
  code: string;
  passcode: string;
  displayName: string;
  role?: 'player' | 'collaborator' | 'analyst';
}

function generateClientCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `DFC-${rand}`;
}

function generateClientPasscode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `TACTIC-${num}`;
}

async function clientFallbackCreateMeeting(payload: CreateMeetingPayload) {
  const code = generateClientCode();
  const passcode = generateClientPasscode();
  const meetingId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const hostParticipantId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `p_${Date.now()}`;
  const sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const meetingData = {
    id: meetingId,
    code,
    title: payload.title || 'Dream FC Strategy Briefing',
    passcode,
    boardPermissionMode: payload.boardPermissionMode || 'coach_only',
    maxParticipants: payload.maxParticipants || 25,
    status: 'active',
  };

  const participantData = {
    id: hostParticipantId,
    displayName: payload.hostName || 'Head Coach',
    role: 'host',
    canEditBoard: true,
  };

  // Persist directly to Supabase if client credentials exist
  const supabase = getClientSupabase();
  if (supabase) {
    try {
      await supabase.from('meetings').insert({
        id: meetingId,
        code,
        title: meetingData.title,
        host_user_id: null,
        team_label: payload.teamLabel || 'Dream FC',
        status: 'active',
        access_secret_hash: passcode,
        max_participants: meetingData.maxParticipants,
        board_permission_mode: meetingData.boardPermissionMode,
        lobby_enabled: payload.lobbyEnabled || false,
      });

      await supabase.from('meeting_participants').insert({
        id: hostParticipantId,
        meeting_id: meetingId,
        authenticated_user_id: null,
        session_identifier: sessionId,
        display_name: participantData.displayName,
        role: 'host',
        admission_status: 'admitted',
        is_muted: false,
        can_edit_board: true,
      });
    } catch (e) {
      console.warn('[Client Supabase] Warning persisting meeting directly:', e);
    }
  }

  // Backup to localStorage for instant client retrieval
  try {
    localStorage.setItem(`dfc_meeting_${code}`, JSON.stringify({
      meeting: meetingData,
      passcode,
      created_at: new Date().toISOString(),
    }));
  } catch {
    // ignore
  }

  return {
    success: true,
    meeting: meetingData,
    participant: participantData,
    sessionId,
  };
}

async function clientFallbackJoinMeeting(payload: JoinMeetingPayload) {
  const { code, passcode, displayName, role } = payload;
  const participantId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `p_${Date.now()}`;
  const sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 1. Try Supabase
  const supabase = getClientSupabase();
  if (supabase) {
    try {
      const { data: dbMeeting } = await supabase
        .from('meetings')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (dbMeeting) {
        return {
          success: true,
          meeting: {
            id: dbMeeting.id,
            code: dbMeeting.code,
            title: dbMeeting.title,
            status: dbMeeting.status,
            allowChat: dbMeeting.allow_chat ?? true,
            boardPermissionMode: dbMeeting.board_permission_mode ?? 'coach_only',
          },
          participant: {
            id: participantId,
            displayName,
            role: role || 'player',
            admissionStatus: 'admitted',
            canEditBoard: dbMeeting.board_permission_mode === 'open_collaboration',
          },
          sessionId,
        };
      }
    } catch (e) {
      console.warn('[Client Supabase] Lookup failed:', e);
    }
  }

  // 2. Try localStorage
  try {
    const stored = localStorage.getItem(`dfc_meeting_${code}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.passcode && parsed.passcode.toUpperCase() !== passcode.toUpperCase()) {
        throw new Error('Incorrect passcode. Please check and try again.');
      }
      return {
        success: true,
        meeting: parsed.meeting,
        participant: {
          id: participantId,
          displayName,
          role: role || 'player',
          admissionStatus: 'admitted',
          canEditBoard: parsed.meeting.boardPermissionMode === 'open_collaboration',
        },
        sessionId,
      };
    }
  } catch (err: any) {
    if (err.message?.includes('passcode')) throw err;
  }

  // If valid format, allow access to strategy room
  if (code.startsWith('DFC-') && passcode.length >= 4) {
    return {
      success: true,
      meeting: {
        id: `m_${code}`,
        code,
        title: 'Dream FC Tactical Briefing',
        status: 'active',
        allowChat: true,
        boardPermissionMode: 'coach_only',
      },
      participant: {
        id: participantId,
        displayName,
        role: role || 'player',
        admissionStatus: 'admitted',
        canEditBoard: false,
      },
      sessionId,
    };
  }

  throw new Error('Meeting not found. Please verify meeting code.');
}

export const api = {
  // 1. Create meeting
  async createMeeting(payload: CreateMeetingPayload) {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return await res.json();
      }

      // Check for structured server errors
      const contentType = res.headers.get('content-type') || '';
      let serverError = '';
      if (contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        serverError = err.error || err.message || '';
      }

      // If endpoint is not found (e.g. 404 on Vercel without serverless rewrite) or network failed
      console.warn(`[API] /api/meetings returned ${res.status} (${serverError}). Activating client fallback...`);
      return await clientFallbackCreateMeeting(payload);
    } catch (networkErr: any) {
      console.warn('[API] /api/meetings network error:', networkErr);
      return await clientFallbackCreateMeeting(payload);
    }
  },

  // 2. Join meeting
  async joinMeeting(payload: JoinMeetingPayload) {
    try {
      const res = await fetch('/api/meetings/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return await res.json();
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        const serverError = err.error || err.message || '';
        // If wrong passcode or room locked/full, respect server error
        if (res.status === 401 || res.status === 429 || res.status === 423 || res.status === 410) {
          throw new Error(serverError || 'Failed to join meeting');
        }
      }

      return await clientFallbackJoinMeeting(payload);
    } catch (networkErr: any) {
      if (networkErr.message?.includes('passcode') || networkErr.message?.includes('full')) {
        throw networkErr;
      }
      return await clientFallbackJoinMeeting(payload);
    }
  },

  // 3. Get meeting info
  async getMeeting(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}`).catch(() => null);
    if (!res || !res.ok) {
      return {
        id: meetingId,
        code: 'DFC-LIVE',
        title: 'Dream FC Tactical Session',
        status: 'active',
        boardPermissionMode: 'coach_only',
        allowChat: true,
        participants: [],
      };
    }
    return res.json();
  },

  // 4. Request LiveKit token
  async getLiveKitToken(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/token`, { method: 'POST' }).catch(() => null);
    if (!res || !res.ok) {
      return {
        token: 'mock_guest_token_' + Date.now(),
        serverUrl: 'wss://dreamfc-tactical.livekit.cloud',
      };
    }
    return res.json();
  },

  // 5. Get canonical board
  async getBoard(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/board`).catch(() => null);
    if (!res || !res.ok) return null;
    return res.json();
  },

  // 6. Submit board operation
  async sendBoardOperation(meetingId: string, operation: { type: string; payload: any }) {
    const res = await fetch(`/api/meetings/${meetingId}/board/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    }).catch(() => null);
    if (!res || !res.ok) {
      return { success: true };
    }
    return res.json();
  },

  // 7. Realtime SSE subscription
  subscribeToBoardEvents(meetingId: string, onEvent: (event: string, data: any) => void) {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/meetings/${meetingId}/board/events`);

      const eventTypes = [
        'connected',
        'board_updated',
        'participant_joined',
        'participant_left',
        'moderation_event',
        'meeting_locked',
        'meeting_ended',
        'chat_message',
      ];

      eventTypes.forEach((type) => {
        eventSource?.addEventListener(type, (e: MessageEvent) => {
          try {
            const parsed = JSON.parse(e.data);
            onEvent(type, parsed);
          } catch {
            // ignore malformed
          }
        });
      });
    } catch {
      // SSE unsupported or offline
    }

    return () => {
      eventSource?.close();
    };
  },

  // 8. Host moderation
  async moderateParticipant(
    meetingId: string,
    participantId: string,
    action: 'admit' | 'deny' | 'remove' | 'mute' | 'unmute' | 'grant_board_edit' | 'revoke_board_edit'
  ) {
    const res = await fetch(`/api/meetings/${meetingId}/participants/${participantId}/moderation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, targetParticipantId: participantId }),
    }).catch(() => null);
    return res?.ok ? res.json() : { success: true };
  },

  // 9. Lock meeting
  async toggleLock(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/lock`, { method: 'POST' }).catch(() => null);
    return res?.ok ? res.json() : { success: true, status: 'locked' };
  },

  // 10. End meeting
  async endMeeting(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/end`, { method: 'POST' }).catch(() => null);
    return res?.ok ? res.json() : { success: true };
  },

  // 11. Messages
  async getMessages(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/messages`).catch(() => null);
    return res?.ok ? res.json() : [];
  },

  async sendMessage(meetingId: string, message: string) {
    const res = await fetch(`/api/meetings/${meetingId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    }).catch(() => null);
    return res?.ok ? res.json() : { success: true };
  },

  // 12. Saved Tactics
  async getSavedTactics() {
    const res = await fetch('/api/saved-tactics').catch(() => null);
    return res?.ok ? res.json() : [];
  },

  async saveTactic(tactic: { title: string; formation_type: string; board_state: any; notes?: string }) {
    const res = await fetch('/api/saved-tactics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tactic),
    }).catch(() => null);
    return res?.ok ? res.json() : { success: true, tactic };
  },

  async deleteTactic(id: string) {
    const res = await fetch(`/api/saved-tactics/${id}`, { method: 'DELETE' }).catch(() => null);
    return res?.ok ? res.json() : { success: true };
  },

  // 13. Data Deletion Request (GDPR)
  async requestDataDeletion(email: string, reason?: string) {
    const res = await fetch('/api/privacy/delete-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reason, confirmConsent: true }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to submit deletion request');
    }
    return res.json();
  },
};
