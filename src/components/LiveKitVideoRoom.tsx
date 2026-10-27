import { useEffect, useState, useRef, useCallback, memo } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Radio,
  AlertTriangle,
  RotateCcw,
  Volume2,
  VolumeX,
  Users,
  Shield,
  Activity,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { api } from '../services/api';

export interface RemoteParticipant {
  id: string;
  name: string;
  role: string;
  isMuted: boolean;
  isSpeaking?: boolean;
  canEditBoard?: boolean;
}

export interface RemoteFeed {
  participantId: string;
  participantName: string;
  role: string;
  isHost: boolean;
  videoTrack: any | null; // LiveKit RemoteTrack or WebRTC MediaStreamTrack
  audioTrack: any | null; // LiveKit RemoteTrack or WebRTC MediaStreamTrack
  isVideoMuted: boolean;
  isAudioMuted: boolean;
  isSpeaking: boolean;
}

interface LiveKitVideoRoomProps {
  meetingId: string;
  meetingCode?: string;
  isHost: boolean;
  participantId?: string;
  participantName: string;
  isMuted: boolean;
  onToggleMic: () => void;
  isVideoEnabled?: boolean;
  onToggleVideo?: () => void;
  remoteParticipants: RemoteParticipant[];
  isDrawerOpen?: boolean;
  onExpandDrawer?: () => void;
}

type MediaErrorType = 'permission_denied' | 'not_found' | 'hardware_in_use' | 'unknown' | null;

// =============================================================================
// PERSISTENT AUDIO ELEMENT
// Mounts directly in a hidden DOM container to guarantee audio playback
// is never disrupted when tabs change, drawers collapse, or elements re-render.
// =============================================================================
const PersistentAudioFeed = memo(
  ({
    feed,
    onAutoplayBlocked,
  }: {
    feed: RemoteFeed;
    onAutoplayBlocked: () => void;
  }) => {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
      const audioEl = audioRef.current;
      if (!audioEl || !feed.audioTrack) return;

      if (typeof feed.audioTrack.attach === 'function') {
        try {
          feed.audioTrack.attach(audioEl);
          audioEl.play().catch((err: any) => {
            if (err.name === 'NotAllowedError') {
              onAutoplayBlocked();
            }
          });
        } catch (err) {
          console.warn('[PersistentAudioFeed] Attach notice:', err);
        }
        return () => {
          try {
            if (typeof feed.audioTrack.detach === 'function') {
              feed.audioTrack.detach(audioEl);
            }
          } catch {}
        };
      } else if (feed.audioTrack instanceof MediaStreamTrack) {
        audioEl.srcObject = new MediaStream([feed.audioTrack]);
        audioEl.play().catch((err: any) => {
          if (err.name === 'NotAllowedError') {
            onAutoplayBlocked();
          }
        });
        return () => {
          audioEl.srcObject = null;
        };
      }
    }, [feed.audioTrack, onAutoplayBlocked]);

    return (
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        data-participant={feed.participantId}
      />
    );
  }
);

// =============================================================================
// INDIVIDUAL REMOTE PARTICIPANT VIDEO TILE (FULL & COMPACT)
// =============================================================================
const RemoteVideoTile = memo(
  ({
    feed,
    compact = false,
    onClick,
  }: {
    feed: RemoteFeed;
    compact?: boolean;
    onClick?: () => void;
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Attach / Detach Video Track
    useEffect(() => {
      const videoEl = videoRef.current;
      if (!videoEl || !feed.videoTrack) return;

      if (typeof feed.videoTrack.attach === 'function') {
        try {
          feed.videoTrack.attach(videoEl);
          videoEl.play().catch(() => {});
        } catch (err) {
          console.warn('[RemoteVideoTile] Video attach notice:', err);
        }
        return () => {
          try {
            if (typeof feed.videoTrack.detach === 'function') {
              feed.videoTrack.detach(videoEl);
            }
          } catch {}
        };
      } else if (feed.videoTrack instanceof MediaStreamTrack) {
        videoEl.srcObject = new MediaStream([feed.videoTrack]);
        videoEl.play().catch(() => {});
        return () => {
          videoEl.srcObject = null;
        };
      }
    }, [feed.videoTrack]);

    const hasActiveVideo = !!feed.videoTrack && !feed.isVideoMuted;

    // Compact Thumbnail Mode (For minimized top meeting bar)
    if (compact) {
      return (
        <div
          onClick={onClick}
          className={`relative w-12 h-9 sm:w-16 sm:h-11 rounded-lg bg-slate-900 border overflow-hidden flex items-center justify-center shrink-0 shadow cursor-pointer transition-all hover:scale-105 ${
            feed.isSpeaking
              ? 'border-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] ring-1 ring-emerald-400'
              : 'border-slate-800 hover:border-slate-700'
          }`}
          title={`${feed.participantName} (${feed.isHost ? 'Coach' : 'Squad'}) - Click to expand`}
        >
          {/* CRITICAL: Video is muted to ensure mobile browsers allow autoplay */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${
              hasActiveVideo ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
            }`}
          />

          {!hasActiveVideo && (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-center p-0.5">
              <span
                className={`text-[10px] font-bold ${feed.isHost ? 'text-[#a3e635]' : 'text-blue-400'}`}
              >
                {feed.participantName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}

          <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 px-1 py-0.5 flex items-center justify-between text-[8px] leading-none text-slate-300">
            <span className="truncate max-w-[28px] sm:max-w-[36px]">
              {feed.isHost ? 'Coach' : feed.participantName}
            </span>
            {feed.isAudioMuted ? (
              <MicOff className="w-2 h-2 text-rose-400" />
            ) : (
              <Mic className="w-2 h-2 text-emerald-400" />
            )}
          </div>
        </div>
      );
    }

    // Full Grid Tile Mode
    return (
      <div
        className={`relative aspect-video rounded-xl bg-slate-900 border overflow-hidden flex items-center justify-center shadow-lg transition-all ${
          feed.isSpeaking
            ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.35)] ring-1 ring-emerald-400/50'
            : 'border-slate-800'
        }`}
      >
        {/* CRITICAL: Video is muted so browsers do not reject video autoplay */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            hasActiveVideo ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
          }`}
        />

        {!hasActiveVideo && (
          <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center animate-fade-in">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-black text-sm mb-1 transition-transform shadow-inner ${
                feed.isSpeaking
                  ? 'scale-110 bg-emerald-500/25 border-2 border-emerald-400 text-emerald-400'
                  : feed.isHost
                  ? 'bg-[#a3e635]/20 border border-[#a3e635]/50 text-[#a3e635]'
                  : 'bg-blue-600/20 border border-blue-500/40 text-blue-400'
              }`}
            >
              {feed.participantName.slice(0, 1).toUpperCase()}
            </div>

            <span className="text-xs font-semibold text-slate-200 truncate max-w-full px-1">
              {feed.participantName}
            </span>

            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              <VideoOff className="w-3 h-3 text-slate-500" />
              <span>Camera Off</span>
            </span>
          </div>
        )}

        {feed.isSpeaking && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Speaking</span>
          </div>
        )}

        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/85 px-2 py-0.5 rounded-md backdrop-blur-sm border border-slate-800/60">
          <span className="truncate max-w-[85px] text-slate-300 font-medium flex items-center gap-1">
            {feed.isHost ? (
              <span className="text-[#a3e635] font-bold flex items-center gap-0.5">
                <Shield className="w-2.5 h-2.5" />
                Coach
              </span>
            ) : (
              feed.participantName
            )}
          </span>
          <div className="flex items-center gap-1">
            {feed.isAudioMuted ? (
              <span className="text-rose-400 flex items-center gap-0.5">
                <MicOff className="w-3 h-3" />
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-0.5">
                <Mic className="w-3 h-3" />
                {feed.isSpeaking && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
);

// =============================================================================
// MAIN LIVEKIT & WEBRTC VIDEO ROOM COMPONENT
// =============================================================================
export const LiveKitVideoRoom = ({
  meetingId,
  meetingCode,
  isHost,
  participantId,
  participantName,
  isMuted,
  onToggleMic,
  isVideoEnabled: externalVideoEnabled,
  onToggleVideo: externalToggleVideo,
  remoteParticipants,
  isDrawerOpen = true,
  onExpandDrawer,
}: LiveKitVideoRoomProps) => {
  const [internalVideoEnabled, setInternalVideoEnabled] = useState(true);
  const isVideoEnabled = externalVideoEnabled !== undefined ? externalVideoEnabled : internalVideoEnabled;

  const [connectionStatus, setConnectionStatus] = useState<
    'requesting_permissions' | 'connected_livekit' | 'connected_webrtc' | 'reconnecting' | 'disconnected'
  >('requesting_permissions');
  const [activeProvider, setActiveProvider] = useState<'livekit' | 'webrtc' | 'none'>('none');
  const [mediaError, setMediaError] = useState<MediaErrorType>(null);
  const [isSpeakingLocally, setIsSpeakingLocally] = useState(false);
  const [, setAudioLevel] = useState(0);

  // Audio autoplay block state: when browser denies auto audio play until user interaction
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);

  // Diagnostics toggle state
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Track publication states
  const [isPublishingAudio, setIsPublishingAudio] = useState(false);
  const [isPublishingVideo, setIsPublishingVideo] = useState(false);

  // Dynamic remote feeds map: key = participantId or identity
  const [remoteFeeds, setRemoteFeeds] = useState<Map<string, RemoteFeed>>(new Map());

  // Hardware references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localMiniVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // LiveKit room reference
  const livekitRoomRef = useRef<any>(null);

  // Native WebRTC peer connections map: peerId -> RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Queued ICE candidates for peers whose remote descriptions are not yet ready
  const iceCandidatesQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const myIdentity = participantId || `p_${participantName.replace(/\s+/g, '_')}`;

  // Stop local hardware tracks and audio analyser
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
    if (localMiniVideoRef.current) {
      localMiniVideoRef.current.srcObject = null;
    }
    setIsPublishingAudio(false);
    setIsPublishingVideo(false);
  }, []);

  // Cleanup WebRTC peer connections
  const cleanupPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    peerConnectionsRef.current.clear();
    iceCandidatesQueueRef.current.clear();
  }, []);

  // Sync incoming remoteParticipants prop with remoteFeeds state
  useEffect(() => {
    setRemoteFeeds((prev) => {
      const next = new Map(prev);
      remoteParticipants.forEach((p) => {
        const existing = next.get(p.id) || next.get(p.name);
        if (existing) {
          next.set(existing.participantId, {
            ...existing,
            participantName: p.name,
            role: p.role,
            isHost: p.role === 'Head Coach' || p.role === 'host',
            isAudioMuted: p.isMuted ?? existing.isAudioMuted,
          });
        } else {
          next.set(p.id, {
            participantId: p.id,
            participantName: p.name,
            role: p.role,
            isHost: p.role === 'Head Coach' || p.role === 'host',
            videoTrack: null,
            audioTrack: null,
            isVideoMuted: true,
            isAudioMuted: p.isMuted ?? false,
            isSpeaking: false,
          });
        }
      });

      for (const [id, feed] of next.entries()) {
        // Keep participants who have active media tracks or are connected in the LiveKit room
        if (feed.videoTrack || feed.audioTrack) continue;
        if (livekitRoomRef.current?.remoteParticipants?.has(id)) continue;

        if (remoteParticipants.length > 0) {
          const stillInMeeting = remoteParticipants.some(
            (p) => p.id === id || p.name === id || p.name === feed.participantName
          );
          if (!stillInMeeting) {
            next.delete(id);
          }
        }
      }

      return next;
    });
  }, [remoteParticipants]);

  // Audio unlock action when browser blocks autoplay
  const handleUnlockAudio = useCallback(async () => {
    try {
      if (livekitRoomRef.current) {
        await livekitRoomRef.current.startAudio();
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      setAudioAutoplayBlocked(false);
    } catch (err) {
      console.warn('[LiveKitVideoRoom] Unlock audio error:', err);
    }
  }, []);

  // Setup WebRTC peer-to-peer connection for fallback mesh
  const setupWebRtcPeerConnection = useCallback(
    async (remotePeerId: string, remotePeerName: string, isInitiator: boolean) => {
      if (peerConnectionsRef.current.has(remotePeerId)) {
        return peerConnectionsRef.current.get(remotePeerId)!;
      }

      try {
        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        });

        peerConnectionsRef.current.set(remotePeerId, pc);

        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        pc.ontrack = (event) => {
          const track = event.track;
          setRemoteFeeds((prev) => {
            const next = new Map(prev);
            const current = next.get(remotePeerId) || {
              participantId: remotePeerId,
              participantName: remotePeerName,
              role: 'Squad Member',
              isHost: false,
              videoTrack: null,
              audioTrack: null,
              isVideoMuted: false,
              isAudioMuted: false,
              isSpeaking: false,
            };

            if (track.kind === 'video') {
              current.videoTrack = track;
              current.isVideoMuted = !track.enabled;
            } else if (track.kind === 'audio') {
              current.audioTrack = track;
              current.isAudioMuted = !track.enabled;
            }

            next.set(remotePeerId, { ...current });
            return next;
          });
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            api.sendWebRtcSignal(meetingId, {
              targetParticipantId: remotePeerId,
              senderId: myIdentity,
              senderName: participantName,
              signal: { type: 'candidate', candidate: event.candidate },
            }).catch(() => {});
          }
        };

        if (isInitiator) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await api.sendWebRtcSignal(meetingId, {
            targetParticipantId: remotePeerId,
            senderId: myIdentity,
            senderName: participantName,
            signal: { type: 'offer', sdp: offer },
          });
        }

        return pc;
      } catch (err) {
        console.warn('[LiveKitVideoRoom] WebRTC peer setup error:', err);
        return null;
      }
    },
    [meetingId, myIdentity, participantName]
  );

  // Handle incoming WebRTC signaling (offer, answer, candidate)
  const handleWebRtcSignal = useCallback(
    async (senderId: string, senderName: string, signal: any) => {
      if (!signal || !signal.type) return;

      try {
        if (signal.type === 'offer') {
          let pc = peerConnectionsRef.current.get(senderId);
          if (!pc) {
            pc = (await setupWebRtcPeerConnection(senderId, senderName, false)) || undefined;
          }
          if (!pc) return;

          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Drain queued ICE candidates
          const queued = iceCandidatesQueueRef.current.get(senderId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          iceCandidatesQueueRef.current.delete(senderId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await api.sendWebRtcSignal(meetingId, {
            targetParticipantId: senderId,
            senderId: myIdentity,
            senderName: participantName,
            signal: { type: 'answer', sdp: answer },
          });
        } else if (signal.type === 'answer') {
          const pc = peerConnectionsRef.current.get(senderId);
          if (pc && pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Drain queued ICE candidates
            const queued = iceCandidatesQueueRef.current.get(senderId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
            iceCandidatesQueueRef.current.delete(senderId);
          }
        } else if (signal.type === 'candidate' && signal.candidate) {
          const pc = peerConnectionsRef.current.get(senderId);
          if (pc && pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
          } else {
            const queued = iceCandidatesQueueRef.current.get(senderId) || [];
            queued.push(signal.candidate);
            iceCandidatesQueueRef.current.set(senderId, queued);
          }
        }
      } catch (signalErr) {
        console.warn('[LiveKitVideoRoom] Incoming WebRTC signal handling error:', signalErr);
      }
    },
    [meetingId, myIdentity, participantName, setupWebRtcPeerConnection]
  );

  // Subscribe to real-time WebRTC signals across devices (Supabase Realtime + SSE)
  useEffect(() => {
    if (!meetingId) return;

    const unsubscribe = api.subscribeToBoardEvents(meetingId, (event: string, data: any) => {
      if (event === 'webrtc_signal' && data) {
        if (data.senderId === myIdentity) return;
        if (data.targetParticipantId && data.targetParticipantId !== myIdentity) return;
        handleWebRtcSignal(data.senderId, data.senderName || 'Squad Member', data.signal);
      } else if (event === 'participant_joined' && data) {
        if (data.id && data.id !== myIdentity) {
          // If fallback WebRTC is needed and we are initiator:
          const shouldInitiate = isHost || myIdentity < data.id;
          if (shouldInitiate && activeProvider === 'webrtc') {
            setupWebRtcPeerConnection(data.id, data.displayName || 'Squad Member', true);
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [meetingId, myIdentity, isHost, activeProvider, handleWebRtcSignal, setupWebRtcPeerConnection]);

  // Initialize hardware media & LiveKit room
  const initMedia = useCallback(async () => {
    setConnectionStatus('requesting_permissions');
    setMediaError(null);
    stopLocalTracks();
    cleanupPeerConnections();

    let stream: MediaStream | null = null;

    // 1. Acquire Local Media (Camera + Microphone)
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        try {
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
          console.warn('[LiveKitVideoRoom] Camera acquisition failed, falling back to audio-only:', videoError);
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            if (externalToggleVideo) {
              // keep external in sync
            } else {
              setInternalVideoEnabled(false);
            }
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
    }

    if (stream) {
      localStreamRef.current = stream;

      const audioTracks = stream.getAudioTracks();
      audioTracks.forEach((t) => {
        t.enabled = !isMuted;
      });
      setIsPublishingAudio(audioTracks.length > 0 && !isMuted);

      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach((t) => {
        t.enabled = isVideoEnabled;
      });
      setIsPublishingVideo(videoTracks.length > 0 && isVideoEnabled);

      if (localVideoRef.current && videoTracks.length > 0) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      if (localMiniVideoRef.current && videoTracks.length > 0) {
        localMiniVideoRef.current.srcObject = stream;
        localMiniVideoRef.current.play().catch(() => {});
      }

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

            const activeAudio = audioTracks.some((t) => t.enabled);
            setIsSpeakingLocally(activeAudio && average > 12);

            animationFrameRef.current = requestAnimationFrame(monitorAudio);
          };

          animationFrameRef.current = requestAnimationFrame(monitorAudio);
        }
      } catch (audioCtxErr) {
        console.warn('[LiveKitVideoRoom] Audio analyser setup notice:', audioCtxErr);
      }
    }

    // 2. Connect to LiveKit Cloud Room
    try {
      const { token, serverUrl } = await api.getLiveKitToken(meetingId, {
        id: myIdentity,
        name: participantName,
        isHost,
        meetingCode,
      });

      const isLiveKitConfigured =
        serverUrl &&
        serverUrl.startsWith('wss://') &&
        !serverUrl.includes('YOUR_LIVEKIT_PROJECT') &&
        token &&
        token.length > 30;

      if (isLiveKitConfigured) {
        try {
          const { Room, RoomEvent, Track } = await import('livekit-client');
          const room = new Room({
            adaptiveStream: true,
            dynacast: true,
            audioCaptureDefaults: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          livekitRoomRef.current = room;

          const updateParticipantFeed = (p: any) => {
            const pid = p.identity || p.sid;
            const pname = p.name || p.identity || 'Squad Member';
            const isCoach = p.metadata?.includes('host') || pname.toLowerCase().includes('coach');

            let vTrack: any = null;
            let aTrack: any = null;
            let isVMuted = true;
            let isAMuted = true;

            p.trackPublications?.forEach((pub: any) => {
              if (pub.kind === Track.Kind.Video || pub.source === Track.Source.Camera) {
                vTrack = pub.track || null;
                isVMuted = pub.isMuted || !pub.track;
              } else if (pub.kind === Track.Kind.Audio || pub.source === Track.Source.Microphone) {
                aTrack = pub.track || null;
                isAMuted = pub.isMuted;
              }
            });

            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              const existing = next.get(pid);
              next.set(pid, {
                participantId: pid,
                participantName: pname,
                role: isCoach ? 'Head Coach' : existing?.role || 'Squad Member',
                isHost: isCoach,
                videoTrack: vTrack || existing?.videoTrack || null,
                audioTrack: aTrack || existing?.audioTrack || null,
                isVideoMuted: vTrack ? isVMuted : existing?.isVideoMuted ?? true,
                isAudioMuted: aTrack ? isAMuted : existing?.isAudioMuted ?? false,
                isSpeaking: p.isSpeaking ?? false,
              });
              return next;
            });
          };

          room.on(RoomEvent.ParticipantConnected, (participant: any) => {
            updateParticipantFeed(participant);
          });

          room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
            const pid = participant.identity || participant.sid;
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              next.delete(pid);
              return next;
            });
          });

          room.on(RoomEvent.TrackSubscribed, (track: any, publication: any, participant: any) => {
            const pid = participant.identity || participant.sid;
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              const current = next.get(pid) || {
                participantId: pid,
                participantName: participant.name || 'Squad Member',
                role: 'Squad Member',
                isHost: false,
                videoTrack: null,
                audioTrack: null,
                isVideoMuted: true,
                isAudioMuted: false,
                isSpeaking: false,
              };

              if (track.kind === Track.Kind.Video) {
                current.videoTrack = track;
                current.isVideoMuted = publication.isMuted;
              } else if (track.kind === Track.Kind.Audio) {
                current.audioTrack = track;
                current.isAudioMuted = publication.isMuted;
              }

              next.set(pid, { ...current });
              return next;
            });
          });

          room.on(RoomEvent.TrackUnsubscribed, (track: any, _publication: any, participant: any) => {
            const pid = participant.identity || participant.sid;
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              const current = next.get(pid);
              if (current) {
                if (track.kind === Track.Kind.Video) current.videoTrack = null;
                if (track.kind === Track.Kind.Audio) current.audioTrack = null;
                next.set(pid, { ...current });
              }
              return next;
            });
          });

          room.on(RoomEvent.TrackMuted, (publication: any, participant: any) => {
            const pid = participant.identity || participant.sid;
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              const current = next.get(pid);
              if (current) {
                if (publication.kind === Track.Kind.Video) current.isVideoMuted = true;
                if (publication.kind === Track.Kind.Audio) current.isAudioMuted = true;
                next.set(pid, { ...current });
              }
              return next;
            });
          });

          room.on(RoomEvent.TrackUnmuted, (publication: any, participant: any) => {
            const pid = participant.identity || participant.sid;
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              const current = next.get(pid);
              if (current) {
                if (publication.kind === Track.Kind.Video) current.isVideoMuted = false;
                if (publication.kind === Track.Kind.Audio) current.isAudioMuted = false;
                next.set(pid, { ...current });
              }
              return next;
            });
          });

          room.on(RoomEvent.ActiveSpeakersChanged, (speakers: any[]) => {
            const activeSpeakerIds = new Set(speakers.map((s) => s.identity || s.sid));
            setRemoteFeeds((prev) => {
              let changed = false;
              const next = new Map(prev);
              for (const [id, feed] of next.entries()) {
                const speaking = activeSpeakerIds.has(id);
                if (feed.isSpeaking !== speaking) {
                  next.set(id, { ...feed, isSpeaking: speaking });
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          });

          room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            if (!room.canPlaybackAudio) {
              setAudioAutoplayBlocked(true);
            } else {
              setAudioAutoplayBlocked(false);
            }
          });

          room.on(RoomEvent.ConnectionStateChanged, (state: string) => {
            if (state === 'reconnecting') setConnectionStatus('reconnecting');
            if (state === 'connected') {
              setConnectionStatus('connected_livekit');
              setActiveProvider('livekit');
            }
            if (state === 'disconnected') {
              setConnectionStatus(stream ? 'connected_webrtc' : 'disconnected');
              setActiveProvider(stream ? 'webrtc' : 'none');
            }
          });

          // Connect to room
          await room.connect(serverUrl, token);
          setConnectionStatus('connected_livekit');
          setActiveProvider('livekit');

          // Check if audio playback is permitted by browser policy
          if (!room.canPlaybackAudio) {
            setAudioAutoplayBlocked(true);
          }

          // Enable microphone & camera via LiveKit SDK
          try {
            await room.localParticipant.setMicrophoneEnabled(!isMuted);
            setIsPublishingAudio(!isMuted);
          } catch (micPubErr) {
            console.warn('[LiveKitVideoRoom] LiveKit mic publish notice:', micPubErr);
          }

          try {
            await room.localParticipant.setCameraEnabled(isVideoEnabled);
            setIsPublishingVideo(isVideoEnabled);
          } catch (camPubErr) {
            console.warn('[LiveKitVideoRoom] LiveKit cam publish notice:', camPubErr);
          }

          // Ingest already-connected participants
          room.remoteParticipants.forEach((p: any) => {
            updateParticipantFeed(p);
          });
          return;
        } catch (lkConnectErr) {
          console.warn('[LiveKitVideoRoom] LiveKit Cloud connect failed, activating WebRTC mesh:', lkConnectErr);
        }
      }
    } catch (tokenErr) {
      console.warn('[LiveKitVideoRoom] Media token notice:', tokenErr);
    }

    // 3. Fallback: Native WebRTC Mesh
    if (stream) {
      setConnectionStatus('connected_webrtc');
      setActiveProvider('webrtc');

      // Initiate WebRTC connections to existing squad members if host
      remoteParticipants.forEach((p) => {
        if (p.id !== myIdentity) {
          const shouldInitiate = isHost || myIdentity < p.id;
          if (shouldInitiate) {
            setupWebRtcPeerConnection(p.id, p.name, true);
          }
        }
      });
    } else {
      setConnectionStatus('disconnected');
      setActiveProvider('none');
    }
  }, [
    meetingId,
    meetingCode,
    myIdentity,
    participantName,
    isHost,
    stopLocalTracks,
    cleanupPeerConnections,
    isMuted,
    isVideoEnabled,
    externalToggleVideo,
    remoteParticipants,
    setupWebRtcPeerConnection,
  ]);

  // Run initialization on mount & cleanup on unmount
  useEffect(() => {
    initMedia();
    return () => {
      stopLocalTracks();
      cleanupPeerConnections();
      if (livekitRoomRef.current) {
        try {
          livekitRoomRef.current.disconnect();
        } catch {}
      }
    };
  }, [initMedia, stopLocalTracks, cleanupPeerConnections]);

  // Synchronize mic mute state with physical hardware audio track & LiveKit
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !isMuted;
      });
    }

    if (livekitRoomRef.current?.localParticipant) {
      livekitRoomRef.current.localParticipant
        .setMicrophoneEnabled(!isMuted)
        .then(() => setIsPublishingAudio(!isMuted))
        .catch(() => {});
    } else {
      setIsPublishingAudio(!isMuted && !!localStreamRef.current?.getAudioTracks().length);
    }

    if (isMuted) {
      setIsSpeakingLocally(false);
      setAudioLevel(0);
    }
  }, [isMuted]);

  // Synchronize camera toggle with physical hardware video track & LiveKit
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
      if (localMiniVideoRef.current && isVideoEnabled) {
        localMiniVideoRef.current.srcObject = localStreamRef.current;
        localMiniVideoRef.current.play().catch(() => {});
      }
    }

    if (livekitRoomRef.current?.localParticipant) {
      livekitRoomRef.current.localParticipant
        .setCameraEnabled(isVideoEnabled)
        .then(() => setIsPublishingVideo(isVideoEnabled))
        .catch(() => {});
    } else {
      setIsPublishingVideo(isVideoEnabled && !!localStreamRef.current?.getVideoTracks().length);
    }
  }, [isVideoEnabled]);

  const toggleCamera = () => {
    if (externalToggleVideo) {
      externalToggleVideo();
    } else {
      setInternalVideoEnabled((prev) => !prev);
    }
  };

  const remoteFeedList = Array.from(remoteFeeds.values());

  // ---------------------------------------------------------------------------
  // MINIMIZED VIEW: Compact Video Strip when Strategy Room is collapsed
  // ---------------------------------------------------------------------------
  if (!isDrawerOpen) {
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* Hidden persistent audio feeds for continuous background audio playback */}
        <div className="hidden" aria-hidden="true">
          {remoteFeedList.map((feed) => (
            <PersistentAudioFeed
              key={feed.participantId}
              feed={feed}
              onAutoplayBlocked={() => setAudioAutoplayBlocked(true)}
            />
          ))}
        </div>

        {/* Local Participant Compact Thumbnail */}
        <div
          onClick={onExpandDrawer}
          className={`relative w-12 h-9 sm:w-16 sm:h-11 rounded-lg bg-slate-900 border overflow-hidden flex items-center justify-center shrink-0 shadow cursor-pointer transition-all hover:scale-105 ${
            isSpeakingLocally
              ? 'border-[#a3e635] shadow-[0_0_8px_rgba(163,230,53,0.5)] ring-1 ring-[#a3e635]'
              : 'border-slate-800 hover:border-slate-700'
          }`}
          title={`${participantName} (You) - Click to expand briefing`}
        >
          <video
            ref={localMiniVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 ${
              isVideoEnabled && !mediaError ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
            }`}
          />
          {(!isVideoEnabled || mediaError) && (
            <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-center p-0.5">
              <span className="text-[10px] font-bold text-[#a3e635]">
                {participantName.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-slate-950/85 px-1 py-0.5 flex items-center justify-between text-[8px] leading-none text-slate-300">
            <span className="truncate max-w-[28px] sm:max-w-[36px]">You</span>
            {isMuted ? (
              <MicOff className="w-2 h-2 text-rose-400" />
            ) : (
              <Mic className="w-2 h-2 text-emerald-400" />
            )}
          </div>
        </div>

        {/* Remote Participants Compact Thumbnails */}
        {remoteFeedList.map((feed) => (
          <RemoteVideoTile
            key={feed.participantId}
            feed={feed}
            compact={true}
            onClick={onExpandDrawer}
          />
        ))}

        {remoteFeedList.length === 0 && (
          <div
            onClick={onExpandDrawer}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/60 border border-dashed border-slate-800 text-[10px] text-slate-400 hover:text-white cursor-pointer transition-colors"
          >
            <Users className="w-3 h-3 text-slate-500" />
            <span className="hidden sm:inline">Waiting for squad</span>
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FULL VIEW: Large Video Grid inside Expanded Strategy Room
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-2">
      {/* Hidden persistent audio elements to guarantee audio is heard at all times */}
      <div className="hidden" aria-hidden="true">
        {remoteFeedList.map((feed) => (
          <PersistentAudioFeed
            key={feed.participantId}
            feed={feed}
            onAutoplayBlocked={() => setAudioAutoplayBlocked(true)}
          />
        ))}
      </div>

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
          <span className="text-white font-bold">Tactical Comms</span>
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowDiagnostics((prev) => !prev)}
            className="text-[10px] text-slate-400 hover:text-[#a3e635] flex items-center gap-0.5 transition-colors cursor-pointer"
            title="Toggle Connection Diagnostics"
          >
            <Activity className="w-3 h-3" />
            <span>Diagnostics</span>
            {showDiagnostics ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          </button>

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
      </div>

      {/* Browser Autoplay Blocked Banner */}
      {audioAutoplayBlocked && (
        <div className="p-2.5 rounded-xl bg-indigo-950/80 border border-indigo-700/80 text-indigo-200 text-xs flex items-center justify-between gap-2 animate-fade-in shadow-md">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-indigo-300 shrink-0" />
            <div>
              <p className="font-semibold text-white leading-tight">Audio Playback Restricted</p>
              <p className="text-[11px] text-indigo-300/90 leading-tight">
                Browser blocked background audio until you interact.
              </p>
            </div>
          </div>
          <button
            onClick={handleUnlockAudio}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-[#a3e635] hover:bg-[#b4f046] text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Enable Audio</span>
          </button>
        </div>
      )}

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

      {/* Comprehensive Diagnostics Panel (Requirement 6) */}
      {showDiagnostics && (
        <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-300 text-[11px] space-y-1.5 animate-fade-in shadow-inner font-mono">
          <div className="text-[10px] uppercase font-bold text-[#a3e635] tracking-wider border-b border-slate-800 pb-1 flex items-center justify-between">
            <span>Real-Time Comms Diagnostics</span>
            <span>Room: {meetingCode || meetingId.slice(0, 8)}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
            <div>
              <span className="text-slate-500">Media Provider:</span>{' '}
              <span className="text-white font-bold">{activeProvider === 'livekit' ? 'LiveKit Cloud SFU' : activeProvider === 'webrtc' ? 'WebRTC P2P Mesh' : 'None'}</span>
            </div>
            <div>
              <span className="text-slate-500">Comms Status:</span>{' '}
              <span className="text-white font-bold">{connectionStatus}</span>
            </div>
            <div>
              <span className="text-slate-500">Local Mic Publish:</span>{' '}
              <span className={isPublishingAudio ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {isPublishingAudio ? 'Active' : 'Muted'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Local Cam Publish:</span>{' '}
              <span className={isPublishingVideo ? 'text-emerald-400 font-bold' : 'text-slate-400 font-bold'}>
                {isPublishingVideo ? 'Transmitting' : 'Disabled'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Remote Squad:</span>{' '}
              <span className="text-white font-bold">{remoteFeedList.length} connected</span>
            </div>
            <div>
              <span className="text-slate-500">Audio Playback:</span>{' '}
              <span className={audioAutoplayBlocked ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {audioAutoplayBlocked ? 'Blocked (Autoplay)' : 'Playing'}
              </span>
            </div>
          </div>
          {remoteFeedList.length > 0 && (
            <div className="border-t border-slate-800 pt-1 text-[9px] text-slate-400 space-y-0.5">
              <span className="text-slate-500 block">Subscribed Remote Tracks:</span>
              {remoteFeedList.map((f) => (
                <div key={f.participantId} className="flex items-center justify-between">
                  <span className="text-slate-300 truncate max-w-[120px]">{f.participantName}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={f.audioTrack ? 'text-emerald-400' : 'text-slate-600'}>
                      Audio: {f.audioTrack ? (f.isAudioMuted ? 'Muted' : 'Live') : 'None'}
                    </span>
                    <span className={f.videoTrack ? 'text-blue-400' : 'text-slate-600'}>
                      Video: {f.videoTrack ? (f.isVideoMuted ? 'Off' : 'Live') : 'None'}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dynamic Grid of video tiles (Local + Remote Participants) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Local user tile */}
        <div
          className={`relative aspect-video rounded-xl bg-slate-900 border overflow-hidden flex items-center justify-center shadow-lg transition-all ${
            isSpeakingLocally
              ? 'border-[#a3e635] shadow-[0_0_12px_rgba(163,230,53,0.35)] ring-1 ring-[#a3e635]/50'
              : 'border-slate-800'
          }`}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${
              isVideoEnabled && !mediaError ? 'opacity-100' : 'opacity-0 pointer-events-none absolute'
            }`}
          />

          {(!isVideoEnabled || mediaError) && (
            <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex flex-col items-center justify-center p-2 text-center animate-fade-in">
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

              <span className="text-xs font-semibold text-white truncate max-w-full px-1">
                {participantName} (You)
              </span>

              <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                <VideoOff className="w-3 h-3 text-slate-500" />
                <span>Camera Off</span>
              </span>
            </div>
          )}

          {isSpeakingLocally && (
            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Speaking</span>
            </div>
          )}

          <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-[10px] bg-slate-950/85 px-2 py-0.5 rounded-md backdrop-blur-sm border border-slate-800/60">
            <span className="truncate max-w-[85px] text-slate-300 font-medium">
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
                  {isSpeakingLocally && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Remote participant tiles */}
        {remoteFeedList.length === 0 ? (
          <div className="relative aspect-video rounded-xl bg-slate-900/40 border border-dashed border-slate-800 flex flex-col items-center justify-center p-2 text-center text-slate-500">
            <Users className="w-5 h-5 mb-1 text-slate-600" />
            <span className="text-[11px] font-medium text-slate-400">Waiting for Squad</span>
            <span className="text-[9px] text-slate-500">Share meeting code to invite</span>
          </div>
        ) : (
          remoteFeedList.map((feed) => (
            <RemoteVideoTile key={feed.participantId} feed={feed} compact={false} />
          ))
        )}
      </div>

      {/* Local Controls Strip inside Expanded View */}
      <div className="flex items-center justify-between gap-2 mt-1 pt-2 border-t border-slate-800/80">
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
