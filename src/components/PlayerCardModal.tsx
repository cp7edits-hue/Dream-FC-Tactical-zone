import { X, Shield, ArrowUpRight, Crosshair, Award } from 'lucide-react';
import { Player } from '../types/tactics';

interface PlayerCardModalProps {
  player: Player | null;
  onClose: () => void;
  onAddRunForPlayer: (player: Player) => void;
  canEditBoard?: boolean;
}

export const PlayerCardModal = ({
  player,
  onClose,
  onAddRunForPlayer,
  canEditBoard = true,
}: PlayerCardModalProps) => {
  if (!player) return null;

  const isHome = player.team === 'home';

  const roleDescriptions: Record<string, string> = {
    GK: 'Sweeper Keeper • High starting position, distribution via short passing or long diagonals.',
    CB: 'Ball-Playing Defender • Step out into midfield to break first pressing line.',
    LB: 'Inverted Full-Back • Tucks inside to form midfield double-pivot during build-up.',
    RB: 'Overlapping Full-Back • Bombards right channel to provide width and crosses.',
    DM: 'Deep-Lying Anchor • Shield back-four, orchestrate tempo, and intercept transition balls.',
    CM: 'Box-to-Box Engine • Drives between boxes, supports wide triangles, and tracks runners.',
    CAM: 'Free Roaming Playmaker • Exploit half-spaces between opponent midfield and defensive lines.',
    RW: 'Inverted Winger • Cuts inside onto stronger foot to shoot or combine with striker.',
    LW: 'Traditional Touchline Winger • 1v1 dribbling specialist stretching defensive block.',
    ST: 'Complete Forward • Pins center-backs, drops into pocket, and attacks near-post deliveries.',
  };

  return (
    <div className="fixed top-18 left-4 z-40 w-72 rounded-2xl bg-slate-950/95 border border-slate-800 shadow-2xl p-3.5 backdrop-blur-md text-slate-100 select-none pointer-events-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
              isHome ? 'bg-white text-slate-950' : 'bg-blue-600 text-white'
            }`}
          >
            {player.number}
          </div>
          <div>
            <div className="font-bold text-sm text-white leading-tight">{player.name}</div>
            <div className="text-[10px] text-slate-400">
              {isHome ? 'Home Squad (White)' : 'Away Squad (Navy)'} • {player.role}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 text-[11px] text-slate-300 leading-relaxed mb-3">
        {roleDescriptions[player.role] || 'Execute tactical positioning and support ball carrier.'}
      </div>

      {canEditBoard ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddRunForPlayer(player)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] transition-colors cursor-pointer"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Add Run Curve</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-900 border border-slate-800/80 text-slate-400 font-medium text-xs">
          <span>View-Only Player Profile</span>
        </div>
      )}
    </div>
  );
};
