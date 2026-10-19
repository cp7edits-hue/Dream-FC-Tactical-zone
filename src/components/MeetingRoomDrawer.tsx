import { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
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

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Current participant info
  const myParticipantName = currentUser?.name || (isHost ? meeting.hostName : 'Squad Member');
  const myParticipantId = currentUser?.id || `p_${meeting.id}_user`;

  // Auto scroll to bottom of chat
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

    if (activeTab !== 'chat') {
      setUnreadCount((c) => c + 1);
    }
  }, [incomingChatMessage, activeTab]);

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
          if (activeTab !== 'chat') {
            setUnreadCount((c) => c + 1);
          }
        }
      };
    } catch {}

    return () => {
      bc?.close();
    };
  }, [meeting?.id, activeTab]);

  // Scroll to bottom when messages update in chat tab
  useEffect(() => {
    if (activeTab === 'chat') {
      scrollToBottom();
      setUnreadCount(0);
    }
  }, [messages, activeTab]);

  if (!isOpen) return null;

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

  return (
    <aside
      aria-label="Strategy Room Details"
      className="fixed top-16 right-4 bottom-14 z-40 w-84 sm:w-96 rounded-2xl bg-slate-950/95 border border-slate-800/90 shadow-2xl flex flex-col p-4 backdrop-blur-md text-slate-100 select-none overflow-hidden pointer-events-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#a3e635]/20 border border-[#a3e635]/40 flex items-center justify-center text-[#a3e635]">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Strategy Room</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <div className="text-[11px] text-slate-400 truncate max-w-[170px]">{meeting.title}</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Minimize drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Code, Passcode & Lock Strip */}
      <div className="my-2.5 p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div>
          <div className="text-[10px] text-slate-400 uppercase font-semibold">Meeting Code & Pass</div>
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
                isLocked
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
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
      <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 mb-2.5 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('video')}
          className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer flex items-center justify-center gap-1 ${
            activeTab === 'video' ? 'bg-[#a3e635] text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
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
            activeTab === 'chat' ? 'bg-[#a3e635] text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          <span>Tactical Chat</span>
          {unreadCount > 0 && activeTab !== 'chat' && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse ml-0.5" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer ${
            activeTab === 'notes' ? 'bg-[#a3e635] text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Directives
        </button>
      </div>

      {/* Tab 1: Video & Participant Moderation */}
      {activeTab === 'video' && (
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* LiveKit & WebRTC media box */}
          <LiveKitVideoRoom
            meetingId={meeting.id}
            isHost={isHost}
            participantId={myParticipantId}
            participantName={myParticipantName}
            isMuted={!meeting.isMicActive}
            onToggleMic={onToggleMic}
            remoteParticipants={meeting.participants.filter((p) => p.name !== myParticipantName)}
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

                    {p.isSpeaking && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        Speaking
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: In-Meeting Realtime Tactical Chat */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 mb-2">
            {isLoadingMessages && messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Loading match chat...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-xs text-slate-500 text-center p-4">
                <MessageSquare className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
                <span className="font-semibold text-slate-400">No tactical messages yet</span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  Send a tactical directive or briefing to your squad.
                </span>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_name === myParticipantName;
                const isCoach = m.sender_name === meeting.hostName;

                return (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-xl border text-xs transition-colors ${
                      isMe
                        ? 'bg-slate-900 border-[#a3e635]/30 ml-4'
                        : isCoach
                        ? 'bg-[#a3e635]/10 border-[#a3e635]/40 mr-4'
                        : 'bg-slate-900/70 border-slate-800 mr-4'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-semibold ${isMe ? 'text-[#a3e635]' : 'text-slate-200'}`}>
                          {m.sender_name} {isMe && '(You)'}
                        </span>
                        {isCoach && (
                          <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-[#a3e635]/20 text-[#a3e635] border border-[#a3e635]/40 uppercase">
                            Coach
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 text-[9px]">{m.created_at}</span>
                    </div>
                    <p className="text-slate-100 text-xs leading-relaxed break-words">{m.message}</p>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input form */}
          <form onSubmit={handleSendMessage} className="flex gap-1.5 pt-2 border-t border-slate-800">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Tactical directive or match note..."
              maxLength={500}
              disabled={isSending}
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635]"
            />
            <button
              type="submit"
              disabled={!chatInput.trim() || isSending}
              className="px-3 py-1.5 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center justify-center shadow-md shadow-[#a3e635]/20"
              title="Send message (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: Tactical Directives */}
      {activeTab === 'notes' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <form onSubmit={handleAddNote} className="flex gap-1.5 mb-2.5">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add key match instruction..."
              maxLength={200}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#a3e635]"
            />
            <button
              type="submit"
              disabled={!newNote.trim()}
              className="px-2.5 py-1.5 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {meeting.notes.map((note, idx) => (
              <div
                key={idx}
                className="group flex items-start justify-between gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300"
              >
                <span className="flex-1 text-[11px] leading-relaxed">{note}</span>
                <button
                  onClick={() => handleRemoveNote(idx)}
                  className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity cursor-pointer"
                  title="Remove directive"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer Exit Button */}
      <div className="pt-2.5 mt-2 border-t border-slate-800">
        <button
          onClick={onLeaveMeeting}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-950/40 border border-rose-800/50 hover:bg-rose-900/60 text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{isHost ? 'End Briefing for All' : 'Leave Strategy Room'}</span>
        </button>
      </div>
    </aside>
  );
};
