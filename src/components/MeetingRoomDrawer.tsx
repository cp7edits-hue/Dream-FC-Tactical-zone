import { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Copy,
  Check,
  Plus,
  Trash2,
  LogOut,
  Radio,
  Lock,
  Unlock,
  MessageSquare,
  Shield,
  Send,
  Users,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { MeetingSession } from '../types/tactics';
import { LiveKitVideoRoom } from './LiveKitVideoRoom';
import { api } from '../services/api';

export interface ChatMessage {
  id: string;
  meeting_id?: string;
  sender_participant_id?: string;
  sender_name: string;
  message: string;
  created_at: string;
}

interface MeetingRoomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  meeting: MeetingSession;
  isHost: boolean;
  currentUser?: { id: string; name: string; role: string };
  boardRevision: number;
  onUpdateNotes: (notes: string[]) => void;
  onToggleMic: () => void;
  onLeaveMeeting: () => void;
  onModerationAction: (participantId: string, action: string) => void;
  onToggleLock: () => void;
  isLocked: boolean;
  incomingChatMessage?: ChatMessage | null;
}

export const MeetingRoomDrawer = ({
  isOpen,
  onClose,
  onOpen,
  meeting,
  isHost,
  currentUser,
  boardRevision,
  onUpdateNotes,
  onToggleMic,
  onLeaveMeeting,
  onModerationAction,
  onToggleLock,
  isLocked,
  incomingChatMessage,
}: MeetingRoomDrawerProps) => {
  const [activeTab, setActiveTab] = useState<'video' | 'chat' | 'notes'>('video');
  const [newNote, setNewNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Synchronized camera state
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Current participant info
  const myParticipantName = currentUser?.name || (isHost ? meeting.hostName : 'Squad Member');
  const myParticipantId = currentUser?.id || `p_${meeting.id}_user`;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load initial chat messages
  useEffect(() => {
    if (!meeting?.id) return;
    setIsLoadingMessages(true);

    api.getMessages(meeting.id).then((list) => {
      setIsLoadingMessages(false);
      if (Array.isArray(list)) {
        setMessages(list);
      }
    });
  }, [meeting?.id]);

  // Listen to incomingChatMessage prop from parent (SSE events)
  useEffect(() => {
    if (!incomingChatMessage) return;
    setMessages((prev) => {
      if (prev.some((m) => m.id === incomingChatMessage.id)) return prev;
      return [...prev, incomingChatMessage];
    });

    if (!isOpen || activeTab !== 'chat') {
      setUnreadCount((c) => c + 1);
    }
  }, [incomingChatMessage, isOpen, activeTab]);

  // Also listen directly to BroadcastChannel for multi-tab instantaneous delivery
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window) || !meeting?.id) return;

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(`dfc_realtime_${meeting.id}`);
      bc.onmessage = (event) => {
        if (event.data?.type === 'chat_message' && event.data.payload) {
          const newMsg = event.data.payload as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!isOpen || activeTab !== 'chat') {
            setUnreadCount((c) => c + 1);
          }
        }
      };
    } catch {}

    return () => {
      bc?.close();
    };
  }, [meeting?.id, isOpen, activeTab]);

  // Scroll to bottom when messages update in chat tab
  useEffect(() => {
    if (isOpen && activeTab === 'chat') {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [messages, isOpen, activeTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setChatInput('');

    try {
      const res = await api.sendMessage(meeting.id, text, {
        id: myParticipantId,
        name: myParticipantName,
      });

      if (res.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.message.id)) return prev;
          return [...prev, res.message];
        });
      }
    } catch (err) {
      console.warn('[MeetingRoomDrawer] Send message notice:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    onUpdateNotes([...meeting.notes, newNote.trim()]);
    setNewNote('');
  };

  const handleRemoveNote = (idx: number) => {
    onUpdateNotes(meeting.notes.filter((_, i) => i !== idx));
  };

  const copyRoomCode = () => {
    navigator.clipboard?.writeText(
      `Dream FC Tactical Session\nMeeting Code: ${meeting.code}\nPasscode: ${meeting.passcode}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remoteSquad = meeting.participants.filter(
    (p) => p.name !== myParticipantName && p.id !== myParticipantId
  );

  return (
    <>
      {/* =========================================================================
          1. COMPACT TACTICAL MEETING BAR (Always visible when collapsed, mobile-first!)
          ========================================================================= */}
      <div
        className={`fixed top-14 left-2 right-2 sm:left-4 sm:right-auto z-30 flex items-center justify-between gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-950/92 border border-slate-800/90 shadow-2xl backdrop-blur-md text-slate-100 select-none transition-all duration-300 pointer-events-auto ${
          isOpen ? 'opacity-0 pointer-events-none -translate-y-4' : 'opacity-100 translate-y-0'
        }`}
        style={{ maxWidth: 'calc(100vw - 16px)' }}
      >
        {/* Left: Meeting Status & Room Code */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-[#a3e635]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden xs:inline">ROOM:</span>
            <span>{meeting.code}</span>
          </div>

          <button
            onClick={copyRoomCode}
            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Copy meeting credentials"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>

          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 font-semibold flex items-center gap-1">
            <Users className="w-2.5 h-2.5 text-[#a3e635]" />
            <span>{meeting.participants.length}</span>
          </span>
        </div>

        {/* Center: Live Squad Presence Badges (Click to expand Briefing) */}
        <div
          onClick={() => onOpen?.()}
          className="flex-1 overflow-hidden flex items-center justify-center gap-1.5 px-1 cursor-pointer group"
          title="Click to expand Strategy Room briefing and live video"
        >
          {meeting.participants.slice(0, 4).map((p) => {
            const isMe = p.name === myParticipantName || p.id === myParticipantId;
            return (
              <div
                key={p.id}
                className="relative flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] text-slate-300 group-hover:border-slate-700 transition-colors"
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] ${
                    p.avatarColor || (p.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white')
                  }`}
                >
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <span className="max-w-[64px] truncate text-[10px] font-medium hidden xs:inline">
                  {isMe ? 'You' : p.name.split(' ')[0]}
                </span>
                {p.isMuted ? (
                  <MicOff className="w-2.5 h-2.5 text-rose-400" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
            );
          })}
          {meeting.participants.length > 4 && (
            <span className="text-[10px] text-slate-400 font-mono">
              +{meeting.participants.length - 4}
            </span>
          )}
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Quick Mic Toggle */}
          <button
            onClick={onToggleMic}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              meeting.isMicActive
                ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-400 hover:bg-emerald-900'
                : 'bg-rose-950/80 border-rose-800 text-rose-400 hover:bg-rose-900'
            }`}
            title={meeting.isMicActive ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {meeting.isMicActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>

          {/* Quick Camera Toggle */}
          <button
            onClick={() => setIsVideoEnabled((v) => !v)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              isVideoEnabled
                ? 'bg-slate-900 border-[#a3e635]/50 text-[#a3e635] hover:bg-slate-800'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isVideoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
          </button>

          {/* Quick Chat Button with Unread Badge */}
          <button
            onClick={() => {
              setActiveTab('chat');
              onOpen?.();
            }}
            className="relative p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Open Tactical Chat"
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#a3e635]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1 rounded-full bg-rose-500 text-white font-bold text-[8px] leading-tight animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Expand Strategy Room Button */}
          <button
            onClick={() => onOpen?.()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-[11px] hover:bg-[#b4f046] transition-colors cursor-pointer shadow-sm"
            title="Expand Strategy Room"
          >
            <Maximize2 className="w-3 h-3" />
            <span className="hidden sm:inline">Briefing</span>
          </button>

          {/* Quick Exit Button */}
          <button
            onClick={onLeaveMeeting}
            className="p-1.5 rounded-lg bg-rose-950/60 border border-rose-900/80 text-rose-400 hover:bg-rose-900/80 transition-colors cursor-pointer"
            title={isHost ? 'End Briefing for All' : 'Leave Briefing'}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. EXPANDED STRATEGY ROOM DRAWER / MODAL
          (Mounted persistently so audio/video NEVER drops when collapsed!)
          ========================================================================= */}
      <aside
        aria-label="Strategy Room Details"
        className={`fixed z-40 flex flex-col backdrop-blur-md text-slate-100 select-none overflow-hidden transition-all duration-300 ${
          isOpen
            ? 'opacity-100 pointer-events-auto inset-x-2 top-14 bottom-14 sm:inset-x-auto sm:right-4 sm:top-16 sm:w-96 rounded-2xl bg-slate-950/95 border border-slate-800/90 shadow-2xl p-3 sm:p-4'
            : 'opacity-0 pointer-events-none translate-x-full inset-y-0 right-0 w-0 p-0 border-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#a3e635]/20 border border-[#a3e635]/40 flex items-center justify-center text-[#a3e635]">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>Strategy Room</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-[150px] sm:max-w-[170px]">
                {meeting.title}
              </div>
            </div>
          </div>

          {/* Prominent "Return to Tactical Board" Button for Mobile & Desktop */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] transition-colors cursor-pointer shadow-md"
              title="Collapse to Tactical Board"
            >
              <ChevronDown className="w-3.5 h-3.5 sm:hidden" />
              <Minimize2 className="w-3 h-3 hidden sm:inline" />
              <span>Board</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Minimize drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Code, Passcode & Lock Strip */}
        <div className="my-2 p-2 sm:p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-[9px] text-slate-400 uppercase font-semibold">Meeting Code & Pass</div>
            <div className="font-mono text-xs font-bold text-[#a3e635]">
              {meeting.code} <span className="text-slate-500">•</span> {meeting.passcode}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={copyRoomCode}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Copy meeting credentials"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {isHost && (
              <button
                onClick={onToggleLock}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLocked ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title={isLocked ? 'Room Locked (Click to Unlock)' : 'Lock Room to Prevent New Joins'}
              >
                {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              </button>
            )}

            <div className="px-2 py-0.5 rounded bg-slate-950 text-[10px] font-mono text-emerald-400 border border-slate-800">
              Rev #{boardRevision}
            </div>
          </div>
        </div>

        {/* Drawer Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 mb-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'video' ? 'bg-[#a3e635] text-slate-950 shadow-sm font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>Media & Squad</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('chat');
              setUnreadCount(0);
            }}
            className={`relative flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'chat' ? 'bg-[#a3e635] text-slate-950 shadow-sm font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>Chat</span>
            {unreadCount > 0 && activeTab !== 'chat' && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer ${
              activeTab === 'notes' ? 'bg-[#a3e635] text-slate-950 shadow-sm font-bold' : 'text-slate-400 hover:text-white'
            }`}
          >
            Directives
          </button>
        </div>

        {/* Tab 1: Video & Participant Moderation (Kept permanently mounted so WebRTC/LiveKit audio & video never disconnect) */}
        <div className={`flex-1 overflow-y-auto space-y-3 pr-1 ${activeTab === 'video' ? 'block' : 'hidden'}`}>
          {/* LiveKit & WebRTC Media Box in Full Grid Mode */}
          <LiveKitVideoRoom
            meetingId={meeting.id}
            isHost={isHost}
            participantId={myParticipantId}
            participantName={myParticipantName}
            isMuted={!meeting.isMicActive}
            onToggleMic={onToggleMic}
            isVideoEnabled={isVideoEnabled}
            onToggleVideo={() => setIsVideoEnabled((v) => !v)}
            remoteParticipants={remoteSquad}
            isDrawerOpen={true}
          />

          {/* Participant list with moderation */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Connected Squad ({meeting.participants.length})</span>
              <span className="text-[10px] text-emerald-400 font-normal">Realtime Sync</span>
            </div>

            <div className="space-y-1.5">
              {meeting.participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${p.avatarColor}`}
                    >
                      {p.name.slice(0, 1)}
                    </div>
                    <div>
                      <span className="font-semibold text-white block leading-tight">
                        {p.name} {p.name === myParticipantName && '(You)'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">{p.role}</span>
                    </div>
                  </div>

                  {/* Actions / Moderation */}
                  <div className="flex items-center gap-1.5">
                    {isHost && p.name !== myParticipantName && (
                      <button
                        onClick={() => onModerationAction(p.id, p.isMuted ? 'unmute' : 'mute')}
                        className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                        title={p.isMuted ? 'Unmute participant' : 'Mute participant'}
                      >
                        {p.isMuted ? (
                          <MicOff className="w-3 h-3 text-rose-400" />
                        ) : (
                          <Mic className="w-3 h-3 text-emerald-400" />
                        )}
                      </button>
                    )}

                    {p.role === 'Head Coach' || p.role === 'host' ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#a3e635]/20 text-[#a3e635] text-[10px] font-bold flex items-center gap-0.5">
                        <Shield className="w-2.5 h-2.5" />
                        Coach
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-300 text-[10px]">
                        Squad
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tab 2: Tactical Chat */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Messages list */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-2">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                  <MessageSquare className="w-8 h-8 mb-2 text-slate-600" />
                  <p className="text-xs font-semibold text-slate-400">Briefing Channel Open</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Messages are synchronized in real-time across all connected tactical squad members.
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_name === myParticipantName;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5">
                        <span className="font-semibold text-slate-300">
                          {isMe ? 'You' : m.sender_name}
                        </span>
                        <span>•</span>
                        <span>{m.created_at}</span>
                      </div>
                      <div
                        className={`max-w-[85%] px-3 py-1.5 rounded-xl text-xs break-words ${
                          isMe
                            ? 'bg-[#a3e635] text-slate-950 font-medium rounded-tr-none'
                            : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700/60'
                        }`}
                      >
                        {m.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat input form */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tactical directive or note..."
                maxLength={500}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isSending}
                className="p-2 rounded-xl bg-[#a3e635] text-slate-950 hover:bg-[#b4f046] transition-colors cursor-pointer disabled:opacity-40"
                title="Send directive"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Directives / Strategy Notes */}
        {activeTab === 'notes' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                <span>Match Directives</span>
                <span className="text-[10px] text-[#a3e635] font-normal">{meeting.notes.length} Active</span>
              </div>

              {meeting.notes.map((note, idx) => (
                <div
                  key={idx}
                  className="group flex items-start justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs"
                >
                  <p className="text-slate-200 text-xs leading-relaxed flex-1 pr-2">{note}</p>
                  {isHost && (
                    <button
                      onClick={() => handleRemoveNote(idx)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity cursor-pointer shrink-0"
                      title="Delete directive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add note input for host */}
            {isHost && (
              <form onSubmit={handleAddNote} className="flex items-center gap-1.5 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add tactical directive..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635]"
                />
                <button
                  type="submit"
                  disabled={!newNote.trim()}
                  className="p-2 rounded-xl bg-[#a3e635] text-slate-950 hover:bg-[#b4f046] transition-colors cursor-pointer disabled:opacity-40"
                  title="Add directive"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer Exit Button */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Return to Pitch</span>
          </button>

          <button
            onClick={onLeaveMeeting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 hover:bg-rose-900 text-xs font-semibold transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isHost ? 'End Briefing' : 'Leave Briefing'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};
