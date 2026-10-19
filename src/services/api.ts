import { TacticalPath, PlayerPosition } from '../types/tactics';

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

export const api = {
  // 1. Create meeting
  async createMeeting(payload: CreateMeetingPayload) {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create meeting');
    }
    return res.json();
  },

  // 2. Join meeting
  async joinMeeting(payload: JoinMeetingPayload) {
    const res = await fetch('/api/meetings/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to join meeting');
    }
    return res.json();
  },

  // 3. Get meeting info
  async getMeeting(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}`);
    if (!res.ok) throw new Error('Meeting not found');
    return res.json();
  },

  // 4. Request LiveKit token
  async getLiveKitToken(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/token`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to obtain media token');
    return res.json();
  },

  // 5. Get canonical board
  async getBoard(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/board`);
    if (!res.ok) throw new Error('Failed to load board state');
    return res.json();
  },

  // 6. Submit board operation
  async sendBoardOperation(meetingId: string, operation: { type: string; payload: any }) {
    const res = await fetch(`/api/meetings/${meetingId}/board/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Operation failed');
    }
    return res.json();
  },

  // 7. Realtime SSE subscription
  subscribeToBoardEvents(meetingId: string, onEvent: (event: string, data: any) => void) {
    const eventSource = new EventSource(`/api/meetings/${meetingId}/board/events`);

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
      eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data);
          onEvent(type, parsed);
        } catch {
          // ignore malformed
        }
      });
    });

    return () => {
      eventSource.close();
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
    });
    if (!res.ok) throw new Error('Moderation action failed');
    return res.json();
  },

  // 9. Lock meeting
  async toggleLock(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/lock`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to toggle meeting lock');
    return res.json();
  },

  // 10. End meeting
  async endMeeting(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/end`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to end meeting');
    return res.json();
  },

  // 11. Messages
  async getMessages(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/messages`);
    return res.json();
  },

  async sendMessage(meetingId: string, message: string) {
    const res = await fetch(`/api/meetings/${meetingId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  // 12. Saved Tactics
  async getSavedTactics() {
    const res = await fetch('/api/saved-tactics');
    return res.json();
  },

  async saveTactic(tactic: { title: string; formation_type: string; board_state: any; notes?: string }) {
    const res = await fetch('/api/saved-tactics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tactic),
    });
    if (!res.ok) throw new Error('Failed to save tactic');
    return res.json();
  },

  async deleteTactic(id: string) {
    const res = await fetch(`/api/saved-tactics/${id}`, { method: 'DELETE' });
    return res.json();
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
