import { useState } from 'react';
import { X, Video, LogIn, Shield, Users, Copy, Check, Lock, Users2, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';

interface MeetingModalProps {
  isOpen: boolean;
  mode: 'create' | 'join';
  onClose: () => void;
  onSuccess: (meetingData: any, participantData: any) => void;
}

export const MeetingModal = ({ isOpen, mode, onClose, onSuccess }: MeetingModalProps) => {
  // Create state
  const [title, setTitle] = useState('Dream FC Strategy Briefing');
  const [hostName, setHostName] = useState('Head Coach');
  const [boardMode, setBoardMode] = useState<'coach_only' | 'open_collaboration' | 'host_assigned'>('coach_only');
  const [maxParticipants, setMaxParticipants] = useState(25);
  const [lobbyEnabled, setLobbyEnabled] = useState(false);

  // Join state
  const [joinCode, setJoinCode] = useState('');
  const [joinPasscode, setJoinPasscode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinRole, setJoinRole] = useState<'player' | 'collaborator' | 'analyst'>('player');

  // Status & errors
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [migrationError, setMigrationError] = useState<{
    message: string;
    details?: string;
    sqlFile?: string;
  } | null>(null);
  const [createdResult, setCreatedResult] = useState<{ code: string; passcode: string; warning?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCreateSubmit = async (e?: React.FormEvent, localFallback = false) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setMigrationError(null);

    try {
      const res = await api.createMeeting({
        title,
        hostName,
        boardPermissionMode: boardMode,
        maxParticipants,
        lobbyEnabled,
        allowLocalFallback: localFallback,
      });

      setCreatedResult({
        code: res.meeting.code,
        passcode: res.meeting.passcode,
        warning: res.persistence?.note || (res.persistence?.database === false ? 'Database table migration pending. Session active on server.' : undefined),
      });

      onSuccess(res.meeting, res.participant);
    } catch (err: any) {
      if (err.code === 'DATABASE_MIGRATION_REQUIRED' || err.message?.includes('PGRST205') || err.message?.includes('schema cache')) {
        setMigrationError({
          message: err.message,
          details: err.details,
          sqlFile: err.sqlFile || 'migrations/000_complete_supabase_setup.sql',
        });
      } else {
        setErrorMsg(err.message || 'Failed to create meeting');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (val: string) => {
    // Check if user pasted full invite: e.g. "Code: DFC-8492\nPasscode: TACTIC-7721"
    if (val.includes('Code:') || val.includes('Passcode:')) {
      const codeMatch = val.match(/Code:\s*([A-Za-z0-9-]+)/i);
      const passMatch = val.match(/Passcode:\s*([A-Za-z0-9-]+)/i);
      if (codeMatch && codeMatch[1]) {
        let extractedCode = codeMatch[1].toUpperCase().trim().replace(/\s+/g, '');
        if (/^DFC[A-Z0-9]{4}$/.test(extractedCode)) {
          extractedCode = `DFC-${extractedCode.substring(3)}`;
        }
        setJoinCode(extractedCode);
      }
      if (passMatch && passMatch[1]) {
        setJoinPasscode(passMatch[1].trim());
      }
      return;
    }

    let cleaned = val.toUpperCase().replace(/\s+/g, '');
    // If user enters DFCHRZX without hyphen, auto-insert hyphen
    if (/^DFC[A-Z0-9]{4}$/.test(cleaned)) {
      cleaned = `DFC-${cleaned.substring(3)}`;
    }
    setJoinCode(cleaned);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    const cleanCode = joinCode.trim().toUpperCase().replace(/\s+/g, '');
    const cleanPasscode = joinPasscode.trim();

    try {
      const res = await api.joinMeeting({
        code: cleanCode,
        passcode: cleanPasscode,
        displayName: joinName.trim(),
        role: joinRole,
      });

      onSuccess(res.meeting, res.participant);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join meeting. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const copyDetails = () => {
    if (!createdResult) return;
    navigator.clipboard?.writeText(
      `Dream FC Tactical Briefing\nCode: ${createdResult.code}\nPasscode: ${createdResult.passcode}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}

        {migrationError && (
          <div className="mb-4 p-4 rounded-xl bg-amber-950/90 border border-amber-600/70 text-amber-200 text-xs space-y-2.5 shadow-lg">
            <div className="flex items-center gap-2 font-bold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Database Schema Setup Required</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Table <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-300 font-mono">public.meetings</code> is not created yet in your Supabase database. For multi-device persistence across phone and laptop:
            </p>
            <div className="p-2 rounded-lg bg-slate-950 border border-amber-900/50 font-mono text-[10px] text-slate-300 select-all">
              {migrationError.sqlFile}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(migrationError.sqlFile || 'migrations/000_complete_supabase_setup.sql');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied Path!' : 'Copy Migration Path'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleCreateSubmit(undefined, true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-[11px] border border-slate-700 transition-colors cursor-pointer"
              >
                Launch Local-Only Session
              </button>
            </div>
          </div>
        )}

        {mode === 'create' ? (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#a3e635]/20 border border-[#a3e635]/40 flex items-center justify-center text-[#a3e635]">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-white">Create Tactical Meeting</h3>
                <p className="text-xs text-slate-400">Server-verified 3D strategy room with encrypted credentials</p>
              </div>
            </div>

            {createdResult ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Share Credentials With Squad
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Meeting Code</span>
                      <span className="font-mono text-lg font-bold text-[#a3e635]">{createdResult.code}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Join Passcode</span>
                      <span className="font-mono text-lg font-bold text-white">{createdResult.passcode}</span>
                    </div>
                  </div>
                  <button
                    onClick={copyDetails}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied to Clipboard' : 'Copy Meeting Invite'}</span>
                  </button>

                  {createdResult.warning && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-relaxed">
                      <span className="font-semibold block text-amber-200">Database Setup Notice:</span>
                      {createdResult.warning}
                    </div>
                  )}
                </div>

                <button
                  onClick={onClose}
                  className="w-full py-2.5 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-sm hover:bg-[#b4f046] transition-colors cursor-pointer"
                >
                  Enter Strategy Room
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Session Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                    placeholder="e.g. Champions League Semi-Final Prep"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Host Name</label>
                    <input
                      type="text"
                      value={hostName}
                      onChange={(e) => setHostName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                      placeholder="Head Coach"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Max Players</label>
                    <select
                      value={maxParticipants}
                      onChange={(e) => setMaxParticipants(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                    >
                      <option value={15}>15 Players</option>
                      <option value={25}>25 Players (Standard)</option>
                      <option value={50}>50 Players (Large Squad)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Board Permission Mode</label>
                  <select
                    value={boardMode}
                    onChange={(e) => setBoardMode(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                  >
                    <option value="coach_only">Coach Only (Recommended for briefings)</option>
                    <option value="open_collaboration">Open Collaboration (All squad members can draw)</option>
                    <option value="host_assigned">Host Assigned (Coach grants individual edit pass)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={lobbyEnabled}
                    onChange={(e) => setLobbyEnabled(e.target.checked)}
                    className="rounded border-slate-700 text-[#a3e635] focus:ring-[#a3e635]"
                  />
                  <span>Enable Waiting Room (Host must admit each player)</span>
                </label>

                <div className="pt-2 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Video className="w-3.5 h-3.5" />
                    <span>{loading ? 'Generating...' : 'Launch Meeting'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handleJoinSubmit} className="space-y-3.5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-white">Join Tactical Meeting</h3>
                <p className="text-xs text-slate-400">Enter your squad code and secret passcode</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Meeting Code</label>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="e.g. DFC-8492 or 8492"
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs uppercase focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Passcode</label>
              <input
                type="text"
                value={joinPasscode}
                onChange={(e) => setJoinPasscode(e.target.value)}
                placeholder="e.g. TACTIC-7721"
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:outline-none focus:border-[#a3e635]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Your Name</label>
                <input
                  type="text"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="e.g. K. De Bruyne"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Tactical Role</label>
                <select
                  value={joinRole}
                  onChange={(e) => setJoinRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-[#a3e635]"
                >
                  <option value="player">Player / Captain</option>
                  <option value="collaborator">Assistant Coach</option>
                  <option value="analyst">Match Analyst</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] transition-colors cursor-pointer disabled:opacity-40"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{loading ? 'Verifying...' : 'Join Room'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
