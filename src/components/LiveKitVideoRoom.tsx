import { useEffect, useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Users,
  Shield,
  Volume2,
  VolumeX,
  Radio,
  Settings,
} from 'lucide-react';
import { api } from '../services/api';

interface LiveKitVideoRoomProps {
  meetingId: string;
  isHost: boolean;
  participantName: string;
  isMuted: boolean;
  onToggleMic: () => void;
  remoteParticipants: Array<{
    id: string;
    name: string;
    role: string;
    isMuted: boolean;
    isSpeaking?: boolean;
    canEditBoard?: boolean;
  }>;
}

export const LiveKitVideoRoom = ({
  meetingId,
  isHost,
  participantName,
  isMuted,
  onToggleMic,
  remoteParticipants,
}: LiveKitVideoRoomProps) => {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [livekitConnected, setLivekitConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'simulated'>('connecting');
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initMedia() {
      try {
        const { token, serverUrl } = await api.getLiveKitToken(meetingId);
        if (serverUrl && !serverUrl.includes('dev.livekit.cloud') && token) {
          // Attempt actual LiveKit Cloud connection
          try {
            const { Room, RoomEvent } = await import('livekit-client');
            const room = new Room({
              adaptiveStream: true,
              dynacast: true,
            });

            await room.connect(serverUrl, token);
            if (!isCancelled) {
              setLivekitConnected(true);
              setConnectionStatus('connected');
              await room.localParticipant.enableCameraAndMicrophone();
            }
          } catch {
            if (!isCancelled) setConnectionStatus('simulated');
          }
        } else {
          if (!isCancelled) setConnectionStatus('simulated');
        }
      } catch {
        if (!isCancelled) setConnectionStatus('simulated');
      }
    }

    initMedia();

    return () => {
      isCancelled = true;
    };
  }, [meetingId]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
        <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-[#a3e635]" />
          <span>Live Tactical Audio / Video</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
          {connectionStatus === 'connected' ? 'LiveKit Cloud Active' : 'LiveKit Ready (Dev Mode)'}
        </span>
      </div>

      {/* Grid of video / voice tiles */}
      <div className="grid grid-cols-2 gap-2">
        {/* Local user tile */}
        <div className="relative aspect-video rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shadow-lg group">
          {isVideoEnabled ? (
            <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center">
              <div className="w-10 h-10 rounded-full bg-[#a3e635]/20 border border-[#a3e635]/50 flex items-center justify-center font-display font-black text-sm text-[#a3e635] shadow-inner mb-1">
                {participantName.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-white truncate max-w-full">
                {participantName} (You)
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-500">
              <VideoOff className="w-6 h-6 mb-1" />
              <span className="text-[10px]">Camera Off</span>
            </div>
          )}

          {/* Bottom badge */}
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/80 px-2 py-0.5 rounded-md backdrop-blur-sm">
            <span className="truncate max-w-[70px] text-slate-300 font-medium">{isHost ? 'Coach' : 'You'}</span>
            <div className="flex items-center gap-1">
              {isMuted ? (
                <MicOff className="w-3 h-3 text-rose-400" />
              ) : (
                <Mic className="w-3 h-3 text-emerald-400" />
              )}
            </div>
          </div>
        </div>

        {/* Remote participant tiles */}
        {remoteParticipants.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="relative aspect-video rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center shadow-lg"
          >
            <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center font-display font-black text-sm text-blue-400 mb-1">
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-slate-200 truncate max-w-full">{p.name}</span>
            </div>

            <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/80 px-2 py-0.5 rounded-md backdrop-blur-sm">
              <span className="truncate max-w-[70px] text-slate-400">{p.role}</span>
              <div className="flex items-center gap-1">
                {p.isMuted ? (
                  <MicOff className="w-3 h-3 text-slate-500" />
                ) : (
                  <Mic className="w-3 h-3 text-emerald-400" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Controls strip */}
      <div className="flex items-center justify-between gap-1.5 mt-1 pt-2 border-t border-slate-800/80">
        <button
          onClick={onToggleMic}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            isMuted
              ? 'bg-rose-950/60 border border-rose-800/60 text-rose-300 hover:bg-rose-900/60'
              : 'bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        <button
          onClick={() => setIsVideoEnabled(!isVideoEnabled)}
          className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
            !isVideoEnabled
              ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              : 'bg-slate-900 border border-slate-700 text-slate-200 hover:bg-slate-800'
          }`}
        >
          {isVideoEnabled ? (
            <Video className="w-3.5 h-3.5 text-[#a3e635]" />
          ) : (
            <VideoOff className="w-3.5 h-3.5" />
          )}
          <span>{isVideoEnabled ? 'Stop Video' : 'Start Video'}</span>
        </button>
      </div>
    </div>
  );
};
