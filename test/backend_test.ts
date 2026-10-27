process.env.NODE_ENV = 'test';
import assert from 'node:assert';
import http from 'node:http';
import { generateMeetingCode, generatePasscode, hashPasscode, verifyPasscode } from '../src/server/crypto';
import { createMeetingSchema, joinMeetingSchema, boardOperationSchema } from '../src/server/validation';
import { generateLiveKitToken } from '../src/server/livekit';
import { app } from '../src/server/app';

async function runTests() {
  console.log('--- RUNNING DREAM FC BACKEND VERIFICATION TESTS ---');

  // Test 1: Crypto passcode hashing and timing-safe verification
  console.log('1. Testing crypto passcode hashing...');
  const passcode = generatePasscode();
  assert(passcode.startsWith('TACTIC-'), 'Passcode should start with TACTIC-');
  const hash = await hashPasscode(passcode);
  const isValid = await verifyPasscode(passcode, hash);
  assert(isValid === true, 'Valid passcode should verify');
  const isInvalid = await verifyPasscode('WRONG-CODE', hash);
  assert(isInvalid === false, 'Invalid passcode should fail');
  console.log('   ✓ Crypto passcode hashing passed');

  // Test 2: Meeting Code generation
  console.log('2. Testing meeting code generator...');
  const code = generateMeetingCode();
  assert(code.startsWith('DFC-'), 'Code should start with DFC-');
  assert(code.length === 8, 'Code should be 8 characters long');
  console.log('   ✓ Meeting code generator passed');

  // Test 3: Zod validation schemas
  console.log('3. Testing Zod input validation schemas...');
  const validCreate = createMeetingSchema.safeParse({
    title: 'Champions League Final Strategy',
    hostName: 'Coach Pep',
    boardPermissionMode: 'coach_only',
  });
  assert(validCreate.success === true, 'Valid create payload should pass');

  const invalidJoin = joinMeetingSchema.safeParse({
    code: '12', // too short
    passcode: '12', // too short
    displayName: '', // empty
  });
  assert(invalidJoin.success === false, 'Invalid join payload should be rejected');
  console.log('   ✓ Schema validation passed');

  // Test 4: LiveKit token issuance with role grants
  console.log('4. Testing LiveKit token generation...');
  const { token, serverUrl } = await generateLiveKitToken({
    roomName: 'meeting_DFC-TEST',
    participantId: 'user_123',
    participantName: 'De Bruyne',
    isHost: false,
    canPublish: true,
  });
  assert(typeof token === 'string' && token.length > 20, 'Token should be a signed JWT');
  assert(typeof serverUrl === 'string', 'Server URL should be present');
  console.log('   ✓ LiveKit token generation passed');

  // Test 5: End-to-end Meeting Creation and Joining via Express App API
  console.log('5. Testing Express API endpoints (POST /api/meetings and POST /api/meetings/join)...');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5A: Create Meeting
    const createRes = await fetch(`${baseUrl}/api/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Tactical Masterclass',
        hostName: 'Coach Pep',
        boardPermissionMode: 'coach_only',
        maxParticipants: 25,
      }),
    });

    assert.strictEqual(createRes.status, 201, `Create meeting should return 201, got ${createRes.status}`);
    const createData = await createRes.json();
    assert(createData.success === true, 'Response should have success: true');
    assert(createData.meeting?.code.startsWith('DFC-'), 'Should return a valid DFC- code');
    assert(createData.meeting?.passcode.startsWith('TACTIC-'), 'Should return a valid TACTIC- passcode');
    assert.strictEqual(createData.participant?.role, 'host', 'Host should have role host');
    assert.strictEqual(createData.participant?.canEditBoard, true, 'Host should have canEditBoard: true');
    console.log(`   ✓ Meeting successfully created: ${createData.meeting.code} (Passcode: ${createData.meeting.passcode})`);

    // 5B: Join Meeting with valid credentials
    const joinRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: createData.meeting.code,
        passcode: createData.meeting.passcode,
        displayName: 'Erling Haaland',
        role: 'player',
      }),
    });

    assert.strictEqual(joinRes.status, 200, `Join meeting should return 200, got ${joinRes.status}`);
    const joinData = await joinRes.json();
    assert(joinData.success === true, 'Join response should have success: true');
    assert.strictEqual(joinData.participant?.displayName, 'Erling Haaland');
    assert.strictEqual(joinData.participant?.role, 'player');
    assert(Array.isArray(joinData.meeting?.participants), 'Join response should include existing participants');
    assert(joinData.meeting.participants.some((p: any) => p.name === 'Coach Pep'), 'Host should be present in participants list');
    console.log('   ✓ Player successfully joined the meeting with full squad list');

    // 5B-2: Join Meeting with RAW 4-character code (without DFC- prefix) and RAW 4-digit passcode (without TACTIC-)
    const rawCode = createData.meeting.code.replace(/^DFC-/, '').toLowerCase();
    const rawPasscode = createData.meeting.passcode.replace(/^TACTIC-/, '');
    const flexibleJoinRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: `  ${rawCode}  `, // tests whitespace trimming and raw code normalization
        passcode: rawPasscode, // tests raw 4-digit passcode normalization
        displayName: 'Bukayo Saka',
        role: 'player',
      }),
    });
    assert.strictEqual(flexibleJoinRes.status, 200, `Flexible join should return 200, got ${flexibleJoinRes.status}`);
    const flexData = await flexibleJoinRes.json();
    assert.strictEqual(flexData.meeting.code, createData.meeting.code);
    console.log(`   ✓ Player successfully joined using raw code "${rawCode}" and raw passcode "${rawPasscode}"`);

    // 5B-3: Board operation test for pass sequence and simulation
    const boardOpRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_paths',
          payload: {
            paths: [
              {
                id: 'pass_1',
                type: 'pass',
                points: [{ x: 0, z: 0 }, { x: 10, z: -10 }],
                order: 1,
                fromPlayerName: 'De Bruyne',
                toPlayerName: 'Haaland',
              },
            ],
          },
        },
      }),
    });
    assert.strictEqual(boardOpRes.status, 200, `Board set_paths should succeed, got ${boardOpRes.status}`);
    console.log('   ✓ Board operation set_paths verified');

    // 5C: Join Meeting with invalid passcode
    const invalidJoinRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: createData.meeting.code,
        passcode: 'TACTIC-0000',
        displayName: 'Imposter',
        role: 'player',
      }),
    });
    assert.strictEqual(invalidJoinRes.status, 401, 'Invalid passcode should return 401');
    const invalidData = await invalidJoinRes.json();
    assert.strictEqual(invalidData.code, 'INVALID_PASSCODE');
    console.log('   ✓ Invalid passcode correctly rejected with 401 and INVALID_PASSCODE code');

    // 5C-2: Join Meeting with nonexistent code
    const notFoundRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'DFC-NONEXISTENT',
        passcode: 'TACTIC-1234',
        displayName: 'Lost Player',
        role: 'player',
      }),
    });
    assert.strictEqual(notFoundRes.status, 404, 'Nonexistent code should return 404');
    const notFoundData = await notFoundRes.json();
    assert.strictEqual(notFoundData.code, 'MEETING_NOT_FOUND');
    console.log('   ✓ Nonexistent meeting code correctly rejected with 404 and MEETING_NOT_FOUND code');

    // 5C-3: Join Meeting with space-separated code (e.g. speech-to-text "DFC HRZX")
    const spacedCode = createData.meeting.code.replace('-', ' ');
    const spacedJoinRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: spacedCode,
        passcode: createData.meeting.passcode,
        displayName: 'Mobile User',
        role: 'player',
      }),
    });
    assert.strictEqual(spacedJoinRes.status, 200, 'Space-separated code should be normalized and return 200');
    console.log(`   ✓ Space-separated code "${spacedCode}" successfully normalized and joined`);

    // 5D: Health check endpoint
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    console.log('   ✓ API Health check passed');

    // 5E: LiveKit Media Token issuance & Matching Room Name between Host and Joiner
    console.log('6. Testing LiveKit Token API endpoint & matching room names...');
    const hostTokenRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({
        participantId: createData.participant.id,
        participantName: createData.participant.displayName,
        isHost: true,
      }),
    });
    assert.strictEqual(hostTokenRes.status, 200, `Host token request should return 200, got ${hostTokenRes.status}`);
    const hostTokenData = await hostTokenRes.json();
    assert(typeof hostTokenData.token === 'string' && hostTokenData.token.length > 20, 'Should return a valid JWT token');
    assert(typeof hostTokenData.roomName === 'string', 'Should return roomName');

    // Guest requests token using meeting ID
    const guestTokenRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        participantId: joinData.participant.id,
        participantName: joinData.participant.displayName,
        isHost: false,
      }),
    });
    assert.strictEqual(guestTokenRes.status, 200);
    const guestTokenData = await guestTokenRes.json();
    assert.strictEqual(
      hostTokenData.roomName,
      guestTokenData.roomName,
      `Host room (${hostTokenData.roomName}) must match Guest room (${guestTokenData.roomName})`
    );
    console.log(`   ✓ Both Host and Guest receive identical room name: ${hostTokenData.roomName}`);

    // 5F: Real-Time Tactical Chat endpoint (send message)
    console.log('7. Testing Tactical Chat API endpoints...');
    const sendMsgRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({
        message: 'Maintain high pressing trap on their right fullback!',
        senderName: 'Coach Pep',
        senderId: createData.participant.id,
      }),
    });
    assert.strictEqual(sendMsgRes.status, 200, `Send message should return 200, got ${sendMsgRes.status}`);
    const sendMsgData = await sendMsgRes.json();
    assert(sendMsgData.success === true, 'Send message should return success: true');
    assert.strictEqual(sendMsgData.message.sender_name, 'Coach Pep');
    assert.strictEqual(sendMsgData.message.message, 'Maintain high pressing trap on their right fullback!');
    console.log('   ✓ In-meeting chat message successfully posted');

    // 5G: Retrieve Chat Messages
    const getMsgsRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/messages`);
    assert.strictEqual(getMsgsRes.status, 200);
    const getMsgsData = await getMsgsRes.json();
    assert(Array.isArray(getMsgsData), 'Messages response should be an array');
    assert(getMsgsData.length >= 1, 'Should have at least 1 message in history');
    assert.strictEqual(getMsgsData[0].message, 'Maintain high pressing trap on their right fullback!');
    console.log(`   ✓ In-meeting chat history retrieved (${getMsgsData.length} messages)`);

    // 5H: WebRTC Signaling endpoint
    console.log('8. Testing WebRTC Signaling and Leave endpoints...');
    const signalRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: joinData.participant.id,
        senderName: joinData.participant.displayName,
        signal: { type: 'ping' },
      }),
    });
    assert.strictEqual(signalRes.status, 200);
    console.log('   ✓ WebRTC signaling endpoint successfully processed signal');

    // 5I: Role-based Board Permissions & Moderation Tests
    console.log('9. Testing Role-Based Board Permissions & Moderation...');
    
    // 5I-1: Host edits board -> should succeed (200)
    const hostBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_formation',
          payload: { formation: '4-2-3-1' },
        },
      }),
    });
    assert.strictEqual(hostBoardRes.status, 200, `Host board edit should return 200, got ${hostBoardRes.status}`);
    console.log('   ✓ Host successfully edited the tactical board');

    // 5I-2: Regular player attempts to edit board -> should be rejected (403 BOARD_EDIT_FORBIDDEN)
    const playerBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_formation',
          payload: { formation: '3-5-2' },
        },
      }),
    });
    assert.strictEqual(playerBoardRes.status, 403, `Unauthorized player board edit should return 403, got ${playerBoardRes.status}`);
    const playerBoardErr = await playerBoardRes.json();
    assert.strictEqual(playerBoardErr.code, 'BOARD_EDIT_FORBIDDEN', 'Should return BOARD_EDIT_FORBIDDEN code');
    console.log('   ✓ Unauthorized player board mutation correctly rejected with 403 BOARD_EDIT_FORBIDDEN');

    // 5I-3: Non-host attempts to moderate -> should be rejected (403 HOST_ONLY_ACTION)
    const unauthorizedModRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/participants/${createData.participant.id}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({ action: 'assign_assistant_coach' }),
    });
    assert.strictEqual(unauthorizedModRes.status, 403, `Non-host moderation attempt should return 403, got ${unauthorizedModRes.status}`);
    console.log('   ✓ Non-host moderation attempt correctly rejected with 403');

    // 5I-4: Host assigns Assistant Coach to Player
    const assignAsstRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/participants/${joinData.participant.id}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({ action: 'assign_assistant_coach' }),
    });
    assert.strictEqual(assignAsstRes.status, 200, `Host assign assistant coach should return 200, got ${assignAsstRes.status}`);
    const asstModData = await assignAsstRes.json();
    assert.strictEqual(asstModData.target?.role, 'assistant_coach');
    assert.strictEqual(asstModData.target?.can_edit_board, true);
    console.log('   ✓ Host successfully promoted player to Assistant Coach with board editing rights');

    // 5I-5: Assistant Coach now edits board -> should succeed (200)
    const asstBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_formation',
          payload: { formation: '3-4-3' },
        },
      }),
    });
    assert.strictEqual(asstBoardRes.status, 200, `Assistant Coach board edit should return 200, got ${asstBoardRes.status}`);
    console.log('   ✓ Assistant Coach successfully modified board');

    // 5I-6: Host revokes Assistant Coach role
    const revokeAsstRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/participants/${joinData.participant.id}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({ action: 'revoke_assistant_coach' }),
    });
    assert.strictEqual(revokeAsstRes.status, 200);
    console.log('   ✓ Host revoked Assistant Coach role');

    // 5I-7: Demoted user attempts board edit -> should be rejected (403)
    const demotedBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_formation',
          payload: { formation: '5-3-2' },
        },
      }),
    });
    assert.strictEqual(demotedBoardRes.status, 403, `Demoted player should be rejected with 403, got ${demotedBoardRes.status}`);
    console.log('   ✓ Demoted participant immediately rejected from modifying board');

    // 5I-8: Host explicitly grants individual board editing to player
    const grantEditRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/participants/${joinData.participant.id}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({ action: 'grant_board_edit' }),
    });
    assert.strictEqual(grantEditRes.status, 200);
    console.log('   ✓ Host granted individual board-editing permission to player');

    // 5I-9: Authorized player edits board -> should succeed (200)
    const authorizedPlayerBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'move_ball',
          payload: { position: { x: 5, z: -15 } },
        },
      }),
    });
    assert.strictEqual(authorizedPlayerBoardRes.status, 200, `Authorized player board edit should return 200, got ${authorizedPlayerBoardRes.status}`);
    console.log('   ✓ Host-authorized player successfully moved ball on the board');

    // 5I-10: Host revokes board editing from player
    const revokeEditRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/participants/${joinData.participant.id}/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({ action: 'revoke_board_edit' }),
    });
    assert.strictEqual(revokeEditRes.status, 200);
    console.log('   ✓ Host revoked board-editing permission from player');

    // 5I-11: Revoked player edits board -> should be rejected (403)
    const revokedPlayerBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'move_ball',
          payload: { position: { x: 0, z: 0 } },
        },
      }),
    });
    assert.strictEqual(revokedPlayerBoardRes.status, 403, `Revoked player board edit should return 403, got ${revokedPlayerBoardRes.status}`);
    console.log('   ✓ Revoked participant immediately rejected from modifying board');

    // 5J: End Meeting for Everyone Tests
    console.log('10. Testing End Meeting for Everyone...');

    // 5J-1: Non-host attempts to end meeting -> should be rejected (403 HOST_ONLY_ACTION)
    const nonHostEndRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': joinData.sessionId,
      },
    });
    assert.strictEqual(nonHostEndRes.status, 403, `Non-host cannot end meeting, got ${nonHostEndRes.status}`);
    console.log('   ✓ Non-host cannot end meeting for everyone (403)');

    // 5J-2: Host ends meeting for everyone
    const hostEndRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
    });
    assert.strictEqual(hostEndRes.status, 200, `Host ending meeting should return 200, got ${hostEndRes.status}`);
    const endData = await hostEndRes.json();
    assert.strictEqual(endData.meeting.status, 'ended');
    console.log('   ✓ Host successfully ended meeting for everyone (status: ended)');

    // 5J-3: Check meeting status via GET /api/meetings/:id
    const getMeetingRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}`);
    assert.strictEqual(getMeetingRes.status, 200);
    const meetingInfo = await getMeetingRes.json();
    assert.strictEqual(meetingInfo.status, 'ended', 'Meeting status must be ended');
    console.log('   ✓ Meeting status confirmed as ended in shared store');

    // 5J-4: Board operations on ended meeting must be rejected with 410 MEETING_ENDED
    const endedBoardRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/board/operations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': createData.sessionId,
      },
      body: JSON.stringify({
        operation: {
          type: 'set_formation',
          payload: { formation: '4-3-3' },
        },
      }),
    });
    assert.strictEqual(endedBoardRes.status, 410, `Ended meeting board operations should return 410, got ${endedBoardRes.status}`);
    const endedBoardData = await endedBoardRes.json();
    assert.strictEqual(endedBoardData.code, 'MEETING_ENDED');
    console.log('   ✓ Board operations on ended meeting rejected with 410 MEETING_ENDED');

    // 5J-5: Attempting to join ended meeting must be rejected with 410 MEETING_ENDED
    const joinEndedRes = await fetch(`${baseUrl}/api/meetings/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: createData.meeting.code,
        passcode: createData.meeting.passcode,
        displayName: 'Late Player',
        role: 'player',
      }),
    });
    assert.strictEqual(joinEndedRes.status, 410, `Joining ended meeting should return 410, got ${joinEndedRes.status}`);
    const joinEndedData = await joinEndedRes.json();
    assert.strictEqual(joinEndedData.code, 'MEETING_ENDED');
    console.log('   ✓ New participants prevented from joining ended meeting (410 MEETING_ENDED)');

    // 5K: Leave meeting endpoint
    const leaveRes = await fetch(`${baseUrl}/api/meetings/${createData.meeting.id}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: joinData.participant.id,
        participantName: joinData.participant.displayName,
      }),
    });
    assert.strictEqual(leaveRes.status, 200);
    console.log('   ✓ Leave meeting endpoint successfully processed departure');
  } finally {
    server.close();
  }

  console.log('----------------------------------------------------');
  console.log('ALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
