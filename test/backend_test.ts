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
    console.log('   ✓ Invalid passcode correctly rejected with 401');

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

    // 5I: Leave meeting endpoint
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
