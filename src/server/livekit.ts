import { AccessToken } from 'livekit-server-sdk';

export interface TokenRequestParams {
  roomName: string;
  participantId: string;
  participantName: string;
  isHost: boolean;
  canPublish: boolean;
}

export async function generateLiveKitToken({
  roomName,
  participantId,
  participantName,
  isHost,
  canPublish,
}: TokenRequestParams): Promise<{ token: string; serverUrl: string }> {
  const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';
  const serverUrl = process.env.LIVEKIT_URL || process.env.VITE_LIVEKIT_URL || 'wss://dev.livekit.cloud';

  // Construct AccessToken
  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantId,
    name: participantName,
    ttl: '2h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: canPublish,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  const token = await at.toJwt();
  return { token, serverUrl };
}
