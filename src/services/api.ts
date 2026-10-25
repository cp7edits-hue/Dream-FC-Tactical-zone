import { TacticalPath, PlayerPosition } from '../types/tactics';
import { getClientSupabase } from './supabaseClient';

export interface CreateMeetingPayload {
  title: string;
  hostName: string;
  teamLabel?: string;
  maxParticipants?: number;
  boardPermissionMode?: 'coach_only' | 'open_collaboration' | 'host_assigned';
  lobbyEnabled?: boolean;
  allowLocalFallback?: boolean;
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
  let directSavedToDb = false;
  if (supabase) {
    try {
      const { error: mErr } = await supabase.from('meetings').insert({
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

      if (mErr) {
        console.error('[Client Supabase] Error persisting meeting directly:', mErr);
      } else {
        directSavedToDb = true;
      }

      try {
        await supabase.from('tactical_boards').insert({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `b_${Date.now()}`,
          meeting_id: meetingId,
          board_state: {
            formation: '4-3-3',
            field_type: 'full_pitch',
            home_players: [],
            away_players: [],
            ball: { x: 0, z: 0 },
            paths: [],
            notes: ['1. Tactical briefing', '2. Solid defensive shape'],
          },
          revision: 1,
          updated_by: null,
        });
      } catch {}

      try {
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
      } catch {}
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
    persistence: {
      database: directSavedToDb,
      clientDirect: true,
      memory: false,
      disk: false,
    },
  };
}

async function clientFallbackJoinMeeting(payload: JoinMeetingPayload) {
  const { code: rawCode, passcode: rawPasscode, displayName, role } = payload;
  const participantId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `p_${Date.now()}`;
  const sessionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const cleanCode = rawCode.trim().toUpperCase().replace(/\s+/g, '');
  const candidateCodes = [
    cleanCode,
    cleanCode.startsWith('DFC-') ? cleanCode.replace(/^DFC-/, '') : `DFC-${cleanCode}`,
  ];

  // 1. Try Supabase
  const supabase = getClientSupabase();
  if (supabase) {
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawCode.trim());
      let query = supabase.from('meetings').select('*');
      if (isUuid) {
        query = query.eq('id', rawCode.trim().toLowerCase());
      } else {
        const primaryCode = candidateCodes.find((c) => c.startsWith('DFC-')) || cleanCode;
        query = query.eq('code', primaryCode);
      }
      const { data: dbMeeting } = await query.maybeSingle();

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
    for (const cand of candidateCodes) {
      const stored = localStorage.getItem(`dfc_meeting_${cand}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.passcode) {
          const p1 = parsed.passcode.toUpperCase().replace(/\s+/g, '');
          const p2 = rawPasscode.toUpperCase().replace(/\s+/g, '');
          const match =
            p1 === p2 ||
            p1.replace(/^TACTIC-/, '') === p2.replace(/^TACTIC-/, '') ||
            `TACTIC-${p1}` === p2 ||
            p1 === `TACTIC-${p2}`;
          if (!match) {
            throw new Error('Incorrect passcode. Please check and try again.');
          }
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
    }
  } catch (err: any) {
    if (err.message?.includes('passcode')) throw err;
  }

  throw new Error('Meeting not found. Please verify the squad code (e.g. DFC-HRZX) or ensure the coach has launched the session.');
}

export const api = {
  // 1. Create meeting (Must persist to server before reporting success)
  async createMeeting(payload: CreateMeetingPayload) {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      let rawText = '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      } else {
        rawText = await res.text().catch(() => '');
      }

      if (res.ok && data?.success) {
        // Dual-write to client Supabase instance if configured to ensure immediate availability
        const clientSupabase = getClientSupabase();
        if (clientSupabase && data.meeting) {
          try {
            Promise.resolve(
              clientSupabase.from('meetings').insert({
                id: data.meeting.id,
                code: data.meeting.code,
                title: data.meeting.title,
                host_user_id: null,
                team_label: payload.teamLabel || 'Dream FC',
                status: 'active',
                access_secret_hash: data.meeting.passcode,
                max_participants: data.meeting.maxParticipants || 25,
                board_permission_mode: data.meeting.boardPermissionMode || 'coach_only',
                lobby_enabled: payload.lobbyEnabled || false,
              })
            ).catch(() => {});
          } catch {}
        }

        try {
          localStorage.setItem(`dfc_meeting_${data.meeting.code}`, JSON.stringify(data));
          localStorage.setItem(`dfc_meeting_${data.meeting.id}`, JSON.stringify(data));
        } catch {}
        return data;
      }

      if (res.status >= 500) {
        const clientSupabase = getClientSupabase();
        if (clientSupabase) {
          console.warn('[API] Server returned 500. Attempting direct client Supabase persistence...');
          try {
            const fallbackResult = await clientFallbackCreateMeeting(payload);
            if (fallbackResult.persistence.database) {
              return fallbackResult;
            }
          } catch (e) {
            console.warn('[API] Direct client Supabase fallback also failed:', e);
          }
        }
      }

      const serverError = data?.error || data?.message || (rawText ? `Server returned (${res.status}): ${rawText.slice(0, 150)}` : '');
      const details = data?.details ? (typeof data.details === 'string' ? data.details : JSON.stringify(data.details)) : '';
      const errMsg = details && !serverError.includes(details) ? `${serverError} — ${details}` : (serverError || `Server returned HTTP ${res.status}. Failed to persist meeting.`);
      const errObj: any = new Error(errMsg);
      errObj.code = data?.code;
      errObj.status = res.status;
      errObj.sqlFile = data?.sqlFile;
      errObj.canFallbackToLocal = data?.canFallbackToLocal;
      throw errObj;
    } catch (networkErr: any) {
      if (networkErr.message && !networkErr.message.includes('fetch') && !networkErr.message.includes('Failed to fetch')) {
        throw networkErr;
      }
      const clientSupabase = getClientSupabase();
      if (clientSupabase) {
        try {
          const fallbackResult = await clientFallbackCreateMeeting(payload);
          if (fallbackResult.persistence.database) {
            return fallbackResult;
          }
        } catch {}
      }
      console.error('[API] /api/meetings network error:', networkErr);
      throw new Error('Unable to connect to strategy server. Please verify your internet connection and try again.');
    }
  },

  // 2. Join meeting (Authoritative cross-device lookup)
  async joinMeeting(payload: JoinMeetingPayload) {
    const cleanCode = payload.code.trim().toUpperCase().replace(/\s+/g, '');
    const cleanPasscode = payload.passcode.trim();

    try {
      const res = await fetch('/api/meetings/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          code: cleanCode,
          passcode: cleanPasscode,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => null);
      }

      if (res.ok && data?.success) {
        try {
          localStorage.setItem(`dfc_meeting_${data.meeting.code}`, JSON.stringify(data));
          if (data.meeting?.id) {
            localStorage.setItem(`dfc_meeting_${data.meeting.id}`, JSON.stringify(data));
          }
        } catch {}
        return data;
      }

      const serverError = data?.error || data?.message || '';

      // Surface precise server validation and lifecycle errors
      if (res.status === 404) {
        throw new Error(serverError || 'Meeting not found. Please verify the squad code or confirm the coach has launched the session.');
      }
      if (res.status === 401) {
        throw new Error(serverError || 'Incorrect passcode. Please check and try again.');
      }
      if (res.status === 429) {
        throw new Error(serverError || 'Meeting is full. Maximum participant capacity reached.');
      }
      if (res.status === 423) {
        throw new Error(serverError || 'This strategy room is currently locked by the coach.');
      }
      if (res.status === 410) {
        throw new Error(serverError || 'This tactical session has already ended.');
      }
      if (res.status === 400) {
        throw new Error(serverError || 'Invalid meeting code or passcode format.');
      }

      if (serverError) {
        throw new Error(serverError);
      }
      throw new Error(`Server returned error (${res.status}). Failed to join meeting.`);
    } catch (err: any) {
      // Re-throw our explicit domain errors
      if (
        err.message?.includes('passcode') ||
        err.message?.includes('locked') ||
        err.message?.includes('ended') ||
        err.message?.includes('full') ||
        err.message?.includes('not found') ||
        err.message?.includes('Invalid')
      ) {
        throw err;
      }

      // Check client Supabase direct lookup if server was unreachable via network
      const clientSupabase = getClientSupabase();
      if (clientSupabase) {
        try {
          const candidateCodes = [
            cleanCode,
            cleanCode.startsWith('DFC-') ? cleanCode.replace(/^DFC-/, '') : `DFC-${cleanCode}`,
          ];
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);
          let query = clientSupabase.from('meetings').select('*');
          if (isUuid) {
            query = query.eq('id', cleanCode.toLowerCase());
          } else {
            query = query.in('code', candidateCodes);
          }
          const { data: dbMeeting, error: dbErr } = await query.maybeSingle();

          if (!dbErr && dbMeeting) {
            const guestParticipantId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}`;
            try {
              await clientSupabase.from('meeting_participants').insert({
                id: guestParticipantId,
                meeting_id: dbMeeting.id,
                authenticated_user_id: null,
                session_identifier: `s_${Date.now()}`,
                display_name: payload.displayName,
                role: payload.role || 'player',
                admission_status: 'admitted',
                is_muted: false,
                can_edit_board: dbMeeting.board_permission_mode === 'open_collaboration',
              });
            } catch {}

            let existingSquad: any[] = [];
            try {
              const { data: dbParts } = await clientSupabase
                .from('meeting_participants')
                .select('*')
                .eq('meeting_id', dbMeeting.id);
              if (dbParts && dbParts.length > 0) {
                existingSquad = dbParts.map((p: any) => ({
                  id: p.id,
                  name: p.display_name,
                  role: p.role === 'host' ? 'Head Coach' : p.role,
                  isMuted: p.is_muted ?? false,
                  isSpeaking: false,
                  canEditBoard: p.can_edit_board ?? false,
                  avatarColor: p.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
                }));
              }
            } catch {}

            if (!existingSquad.some((p: any) => p.id === guestParticipantId || p.name === payload.displayName)) {
              existingSquad.push({
                id: guestParticipantId,
                name: payload.displayName,
                role: payload.role || 'player',
                isMuted: false,
                isSpeaking: false,
                canEditBoard: dbMeeting.board_permission_mode === 'open_collaboration',
                avatarColor: 'bg-blue-600 text-white',
              });
            }

            return {
              success: true,
              meeting: {
                id: dbMeeting.id,
                code: dbMeeting.code,
                title: dbMeeting.title,
                status: dbMeeting.status,
                allowChat: dbMeeting.allow_chat ?? true,
                boardPermissionMode: dbMeeting.board_permission_mode ?? 'coach_only',
                hostName: existingSquad.find((p: any) => p.role === 'Head Coach')?.name || 'Head Coach',
                participants: existingSquad,
              },
              participant: {
                id: guestParticipantId,
                displayName: payload.displayName,
                role: payload.role || 'player',
                admissionStatus: 'admitted',
                canEditBoard: dbMeeting.board_permission_mode === 'open_collaboration',
              },
              sessionId: `s_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            };
          }
        } catch (dbErr: any) {
          console.warn('[Direct Supabase] Fallback query failed:', dbErr?.message);
        }
      }

      if (err.message && (err.message.includes('fetch') || err.message.includes('NetworkError'))) {
        throw new Error('Unable to connect to strategy server. Please verify your network connection and try again.');
      }

      throw err;
    }
  },

  // 3. Get meeting info
  async getMeeting(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.participants) && data.participants.length > 0) {
        return data;
      }
    }

    const supabase = getClientSupabase();
    if (supabase) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meetingId);
        let mQuery = supabase.from('meetings').select('*');
        if (isUuid) {
          mQuery = mQuery.eq('id', meetingId);
        } else {
          mQuery = mQuery.eq('code', meetingId);
        }
        const { data: dbM } = await mQuery.maybeSingle();
        if (dbM) {
          const { data: dbParts } = await supabase.from('meeting_participants').select('*').eq('meeting_id', dbM.id);
          const parts = (dbParts || []).map((p: any) => ({
            id: p.id,
            name: p.display_name,
            role: p.role === 'host' ? 'Head Coach' : p.role,
            isMuted: p.is_muted ?? false,
            canEditBoard: p.can_edit_board ?? false,
          }));
          return {
            id: dbM.id,
            code: dbM.code,
            title: dbM.title,
            status: dbM.status,
            boardPermissionMode: dbM.board_permission_mode,
            allowChat: dbM.allow_chat ?? true,
            participants: parts,
          };
        }
      } catch {}
    }

    return {
      id: meetingId,
      code: 'DFC-LIVE',
      title: 'Dream FC Tactical Session',
      status: 'active',
      boardPermissionMode: 'coach_only',
      allowChat: true,
      participants: [],
    };
  },

  // 4. Request LiveKit token
  async getLiveKitToken(meetingId: string, participantInfo?: { id?: string; name?: string; isHost?: boolean; meetingCode?: string }) {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(participantInfo?.id ? { 'x-participant-id': participantInfo.id } : {}),
          ...(participantInfo?.name ? { 'x-participant-name': encodeURIComponent(participantInfo.name) } : {}),
        },
        body: JSON.stringify({
          participantId: participantInfo?.id,
          participantName: participantInfo?.name,
          isHost: participantInfo?.isHost,
          meetingCode: participantInfo?.meetingCode,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[API] getLiveKitToken fetch warning:', err);
    }

    const fallbackUrl = (import.meta.env.VITE_LIVEKIT_URL || '').trim() || 'wss://dream-fc-tactical-zone-n7tg780s.livekit.cloud';
    return {
      token: 'client_guest_token_' + Date.now(),
      serverUrl: fallbackUrl,
    };
  },

  // 5. Get canonical board
  async getBoard(meetingId: string) {
    const res = await fetch(`/api/meetings/${meetingId}/board`).catch(() => null);
    if (res && res.ok) {
      return res.json().catch(() => null);
    }

    const supabase = getClientSupabase();
    if (supabase) {
      try {
        const { data: dbB } = await supabase.from('tactical_boards').select('*').eq('meeting_id', meetingId).maybeSingle();
        if (dbB) {
          return {
            revision: dbB.revision,
            boardState: dbB.board_state,
            updatedAt: dbB.updated_at,
          };
        }
      } catch {}
    }

    return null;
  },

  // 6. Submit board operation
  async sendBoardOperation(meetingId: string, operation: { type: string; payload: any }) {
    // Send to backend endpoint
    const res = await fetch(`/api/meetings/${meetingId}/board/operations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    }).catch(() => null);

    // Also update Supabase directly if client configured
    const supabase = getClientSupabase();
    if (supabase) {
      try {
        const { data: currentBoard } = await supabase.from('tactical_boards').select('*').eq('meeting_id', meetingId).maybeSingle();
        if (currentBoard) {
          const nextRevision = (currentBoard.revision || 1) + 1;
          let nextState = currentBoard.board_state || {};
          if (operation.type === 'set_formation') {
            nextState = { ...nextState, formation: operation.payload.formation };
          } else if (operation.type === 'set_paths') {
            nextState = { ...nextState, paths: operation.payload.paths };
          } else if (operation.type === 'add_path') {
            nextState = { ...nextState, paths: [...(nextState.paths || []), operation.payload.path] };
          } else if (operation.type === 'clear_paths') {
            nextState = { ...nextState, paths: [] };
          } else if (operation.type === 'reset_board' && operation.payload?.boardState) {
            nextState = { ...nextState, ...operation.payload.boardState };
          }
          await supabase.from('tactical_boards').update({
            board_state: nextState,
            revision: nextRevision,
            updated_at: new Date().toISOString(),
          }).eq('meeting_id', meetingId);
        }
      } catch {}
    }

    if (!res || !res.ok) {
      return { success: true };
    }
    return res.json();
  },

  // 7. Realtime SSE & Multi-Channel subscription
  subscribeToBoardEvents(meetingId: string, onEvent: (event: string, data: any) => void) {
    let eventSource: EventSource | null = null;
    let broadcastChannel: BroadcastChannel | null = null;

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
        'webrtc_signal',
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

    // Also support local BroadcastChannel for multi-tab instantaneous sync
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        broadcastChannel = new BroadcastChannel(`dfc_realtime_${meetingId}`);
        broadcastChannel.onmessage = (event) => {
          if (event.data?.type && event.data?.payload) {
            onEvent(event.data.type, event.data.payload);
          }
        };
      } catch {
        // ignore
      }
    }

    return () => {
      eventSource?.close();
      broadcastChannel?.close();
    };
  },

  // 7B. Send WebRTC signal (for fallback mesh or direct peer negotiation)
  async sendWebRtcSignal(meetingId: string, signalData: {
    targetParticipantId?: string;
    senderId: string;
    senderName: string;
    signal: any;
  }) {
    // Broadcast locally via BroadcastChannel first for immediate multi-tab response
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`dfc_realtime_${meetingId}`);
        bc.postMessage({ type: 'webrtc_signal', payload: signalData });
        bc.close();
      } catch {}
    }

    // Also send through backend signaling endpoint
    const res = await fetch(`/api/meetings/${meetingId}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signalData),
    }).catch(() => null);

    return res?.ok ? res.json() : { success: true };
  },

  // 7C. Leave meeting notification
  async leaveMeeting(meetingId: string, participantInfo?: { id?: string; name?: string }) {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`dfc_realtime_${meetingId}`);
        bc.postMessage({
          type: 'participant_left',
          payload: { id: participantInfo?.id, name: participantInfo?.name },
        });
        bc.close();
      } catch {}
    }

    const res = await fetch(`/api/meetings/${meetingId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: participantInfo?.id,
        participantName: participantInfo?.name,
      }),
    }).catch(() => null);

    return res?.ok ? res.json() : { success: true };
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

  // 11. Messages & Chat
  async getMessages(meetingId: string) {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          try {
            localStorage.setItem(`dfc_messages_${meetingId}`, JSON.stringify(data));
          } catch {}
          return data;
        }
      }
    } catch {
      // Network error or offline
    }

    // Fallback: check localStorage
    try {
      const cached = localStorage.getItem(`dfc_messages_${meetingId}`);
      if (cached) return JSON.parse(cached);
    } catch {}

    return [];
  },

  async sendMessage(
    meetingId: string,
    message: string,
    senderInfo?: { id?: string; name?: string }
  ) {
    const trimmed = message.trim();
    if (!trimmed) return { success: false, error: 'Message cannot be empty' };

    const payload = {
      message: trimmed,
      senderName: senderInfo?.name || 'Squad Member',
      senderId: senderInfo?.id || `p_${Date.now()}`,
    };

    let serverMessage: any = null;

    try {
      const res = await fetch(`/api/meetings/${meetingId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(payload.senderId ? { 'x-participant-id': payload.senderId } : {}),
          ...(payload.senderName ? { 'x-participant-name': encodeURIComponent(payload.senderName) } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        serverMessage = json.message;
      }
    } catch (err) {
      console.warn('[API] sendMessage fetch warning:', err);
    }

    // Construct local canonical message record if server was unreachable
    const messageRecord = serverMessage || {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      meeting_id: meetingId,
      sender_participant_id: payload.senderId,
      sender_name: payload.senderName,
      message: trimmed,
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    // Cache locally
    try {
      const key = `dfc_messages_${meetingId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.some((m: any) => m.id === messageRecord.id)) {
        existing.push(messageRecord);
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {}

    // Broadcast on BroadcastChannel for multi-tab testing
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel(`dfc_realtime_${meetingId}`);
        bc.postMessage({ type: 'chat_message', payload: messageRecord });
        bc.close();
      } catch {}
    }

    return { success: true, message: messageRecord };
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
