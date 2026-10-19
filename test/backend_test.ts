import assert from 'node:assert';
import { generateMeetingCode, generatePasscode, hashPasscode, verifyPasscode } from '../src/server/crypto';
import { createMeetingSchema, joinMeetingSchema, boardOperationSchema } from '../src/server/validation';
import { generateLiveKitToken } from '../src/server/livekit';

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

  console.log('----------------------------------------------------');
  console.log('ALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY! ✓');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
