import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import {
  createMeetingSchema,
  joinMeetingSchema,
  boardOperationSchema,
  moderationSchema,
  chatMessageSchema,
  savedTacticSchema,
  privacyDeletionSchema,
  contactSchema,
} from './validation';
import {
  hashPasscode,
  verifyPasscode,
  generateMeetingCode,
  generatePasscode,
  generateSessionIdentifier,
  sanitizeHtml,
} from './crypto';
import { generateLiveKitToken } from './livekit';
import { store } from './store';
import { FORMATIONS } from '../constants/formations';
import { PRESET_DRILLS } from '../constants/drills';
import { getSupabase } from './supabase';

export const apiRouter = Router();

// Helper to authenticate request by session cookie or bearer token
function getSessionParticipant(req: Request) {
  const sessionId = req.cookies?.dfc_session || (req.headers['x-session-id'] as string);
  if (!sessionId) return null;
  return store.getParticipantBySession(sessionId);
}

// -----------------------------------------------------------------------------
// 1. CREATE MEETING (Host Coach)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = createMeetingSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid meeting parameters', details: parseResult.error.format() });
      return;
    }

    const { title, hostName, teamLabel, maxParticipants, boardPermissionMode, lobbyEnabled, allowChat } = parseResult.data;

    const meetingId = crypto.randomUUID();
    const code = generateMeetingCode();
    const passcode = generatePasscode();
    const accessSecretHash = await hashPasscode(passcode);
    const hostUserId = crypto.randomUUID();
    const hostSessionId = generateSessionIdentifier();

    const meetingRecord = {
      id: meetingId,
      code,
      title,
      host_user_id: hostUserId,
      team_label: teamLabel,
      status: 'active' as const,
      access_secret_hash: accessSecretHash,
      max_participants: maxParticipants,
      board_permission_mode: boardPermissionMode,
      allow_chat: allowChat,
      lobby_enabled: lobbyEnabled,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    };

    // Initial canonical tactical board state (4-3-3 formation preset)
    const initialBoardState = {
      formation: '4-3-3',
      field_type: 'full_pitch',
      home_players: FORMATIONS['4-3-3'].positions.map((p, idx) => ({
        id: `home_${idx + 1}`,
        number: p.number,
        name: p.name,
        role: p.role,
        team: 'home',
        position: { x: p.x, z: p.z },
      })),
      away_players: FORMATIONS['4-3-3'].positions.map((p, idx) => ({
        id: `away_${idx + 1}`,
        number: idx + 1,
        name: `Away ${idx + 1}`,
        role: p.role,
        team: 'away',
        position: { x: -p.x, z: -p.z },
      })),
      ball: { x: 0, z: 0 },
      paths: PRESET_DRILLS[0].paths,
      notes: [
        '1. Maintain compact 4-3-3 shape during opponent build-up',
        '2. Overload right half-space to isolate winger',
        '3. Immediate counter-press within 5 seconds of loss',
      ],
    };

    const boardRecord = {
      id: crypto.randomUUID(),
      meeting_id: meetingId,
      board_state: initialBoardState,
      revision: 1,
      updated_by: hostUserId,
      updated_at: new Date().toISOString(),
    };

    // Host participant record
    const hostParticipantId = crypto.randomUUID();
    const hostParticipant = {
      id: hostParticipantId,
      meeting_id: meetingId,
      authenticated_user_id: hostUserId,
      session_identifier: hostSessionId,
      display_name: hostName,
      role: 'host' as const,
      admission_status: 'admitted' as const,
      is_muted: false,
      can_edit_board: true,
      joined_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    // Store records in memory
    store.meetings.set(meetingId, meetingRecord);
    store.meetingsByCode.set(code, meetingId);
    store.boards.set(meetingId, boardRecord);
    store.participants.set(hostParticipantId, hostParticipant);
    store.messages.set(meetingId, []);

    // Persist to Supabase if configured (asynchronous with safe null foreign keys)
    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error: mErr } = await supabase.from('meetings').insert({
          id: meetingId,
          code,
          title,
          host_user_id: null, // Allow guest/coach creation without auth.users FK violation
          team_label: teamLabel,
          status: 'active',
          access_secret_hash: accessSecretHash,
          max_participants: maxParticipants,
          board_permission_mode: boardPermissionMode,
          allow_chat: allowChat,
          lobby_enabled: lobbyEnabled,
        });
        if (mErr) {
          console.warn('[Supabase] Warning on meetings insert:', mErr.message);
        }

        const { error: bErr } = await supabase.from('tactical_boards').insert({
          id: boardRecord.id,
          meeting_id: meetingId,
          board_state: initialBoardState,
          revision: 1,
          updated_by: null,
        });
        if (bErr) {
          console.warn('[Supabase] Warning on tactical_boards insert:', bErr.message);
        }

        const { error: pErr } = await supabase.from('meeting_participants').insert({
          id: hostParticipantId,
          meeting_id: meetingId,
          authenticated_user_id: null,
          session_identifier: hostSessionId,
          display_name: hostName,
          role: 'host',
          admission_status: 'admitted',
          is_muted: false,
          can_edit_board: true,
        });
        if (pErr) {
          console.warn('[Supabase] Warning on meeting_participants insert:', pErr.message);
        }
      } catch (dbErr: any) {
        console.warn('[Supabase] Persistence warning (in-memory remains authoritative):', dbErr?.message);
      }
    }

    // Set secure HTTP-only cookie
    res.cookie('dfc_session', hostSessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    });

    res.status(201).json({
      success: true,
      meeting: {
        id: meetingId,
        code,
        title,
        passcode, // One-time display for host
        boardPermissionMode,
        maxParticipants,
      },
      participant: {
        id: hostParticipantId,
        displayName: hostName,
        role: 'host',
        canEditBoard: true,
      },
      sessionId: hostSessionId,
    });
  } catch (err: any) {
    console.error('[API /meetings] Error during meeting creation:', err);
    res.status(500).json({
      error: err?.message || 'Failed to create meeting',
      details: String(err?.stack || err),
    });
  }
});

// -----------------------------------------------------------------------------
// 2. JOIN MEETING (Player / Squad Member)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/join', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = joinMeetingSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Invalid join credentials', details: parseResult.error.format() });
      return;
    }

    const { code, passcode, displayName, role } = parseResult.data;

    let meetingId = store.meetingsByCode.get(code);
    let meeting = meetingId ? store.meetings.get(meetingId) : null;

    const supabase = getSupabase();
    if (!meeting && supabase) {
      try {
        const { data: dbMeeting } = await supabase
          .from('meetings')
          .select('*')
          .eq('code', code)
          .maybeSingle();

        if (dbMeeting) {
          meetingId = dbMeeting.id;
          meeting = dbMeeting;
          store.meetings.set(dbMeeting.id, dbMeeting);
          store.meetingsByCode.set(code, dbMeeting.id);

          const { data: dbBoard } = await supabase
            .from('tactical_boards')
            .select('*')
            .eq('meeting_id', dbMeeting.id)
            .maybeSingle();

          if (dbBoard) {
            store.boards.set(dbMeeting.id, dbBoard);
          }
        }
      } catch (dbErr: any) {
        console.warn('[Supabase] Query warning looking up meeting:', dbErr?.message);
      }
    }

    if (!meeting || !meetingId) {
      res.status(404).json({ error: 'Meeting not found. Please verify meeting code.' });
      return;
    }

    if (meeting.status === 'ended') {
      res.status(410).json({ error: 'This tactical session has already ended.' });
      return;
    }

    if (meeting.status === 'locked') {
      res.status(423).json({ error: 'This meeting is locked by the host coach.' });
      return;
    }

    // Passcode verification using bcrypt
    const isPasscodeValid = await verifyPasscode(passcode, meeting.access_secret_hash);
    if (!isPasscodeValid) {
      res.status(401).json({ error: 'Incorrect passcode. Please check and try again.' });
      return;
    }

    // Check capacity
    const activeParticipants = store.getMeetingParticipants(meetingId);
    if (activeParticipants.length >= meeting.max_participants) {
      res.status(429).json({ error: 'Meeting is full. Maximum participant capacity reached.' });
      return;
    }

    const sessionId = generateSessionIdentifier();
    const participantId = crypto.randomUUID();

    const admissionStatus = meeting.lobby_enabled ? ('waiting_lobby' as const) : ('admitted' as const);

    const participant = {
      id: participantId,
      meeting_id: meetingId,
      session_identifier: sessionId,
      display_name: displayName,
      role: role === 'collaborator' ? ('collaborator' as const) : ('player' as const),
      admission_status: admissionStatus,
      is_muted: false,
      can_edit_board: meeting.board_permission_mode === 'open_collaboration',
      joined_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    };

    store.participants.set(participantId, participant);

    if (supabase) {
      try {
        await supabase.from('meeting_participants').insert({
          id: participantId,
          meeting_id: meetingId,
          authenticated_user_id: null,
          session_identifier: sessionId,
          display_name: displayName,
          role: participant.role,
          admission_status: admissionStatus,
          is_muted: false,
          can_edit_board: participant.can_edit_board,
        });
      } catch (pErr: any) {
        console.warn('[Supabase] Warning writing participant:', pErr?.message);
      }
    }

    // Set cookie
    res.cookie('dfc_session', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    // Gather all current participants in the meeting (host + any previously joined members)
    let existingParticipants = store.getMeetingParticipants(meetingId).map((p) => ({
      id: p.id,
      name: p.display_name,
      role: p.role === 'host' ? 'Head Coach' : p.role,
      isMuted: p.is_muted,
      isSpeaking: false,
      canEditBoard: p.can_edit_board,
      avatarColor: p.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
    }));

    if (existingParticipants.length <= 1 && supabase) {
      try {
        const { data: dbParticipants } = await supabase
          .from('meeting_participants')
          .select('*')
          .eq('meeting_id', meetingId);

        if (dbParticipants && dbParticipants.length > 0) {
          existingParticipants = dbParticipants.map((p) => ({
            id: p.id,
            name: p.display_name,
            role: p.role === 'host' ? 'Head Coach' : p.role,
            isMuted: p.is_muted,
            isSpeaking: false,
            canEditBoard: p.can_edit_board,
            avatarColor: p.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
          }));
        }
      } catch (e: any) {
        console.warn('[Supabase] Warning reading participants:', e?.message);
      }
    }

    // Broadcast participant joined to active room
    store.broadcastToMeeting(meetingId, 'participant_joined', {
      id: participantId,
      displayName,
      role: participant.role,
      admissionStatus,
      isMuted: false,
    });

    res.json({
      success: true,
      meeting: {
        id: meeting.id,
        code: meeting.code,
        title: meeting.title,
        status: meeting.status,
        allowChat: meeting.allow_chat,
        boardPermissionMode: meeting.board_permission_mode,
        hostName: existingParticipants.find((p) => p.role === 'Head Coach')?.name || 'Head Coach',
        participants: existingParticipants,
      },
      participant: {
        id: participantId,
        displayName,
        role: participant.role,
        admissionStatus,
        canEditBoard: participant.can_edit_board,
      },
      sessionId,
    });
  } catch (err: any) {
    console.error('[API /meetings/join] Error during join:', err);
    res.status(500).json({ error: err?.message || 'Failed to join meeting' });
  }
});

// -----------------------------------------------------------------------------
// 3. GET MEETING DETAILS
// -----------------------------------------------------------------------------
apiRouter.get('/meetings/:meetingId', async (req: Request, res: Response): Promise<void> => {
  const meetingId = req.params.meetingId;
  let meeting = store.meetings.get(meetingId);
  if (!meeting) {
    const foundId = store.meetingsByCode.get(meetingId);
    if (foundId) {
      meeting = store.meetings.get(foundId);
    }
  }

  const supabase = getSupabase();
  if (!meeting && supabase) {
    try {
      const { data: dbMeeting } = await supabase
        .from('meetings')
        .select('*')
        .or(`id.eq.${meetingId},code.eq.${meetingId}`)
        .maybeSingle();

      if (dbMeeting) {
        meeting = dbMeeting;
        store.meetings.set(dbMeeting.id, dbMeeting);
        store.meetingsByCode.set(dbMeeting.code, dbMeeting.id);
      }
    } catch {}
  }

  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  let participants = store.getMeetingParticipants(meeting.id).map((p) => ({
    id: p.id,
    name: p.display_name,
    role: p.role === 'host' ? 'Head Coach' : p.role,
    admissionStatus: p.admission_status,
    isMuted: p.is_muted,
    canEditBoard: p.can_edit_board,
  }));

  if (participants.length === 0 && supabase) {
    try {
      const { data: dbParticipants } = await supabase
        .from('meeting_participants')
        .select('*')
        .eq('meeting_id', meeting.id);

      if (dbParticipants) {
        participants = dbParticipants.map((p) => ({
          id: p.id,
          name: p.display_name,
          role: p.role === 'host' ? 'Head Coach' : p.role,
          admissionStatus: p.admission_status,
          isMuted: p.is_muted,
          canEditBoard: p.can_edit_board,
        }));
      }
    } catch {}
  }

  res.json({
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    status: meeting.status,
    boardPermissionMode: meeting.board_permission_mode,
    allowChat: meeting.allow_chat,
    hostName: participants.find((p) => p.role === 'Head Coach')?.name || 'Head Coach',
    participants,
  });
});

// -----------------------------------------------------------------------------
// 4. LIVEKIT ACCESS TOKEN (Audio / Video)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/token', async (req: Request, res: Response): Promise<void> => {
  const meetingId = req.params.meetingId;
  const participant = getSessionParticipant(req);
  
  let participantId = participant?.id;
  let participantName = participant?.display_name;
  let isHost = participant?.role === 'host';
  let canPublish = true;

  if (participant) {
    if (participant.meeting_id !== meetingId) {
      res.status(403).json({ error: 'Unauthorized: participant does not belong to this meeting' });
      return;
    }
    canPublish = isHost || !participant.is_muted;
  } else {
    // Fallback: support body / header params for cross-origin or token requests
    participantId = req.body?.participantId || (req.headers['x-participant-id'] as string) || crypto.randomUUID();
    participantName = req.body?.participantName || (req.headers['x-participant-name'] as string) || 'Squad Member';
    isHost = req.body?.isHost === true;
  }

  let meeting = store.meetings.get(meetingId);
  if (!meeting) {
    // Try lookup by code if code was passed as meetingId
    const foundId = store.meetingsByCode.get(meetingId);
    if (foundId) {
      meeting = store.meetings.get(foundId);
    }
  }

  const supabase = getSupabase();
  if (!meeting && supabase) {
    try {
      const { data: dbMeeting } = await supabase
        .from('meetings')
        .select('*')
        .or(`id.eq.${meetingId},code.eq.${meetingId}`)
        .maybeSingle();

      if (dbMeeting) {
        meeting = dbMeeting;
        store.meetings.set(dbMeeting.id, dbMeeting);
        store.meetingsByCode.set(dbMeeting.code, dbMeeting.id);
      }
    } catch (e: any) {
      console.warn('[Supabase] Lookup notice for meeting token:', e?.message);
    }
  }

  if (meeting && meeting.status === 'ended') {
    res.status(410).json({ error: 'Meeting has ended' });
    return;
  }

  // Ensure deterministic room name: all participants for the same meeting use the exact same room
  const normalizedCode = meeting?.code ? meeting.code.toUpperCase().trim() : meetingId.toUpperCase().trim();
  const roomName = `meeting_${normalizedCode}`;

  try {
    const { token, serverUrl } = await generateLiveKitToken({
      roomName,
      participantId: participantId || crypto.randomUUID(),
      participantName: participantName || 'Squad Member',
      isHost,
      canPublish,
    });

    res.json({ token, serverUrl, roomName });
  } catch (err: any) {
    console.error('[API /token] Error generating token:', err);
    res.status(500).json({ error: 'Failed to generate media token' });
  }
});

// -----------------------------------------------------------------------------
// 4B. WEBRTC SIGNALING ENDPOINT (Fallback mesh media transmission)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/signal', (req: Request, res: Response): void => {
  const meetingId = req.params.meetingId;
  const { targetParticipantId, senderId, senderName, signal } = req.body || {};

  store.broadcastToMeeting(meetingId, 'webrtc_signal', {
    targetParticipantId,
    senderId,
    senderName,
    signal,
  });

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 4C. LEAVE MEETING ENDPOINT
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/leave', (req: Request, res: Response): void => {
  const meetingId = req.params.meetingId;
  const participantId = req.body?.participantId || (req.headers['x-participant-id'] as string);
  const participantName = req.body?.participantName || 'Squad Member';

  if (participantId) {
    store.participants.delete(participantId);
  }

  store.broadcastToMeeting(meetingId, 'participant_left', {
    id: participantId,
    name: participantName,
  });

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 5. CANONICAL TACTICAL BOARD STATE
// -----------------------------------------------------------------------------
apiRouter.get('/meetings/:meetingId/board', (req: Request, res: Response): void => {
  const participant = getSessionParticipant(req);
  if (!participant || participant.meeting_id !== req.params.meetingId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const board = store.boards.get(req.params.meetingId);
  if (!board) {
    res.status(404).json({ error: 'Tactical board not found' });
    return;
  }

  res.json({
    revision: board.revision,
    boardState: board.board_state,
    updatedAt: board.updated_at,
  });
});

// -----------------------------------------------------------------------------
// 6. BOARD OPERATIONS (Move marker, set formation, draw path)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/board/operations', (req: Request, res: Response): void => {
  const participant = getSessionParticipant(req);
  if (!participant || participant.meeting_id !== req.params.meetingId) {
    res.status(403).json({ error: 'Unauthorized' });
    return;
  }

  const meeting = store.meetings.get(participant.meeting_id);
  if (!meeting || meeting.status === 'ended') {
    res.status(410).json({ error: 'Meeting has ended' });
    return;
  }

  // Enforce board editing permission
  const canEdit =
    participant.role === 'host' ||
    participant.can_edit_board ||
    meeting.board_permission_mode === 'open_collaboration';

  if (!canEdit) {
    res.status(403).json({ error: 'Permission denied: Board editing restricted to coach.' });
    return;
  }

  const parseResult = boardOperationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid board operation payload', details: parseResult.error.format() });
    return;
  }

  const board = store.boards.get(participant.meeting_id);
  if (!board) {
    res.status(404).json({ error: 'Board not found' });
    return;
  }

  const { type, payload } = parseResult.data;
  const typedPayload = payload as {
    id?: string;
    position?: { x: number; z: number };
    formation?: string;
    path?: any;
    boardState?: any;
  };

  // Apply operation to canonical state
  if (type === 'move_player') {
    const { id, position } = typedPayload;
    if (id && position) {
      const isHome = id.startsWith('home_');
      const playerList = isHome ? board.board_state.home_players : board.board_state.away_players;
      const player = playerList?.find((p: any) => p.id === id);
      if (player) {
        player.position = { x: position.x, z: position.z };
      }
    }
  } else if (type === 'move_ball') {
    if (typedPayload.position) {
      board.board_state.ball = { x: typedPayload.position.x, z: typedPayload.position.z };
    }
  } else if (type === 'set_formation') {
    const fName = typedPayload.formation;
    const template = FORMATIONS[fName as keyof typeof FORMATIONS];
    if (template && fName) {
      board.board_state.formation = fName;
      board.board_state.home_players = template.positions.map((p, idx) => ({
        id: `home_${idx + 1}`,
        number: p.number,
        name: p.name,
        role: p.role,
        team: 'home',
        position: { x: p.x, z: p.z },
      }));
    }
  } else if (type === 'add_path') {
    if (!board.board_state.paths) board.board_state.paths = [];
    board.board_state.paths.push(typedPayload.path);
  } else if (type === 'clear_paths') {
    board.board_state.paths = [];
  } else if (type === 'reset_board') {
    if (typedPayload.boardState) {
      board.board_state = typedPayload.boardState;
    }
  }

  // Advance monotonic revision number
  board.revision += 1;
  board.updated_by = participant.authenticated_user_id || participant.id;
  board.updated_at = new Date().toISOString();

  // Broadcast to all participants via realtime SSE
  store.broadcastToMeeting(meeting.id, 'board_updated', {
    revision: board.revision,
    boardState: board.board_state,
    updatedBy: participant.display_name,
  });

  res.json({
    success: true,
    revision: board.revision,
    boardState: board.board_state,
  });
});

// -----------------------------------------------------------------------------
// 7. REALTIME SSE EVENTS STREAM (Heartbeat, board updates, presence)
// -----------------------------------------------------------------------------
apiRouter.get('/meetings/:meetingId/board/events', (req: Request, res: Response): void => {
  const meetingId = req.params.meetingId;
  const meeting = store.meetings.get(meetingId);
  if (!meeting) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Send initial connection event with latest revision
  const currentBoard = store.boards.get(meetingId);
  res.write(
    `event: connected\ndata: ${JSON.stringify({
      meetingId,
      revision: currentBoard?.revision ?? 1,
      boardState: currentBoard?.board_state,
    })}\n\n`
  );

  store.addSseClient(meetingId, res);

  // Keep-alive heartbeat every 15s
  const interval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(interval);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    store.removeSseClient(meetingId, res);
  });
});

// -----------------------------------------------------------------------------
// 8. HOST MODERATION (Admit, Kick, Mute, Board Edit Toggle)
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/participants/:participantId/moderation', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== 'host') {
    res.status(403).json({ error: 'Forbidden: host authorization required' });
    return;
  }

  const parseResult = moderationSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid moderation action', details: parseResult.error.format() });
    return;
  }

  const { action } = parseResult.data;
  const target = store.participants.get(req.params.participantId);
  if (!target || target.meeting_id !== req.params.meetingId) {
    res.status(404).json({ error: 'Target participant not found in this meeting' });
    return;
  }

  switch (action) {
    case 'admit':
      target.admission_status = 'admitted';
      break;
    case 'deny':
      target.admission_status = 'denied';
      break;
    case 'remove':
      target.admission_status = 'removed';
      break;
    case 'mute':
      target.is_muted = true;
      break;
    case 'unmute':
      target.is_muted = false;
      break;
    case 'grant_board_edit':
      target.can_edit_board = true;
      break;
    case 'revoke_board_edit':
      target.can_edit_board = false;
      break;
  }

  // Broadcast moderation update to room
  store.broadcastToMeeting(req.params.meetingId, 'moderation_event', {
    targetId: target.id,
    action,
    isMuted: target.is_muted,
    canEditBoard: target.can_edit_board,
    admissionStatus: target.admission_status,
  });

  res.json({ success: true, target });
});

// -----------------------------------------------------------------------------
// 9. LOCK / UNLOCK MEETING
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/lock', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== 'host') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const meeting = store.meetings.get(req.params.meetingId);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  meeting.status = meeting.status === 'locked' ? 'active' : 'locked';
  store.broadcastToMeeting(meeting.id, 'meeting_locked', { status: meeting.status });

  res.json({ success: true, status: meeting.status });
});

// -----------------------------------------------------------------------------
// 10. END MEETING FOR ALL
// -----------------------------------------------------------------------------
apiRouter.post('/meetings/:meetingId/end', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  if (!caller || caller.meeting_id !== req.params.meetingId || caller.role !== 'host') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const meeting = store.meetings.get(req.params.meetingId);
  if (!meeting) {
    res.status(404).json({ error: 'Meeting not found' });
    return;
  }

  meeting.status = 'ended';
  meeting.ended_at = new Date().toISOString();

  store.broadcastToMeeting(meeting.id, 'meeting_ended', { message: 'The host coach has ended this tactical briefing.' });

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 11. IN-MEETING MESSAGES & CHAT
// -----------------------------------------------------------------------------
apiRouter.get('/meetings/:meetingId/messages', async (req: Request, res: Response): Promise<void> => {
  const meetingId = req.params.meetingId;
  const memoryMessages = store.messages.get(meetingId) || [];

  // Query Supabase if available
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('meeting_messages')
        .select('*')
        .eq('meeting_id', meetingId)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        const formatted = data.map((m: any) => ({
          id: m.id,
          meeting_id: m.meeting_id,
          sender_participant_id: m.sender_participant_id,
          sender_name: m.sender_name,
          message: m.message,
          created_at: m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
        }));

        // Merge with any memory messages not yet persisted
        const ids = new Set(formatted.map((f: any) => f.id));
        for (const mm of memoryMessages) {
          if (!ids.has(mm.id)) {
            formatted.push(mm);
          }
        }
        res.json(formatted);
        return;
      }
    } catch (dbErr: any) {
      console.warn('[Supabase] Warning reading meeting_messages:', dbErr?.message);
    }
  }

  res.json(memoryMessages);
});

apiRouter.post('/meetings/:meetingId/messages', async (req: Request, res: Response): Promise<void> => {
  const parseResult = chatMessageSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid message', details: parseResult.error.format() });
    return;
  }

  const participant = getSessionParticipant(req);
  const finalSenderName: string =
    participant?.display_name ||
    parseResult.data.senderName ||
    req.body?.senderName ||
    (req.headers['x-participant-name'] as string) ||
    'Squad Member';

  const finalSenderId: string =
    participant?.id ||
    parseResult.data.senderId ||
    req.body?.senderId ||
    (req.headers['x-participant-id'] as string) ||
    crypto.randomUUID();

  const messageRecord = {
    id: crypto.randomUUID(),
    meeting_id: req.params.meetingId,
    sender_participant_id: finalSenderId,
    sender_name: finalSenderName,
    message: sanitizeHtml(parseResult.data.message),
    created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const list = store.messages.get(req.params.meetingId) || [];
  list.push(messageRecord);
  store.messages.set(req.params.meetingId, list);

  // Broadcast to all connected clients via SSE stream
  store.broadcastToMeeting(req.params.meetingId, 'chat_message', messageRecord);

  // Persist to Supabase if available
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase.from('meeting_messages').insert({
        id: messageRecord.id,
        meeting_id: req.params.meetingId,
        sender_participant_id: null, // Allow guest chat without FK violation
        sender_name: messageRecord.sender_name,
        message: messageRecord.message,
      });
    } catch (dbErr: any) {
      console.warn('[Supabase] Warning persisting chat message:', dbErr?.message);
    }
  }

  res.json({ success: true, message: messageRecord });
});

// -----------------------------------------------------------------------------
// 12. SAVED TACTICS LIBRARY
// -----------------------------------------------------------------------------
apiRouter.get('/saved-tactics', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || 'default_coach';
  const tactics = store.savedTactics.get(userId) || [];
  res.json(tactics);
});

apiRouter.post('/saved-tactics', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || 'default_coach';

  const parseResult = savedTacticSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid saved tactic payload', details: parseResult.error.format() });
    return;
  }

  const { title, formation_type, field_type, board_state, notes } = parseResult.data;

  const tacticRecord = {
    id: crypto.randomUUID(),
    owner_user_id: userId,
    title,
    field_type,
    formation_type,
    board_state,
    notes,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const list = store.savedTactics.get(userId) || [];
  list.push(tacticRecord);
  store.savedTactics.set(userId, list);

  res.status(201).json({ success: true, tactic: tacticRecord });
});

apiRouter.delete('/saved-tactics/:id', (req: Request, res: Response): void => {
  const caller = getSessionParticipant(req);
  const userId = caller?.authenticated_user_id || 'default_coach';
  const list = store.savedTactics.get(userId) || [];
  const filtered = list.filter((t) => t.id !== req.params.id);
  store.savedTactics.set(userId, filtered);
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 13. PRIVACY DATA DELETION REQUEST (GDPR / Privacy Compliance)
// -----------------------------------------------------------------------------
apiRouter.post('/privacy/delete-request', (req: Request, res: Response): void => {
  const parseResult = privacyDeletionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid request', details: parseResult.error.format() });
    return;
  }

  const { email, reason } = parseResult.data;
  const requestId = 'DEL-' + crypto.randomInt(100000, 999999);

  store.deletionRequests.set(requestId, {
    email,
    date: new Date().toISOString(),
    reason,
  });

  res.json({
    success: true,
    requestId,
    message:
      'Your data deletion request has been registered. All personal identifiers, meeting records, and cached credentials associated with this email will be purged in accordance with our data retention schedule within 30 days.',
  });
});

// -----------------------------------------------------------------------------
// 14. CONTACT & TECHNICAL SUPPORT
// -----------------------------------------------------------------------------
apiRouter.post('/contact', (req: Request, res: Response): void => {
  const parseResult = contactSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Invalid contact form data', details: parseResult.error.format() });
    return;
  }

  const { name, email, category, subject, message, honeypot } = parseResult.data;

  // Spam detection via honeypot
  if (honeypot && honeypot.length > 0) {
    res.status(400).json({ error: 'Spam detected' });
    return;
  }

  const ticketId = 'DFC-TICKET-' + crypto.randomInt(10000, 99999);

  // Log contact ticket (safe logging without sensitive content exposure)
  console.log(`[Dream FC Support] New inquiry ${ticketId} from ${name} (${email}) - Category: ${category}`);

  res.json({
    success: true,
    ticketId,
    message: 'Your inquiry has been routed to tactical support. We will respond within 1 business day.',
  });
});

