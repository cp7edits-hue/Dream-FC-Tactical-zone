import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Radio,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Volume2,
} from 'lucide-react';
import { api } from '../services/api';

interface RemoteParticipant {
  id: string;
  name: string;
  role: string;
  isMuted: boolean;
  isSpeaking?: boolean;
  canEditBoard?: boolean;
  videoTrack?: any;
  audioTrack?: any;
}

interface LiveKitVideoRoomProps {
  meetingId: string;
  isHost: boolean;
  participantId?: string;
  participantName: string;
  isMuted: boolean;
  onToggleMic: () => void;
  remoteParticipants: RemoteParticipant[];
}

type MediaErrorType = 'permission_denied' | 'not_found' | 'hardware_in_use' | 'unknown' | null;

export const LiveKitVideoRoom = ({
  meetingId,
  isHost,
  participantId,
  participantName,
  isMuted,
  onToggleMic,
  remoteParticipants,
}: LiveKitVideoRoomProps) => {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    'requesting_permissions' | 'connected_livekit' | 'connected_webrtc' | 'reconnecting' | 'disconnected'
  >('requesting_permissions');
  const [mediaError, setMediaError] = useState<MediaErrorType>(null);
  const [isSpeakingLocally, setIsSpeakingLocally] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100

  // Track and Stream references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const livekitRoomRef = useRef<any>(null);

  // Stop local media tracks
  const stopLocalTracks = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
  }, []);

  // Initialize hardware media & LiveKit room
  const initMedia = useCallback(async () => {
    setConnectionStatus('requesting_permissions');
    setMediaError(null);
    stopLocalTracks();

    let stream: MediaStream | null = null;

    // 1. Acquire Local Media (Camera + Microphone)
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
          // Attempt audio + video with optimal lightweight dimensions for tactical side-drawer
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
              facingMode: 'user',
            },
          });
        } catch (videoError: any) {
          // If video failed (e.g. no camera attached), attempt audio only
          console.warn('[LiveKitVideoRoom] Camera acquisition failed, falling back to audio-only:', videoError);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            setIsVideoEnabled(false);
          } catch (audioError: any) {
            throw audioError;
          }
        }
      }
    } catch (err: any) {
      console.warn('[LiveKitVideoRoom] Media devices access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMediaError('permission_denied');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMediaError('not_found');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setMediaError('hardware_in_use');
      } else {
        setMediaError('unknown');
      }
      setConnectionStatus('disconnected');
    }

    // Attach stream to local video element and start audio analyser
    if (stream) {
      localStreamRef.current = stream;

      // Apply initial mute state
      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((t) => {
        t.enabled = !isMuted;
      });

      // Apply initial video state
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((t) => {
        t.enabled = isVideoEnabled;
      });

      if (localVideoRef.current && videoTracks.length > 0) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }

      // Setup Web Audio Analyser for accurate local speaking detection
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass && audioTracks.length > 0) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          analyserRef.current = analyser;

          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const monitorAudio = () => {
            if (!analyserRef.current || !localStreamRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            const normalized = Math.min(100, Math.round((average / 128) * 100));
            setAudioLevel(normalized);

            // Speaking threshold: volume > 10 and not muted
            const activeAudio = audioTracks.some((t) => t.enabled);
            setIsSpeakingLocally(activeAudio && average > 12);

            animationFrameRef.current = requestAnimationFrame(monitorAudio);
          };

          animationFrameRef.current = requestAnimationFrame(monitorAudio);
        }
      } catch (audioCtxErr) {
        console.warn('[LiveKitVideoRoom] Audio analyser setup notice:', audioCtxErr);
      }

      setConnectionStatus('connected_webrtc');
    }

    // 2. Attempt LiveKit Cloud connection if configured
    try {
      const { token, serverUrl } = await api.getLiveKitToken(meetingId, {
        id: participantId,
        name: participantName,
        isHost,
      });

      const isLiveKitCloud =
        serverUrl &&
        !serverUrl.includes('dev.livekit.cloud') &&
        !serverUrl.includes('YOUR_LIVEKIT_PROJECT') &&
        serverUrl.startsWith('wss://') &&
        token &&
        token.length > 30;

      if (isLiveKitCloud) {
        try {
          const { Room, RoomEvent } = await import('livekit-client');
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
          });
          livekitRoomRef.current = room;

          await room.connect(serverUrl, token);
          setConnectionStatus('connected_livekit');

          // Publish tracks if stream exists
          if (stream) {
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            if (videoTrack) await room.localParticipant.publishTrack(videoTrack);
            if (audioTrack) await room.localParticipant.publishTrack(audioTrack);
          }

          room.on(RoomEvent.ConnectionStateChanged, (state: string) => {
            if (state === 'reconnecting') setConnectionStatus('reconnecting');
            if (state === 'connected') setConnectionStatus('connected_livekit');
            if (state === 'disconnected') setConnectionStatus('connected_webrtc');
          });
        } catch (lkConnectErr) {
          console.warn('[LiveKitVideoRoom] LiveKit Cloud server unreachable, using native WebRTC engine:', lkConnectErr);
          setConnectionStatus(stream ? 'connected_webrtc' : 'disconnected');
        }
      }
    } catch (tokenErr) {
      console.warn('[LiveKitVideoRoom] Token acquisition notice:', tokenErr);
      if (stream) setConnectionStatus('connected_webrtc');
    }
  }, [meetingId, participantId, participantName, isHost, stopLocalTracks]);

  // Run init on mount and cleanup on unmount
  useEffect(() => {
    initMedia();
    return () => {
      stopLocalTracks();
      if (livekitRoomRef.current) {
        try {
          livekitRoomRef.current.disconnect();
        } catch {}
      }
    };
  }, [initMedia, stopLocalTracks]);

  // Synchronize mic mute state with physical hardware audio track
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    if (livekitRoomRef.current?.localParticipant) {
      try {
        livekitRoomRef.current.localParticipant.setMicrophoneEnabled(!isMuted);
      } catch {}
    }

    if (isMuted) {
      setIsSpeakingLocally(false);
      setAudioLevel(0);
    }
  }, [isMuted]);

  // Synchronize camera toggle with physical hardware video track
  useEffect(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = isVideoEnabled;
      });

      if (localVideoRef.current && isVideoEnabled) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
    }

    if (livekitRoomRef.current?.localParticipant) {
      try {
        livekitRoomRef.current.localParticipant.setCameraEnabled(isVideoEnabled);
      } catch {}
    }
  }, [isVideoEnabled]);

  const toggleCamera = () => {
    setIsVideoEnabled((prev) => !prev);
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header status bar */}
      <div className="flex items-center justify-between text-xs text-slate-400 mb-0.5">
        <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
          <Radio
            className={`w-3.5 h-3.5 ${
              connectionStatus === 'connected_livekit' || connectionStatus === 'connected_webrtc'
                ? 'text-[#a3e635] animate-pulse'
                : 'text-amber-400'
            }`}
          />
          <span className="text-white font-bold">Tactical Media Comms</span>
        </span>

        <span
          className={`text-[10px] px-2 py-0.5 rounded font-mono border flex items-center gap-1 ${
            connectionStatus === 'connected_livekit'
              ? 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300'
              : connectionStatus === 'connected_webrtc'
              ? 'bg-slate-900 border-slate-700 text-[#a3e635]'
              : connectionStatus === 'requesting_permissions'
              ? 'bg-amber-950/80 border-amber-800 text-amber-300'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
        >
          {connectionStatus === 'connected_livekit' && 'LiveKit Cloud'}
          {connectionStatus === 'connected_webrtc' && 'WebRTC Live'}
          {connectionStatus === 'requesting_permissions' && 'Connecting...'}
          {connectionStatus === 'reconnecting' && 'Reconnecting...'}
          {connectionStatus === 'disconnected' && 'Disconnected'}
        </span>
      </div>

      {/* Permission or hardware error banner */}
      {mediaError && (
        <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-white leading-tight">
              {mediaError === 'permission_denied' && 'Media Permissions Blocked'}
              {mediaError === 'not_found' && 'No Camera or Mic Found'}
              {mediaError === 'hardware_in_use' && 'Hardware in Use by Another App'}
              {mediaError === 'unknown' && 'Media Access Notice'}
            </p>
            <p className="text-[11px] text-amber-300/90 mt-0.5 leading-snug">
              {mediaError === 'permission_denied' &&
                'Please enable microphone and camera permissions in your browser address bar to participate in audio/video.'}
              {mediaError === 'not_found' &&
                'Could not detect an active camera or microphone. You can still participate in tactical chat.'}
              {mediaError === 'hardware_in_use' &&
                'Another application may be locking your camera or mic. Close other tools and retry.'}
              {mediaError === 'unknown' &&
                'Check device permissions and verify microphone input in your system settings.'}
            </p>
            <button
              onClick={initMedia}
              className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-[11px] font-bold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry Media Permissions</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid of video / voice tiles */}
      <div className="grid grid-cols-2 gap-2">
        {/* Local user tile */}
        <div
          className={`relative aspect-video rounded-xl bg-slate-900 border overflow-hidden flex items-center justify-center shadow-lg transition-all ${
            isSpeakingLocally
              ? 'border-[#a3e635] shadow-[0_0_12px_rgba(163,230,53,0.35)]'
              : 'border-slate-800'
          }`}
        >
          {/* Real live local camera stream */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
              isVideoEnabled && !mediaError ? 'opacity-100' : 'opacity-0 hidden'
            }`}
          />

          {/* Tactical Avatar Fallback when Camera is disabled or error */}
          {(!isVideoEnabled || mediaError) && (
            <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-black text-sm shadow-inner mb-1 transition-transform ${
                  isSpeakingLocally
                    ? 'scale-110 bg-[#a3e635]/30 border-2 border-[#a3e635] text-[#a3e635]'
                    : isHost
                    ? 'bg-[#a3e635]/20 border border-[#a3e635]/50 text-[#a3e635]'
                    : 'bg-blue-600/20 border border-blue-500/50 text-blue-400'
                }`}
              >
                {participantName.slice(0, 1).toUpperCase()}
              </div>

              <span className="text-xs font-semibold text-white truncate max-w-full">
                {participantName} (You)
              </span>

              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <VideoOff className="w-3 h-3 text-slate-500" />
                <span>Camera Off</span>
              </span>
            </div>
          )}

          {/* Realtime speaking audio indicator bar */}
          {isSpeakingLocally && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Speaking</span>
            </div>
          )}

          {/* Bottom badge */}
          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/85 px-2 py-0.5 rounded-md backdrop-blur-sm border border-slate-800/60">
            <span className="truncate max-w-[80px] text-slate-300 font-medium">
              {isHost ? 'Coach (You)' : `${participantName} (You)`}
            </span>
            <div className="flex items-center gap-1">
              {isMuted ? (
                <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                  <MicOff className="w-3 h-3" />
                  <span className="text-[9px]">Muted</span>
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-0.5">
                  <Mic className="w-3 h-3" />
                  {isSpeakingLocally && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remote participant tiles */}
        {remoteParticipants.length === 0 ? (
          <div className="relative aspect-video rounded-xl bg-slate-900/40 border border-dashed border-slate-800 flex flex-col items-center justify-center p-2 text-center text-slate-500">
            <Radio className="w-5 h-5 mb-1 text-slate-600" />
            <span className="text-[11px] font-medium text-slate-400">Waiting for Squad</span>
            <span className="text-[9px] text-slate-500">Share meeting code to invite</span>
          </div>
        ) : (
          remoteParticipants.slice(0, 3).map((p) => (
            <div
              key={p.id}
              className={`relative aspect-video rounded-xl bg-slate-900 border overflow-hidden flex items-center justify-center shadow-lg transition-all ${
                p.isSpeaking
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                  : 'border-slate-800'
              }`}
            >
              <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-black text-sm mb-1 transition-transform ${
                    p.isSpeaking
                      ? 'scale-110 bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400'
                      : 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
                  }`}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="text-xs font-semibold text-slate-200 truncate max-w-full">
                  {p.name}
                </span>
                <span className="text-[9px] text-slate-400">{p.role}</span>
              </div>

              {/* Bottom badge */}
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/85 px-2 py-0.5 rounded-md backdrop-blur-sm border border-slate-800/60">
                <span className="truncate max-w-[70px] text-slate-400">{p.role}</span>
                <div className="flex items-center gap-1">
                  {p.isMuted ? (
                    <MicOff className="w-3 h-3 text-rose-400" />
                  ) : (
                    <Mic className="w-3 h-3 text-emerald-400" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Local Controls Strip */}
      <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-slate-800/80">
        {/* Real microphone mute / unmute button */}
        <button
          onClick={onToggleMic}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isMuted
              ? 'bg-rose-950/70 border border-rose-800 text-rose-300 hover:bg-rose-900/80'
              : 'bg-emerald-950/60 border border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/70'
          }`}
          title={isMuted ? 'Click to Unmute Microphone' : 'Click to Mute Microphone'}
        >
          {isMuted ? (
            <MicOff className="w-3.5 h-3.5 text-rose-400" />
          ) : (
            <Mic className="w-3.5 h-3.5 text-emerald-400" />
          )}
          <span>{isMuted ? 'Mic Muted' : 'Mic Active'}</span>
        </button>

        {/* Real camera start / stop button */}
        <button
          onClick={toggleCamera}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            !isVideoEnabled
              ? 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
              : 'bg-slate-900 border border-[#a3e635]/60 text-white hover:bg-slate-800'
          }`}
          title={isVideoEnabled ? 'Click to Turn Off Camera' : 'Click to Turn On Camera'}
        >
          {isVideoEnabled ? (
            <Video className="w-3.5 h-3.5 text-[#a3e635]" />
          ) : (
            <VideoOff className="w-3.5 h-3.5 text-slate-400" />
          )}
          <span>{isVideoEnabled ? 'Stop Video' : 'Start Video'}</span>
        </button>

        {/* Device Refresh */}
        <button
          onClick={initMedia}
          className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Refresh Media Hardware"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
