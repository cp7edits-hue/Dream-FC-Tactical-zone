import { useState } from 'react';
import {
  Camera,
  Layers,
  Volume2,
  VolumeX,
  Users,
  Video,
  ChevronDown,
  Sparkles,
  Maximize2,
  Share2,
  Tv,
  Bookmark,
  LifeBuoy,
} from 'lucide-react';
import { CameraPreset, MeetingSession, TacticalDrill } from '../types/tactics';
import { PRESET_DRILLS } from '../constants/drills';

interface TopNavbarProps {
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  selectedDrillId: string;
  onSelectDrill: (drill: TacticalDrill) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  meeting: MeetingSession | null;
  onOpenCreateMeeting: () => void;
  onOpenJoinMeeting: () => void;
  onToggleMeetingDrawer: () => void;
  isHeroVisible: boolean;
  onToggleHero: () => void;
  onOpenSavedTactics?: () => void;
  onOpenContact?: () => void;
  canEditBoard?: boolean;
}

export const TopNavbar = ({
  cameraPreset,
  onSelectCameraPreset,
  selectedDrillId,
  onSelectDrill,
  soundEnabled,
  onToggleSound,
  meeting,
  onOpenCreateMeeting,
  onOpenJoinMeeting,
  onToggleMeetingDrawer,
  isHeroVisible,
  onToggleHero,
  onOpenSavedTactics,
  onOpenContact,
  canEditBoard = true,
}: TopNavbarProps) => {
  const [drillMenuOpen, setDrillMenuOpen] = useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);

  const cameraLabels: Record<CameraPreset, { label: string; icon: string }> = {
    broadcast: { label: 'Cinematic Broadcast', icon: '🎥' },
    overhead: { label: 'Tactical Birds-Eye', icon: '📐' },
    attacking: { label: 'Attacking 3rd', icon: '⚡' },
    defending: { label: 'Defensive 3rd', icon: '🛡️' },
    free: { label: 'Free Orbit', icon: '🌐' },
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-3 sm:px-6 py-3 bg-gradient-to-b from-slate-950/90 via-slate-950/70 to-transparent pointer-events-auto">
      {/* Brand Logo & Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleHero}
          className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none"
          title="Click to toggle presentation title"
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700/80 flex items-center justify-center shadow-lg group-hover:border-[#a3e635] transition-colors">
            <span className="font-display font-black text-sm text-[#a3e635]">DFC</span>
          </div>
          <div>
            <div className="font-display font-black text-sm sm:text-base leading-tight tracking-tight uppercase flex items-center gap-1.5">
              <span className="text-white">DREAM FC</span>
              <span className="text-slate-400 font-normal">|</span>
              <span className="text-white font-extrabold">TACTICAL </span>
              <span className="text-[#a3e635] font-extrabold">ZONE</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium hidden sm:block">
              3D Match Planning & Strategy Room
            </p>
          </div>
        </button>

        {/* Meeting Status Badge */}
        {meeting ? (
          <button
            onClick={onToggleMeetingDrawer}
            className="hidden md:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-medium cursor-pointer hover:bg-emerald-900/60 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Room: {meeting.code}</span>
            <span className="text-emerald-500">•</span>
            <span>{meeting.participants.length} Active</span>
          </button>
        ) : (
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-400 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635]" />
            <span>Tactical Board</span>
          </span>
        )}
      </div>

      {/* Middle & Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Presets / Drills Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setDrillMenuOpen(!drillMenuOpen);
              setCameraMenuOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-[#a3e635]" />
            <span className="hidden sm:inline">Tactics:</span>
            <span className="max-w-[120px] truncate">
              {PRESET_DRILLS.find((d) => d.id === selectedDrillId)?.title || 'Preset Play'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {drillMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Preset Tactical Plans</span>
                {!canEditBoard && <span className="text-[10px] text-amber-400 font-medium">Coach Locked</span>}
              </div>
              {PRESET_DRILLS.map((drill) => (
                <button
                  key={drill.id}
                  disabled={!canEditBoard}
                  onClick={() => {
                    if (!canEditBoard) return;
                    onSelectDrill(drill);
                    setDrillMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex flex-col gap-0.5 ${
                    !canEditBoard
                      ? 'opacity-60 cursor-not-allowed text-slate-400'
                      : selectedDrillId === drill.id
                      ? 'bg-[#a3e635]/15 text-[#a3e635] border border-[#a3e635]/30 cursor-pointer'
                      : 'text-slate-200 hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  <span className="font-semibold text-white">{drill.title}</span>
                  <span className="text-[11px] text-slate-400 line-clamp-1">{drill.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Camera Views Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setCameraMenuOpen(!cameraMenuOpen);
              setDrillMenuOpen(false);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/80 text-xs sm:text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <Camera className="w-3.5 h-3.5 text-[#a3e635]" />
            <span className="hidden sm:inline">{cameraLabels[cameraPreset].label}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {cameraMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1.5 z-50">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Camera Angles
              </div>
              {(Object.keys(cameraLabels) as CameraPreset[]).map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    onSelectCameraPreset(preset);
                    setCameraMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                    cameraPreset === preset
                      ? 'bg-[#a3e635]/15 text-[#a3e635]'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <span>
                    {cameraLabels[preset].icon} {cameraLabels[preset].label}
                  </span>
                  {preset === 'broadcast' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      Default
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sound FX Toggle */}
        <button
          onClick={onToggleSound}
          className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
          title={soundEnabled ? 'Mute Audio FX' : 'Enable Audio FX'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-[#a3e635]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
        </button>

        {/* Playbook / Saved Tactics */}
        {onOpenSavedTactics && (
          <button
            onClick={onOpenSavedTactics}
            className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-[#a3e635] hover:bg-slate-800 cursor-pointer transition-colors"
            title="Saved Tactics Playbook"
          >
            <Bookmark className="w-4 h-4" />
          </button>
        )}

        {/* Meeting Buttons */}
        {meeting ? (
          <button
            onClick={onToggleMeetingDrawer}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs sm:text-sm hover:bg-[#b4f046] cursor-pointer shadow-md shadow-[#a3e635]/20"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Meeting Room</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenCreateMeeting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs sm:text-sm hover:bg-[#b4f046] cursor-pointer shadow-md shadow-[#a3e635]/20"
            >
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Create</span> Meeting
            </button>
            <button
              onClick={onOpenJoinMeeting}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-white font-medium text-xs sm:text-sm hover:bg-slate-800 cursor-pointer"
            >
              Join
            </button>
          </div>
        )}

        {/* Support & Inquiries */}
        {onOpenContact && (
          <button
            onClick={onOpenContact}
            className="p-2 rounded-lg bg-slate-900/80 border border-slate-700/80 text-slate-300 hover:text-[#a3e635] hover:bg-slate-800 cursor-pointer transition-colors"
            title="Coaching Support & Inquiries"
          >
            <LifeBuoy className="w-4 h-4" />
          </button>
        )}

        {/* Toggle Hero Overlay */}
        <button
          onClick={onToggleHero}
          className={`p-2 rounded-lg border transition-colors cursor-pointer ${
            isHeroVisible
              ? 'bg-[#a3e635]/20 border-[#a3e635]/40 text-[#a3e635]'
              : 'bg-slate-900/80 border-slate-700/80 text-slate-300 hover:text-white'
          }`}
          title="Toggle Presentation Overlay"
        >
          <Tv className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
