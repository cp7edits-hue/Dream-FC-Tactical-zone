import { AlertTriangle, Home, Play, MessageSquare, ArrowLeft } from 'lucide-react';

interface NotFoundPageProps {
  onReturnHome: () => void;
  onEnterTactics: () => void;
  onOpenContact: () => void;
}

export const NotFoundPage = ({ onReturnHome, onEnterTactics, onOpenContact }: NotFoundPageProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#060c16] text-slate-100 select-none overflow-y-auto">
      {/* Background stadium lights & pitch blur effect */}
      <div className="absolute inset-0 bg-radial-[at_50%_30%] from-emerald-950/20 via-slate-950/70 to-slate-950 pointer-events-none" />

      <div className="relative z-10 max-w-lg w-full text-center flex flex-col items-center p-6 sm:p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-md">
        {/* Out-of-bounds whistle / card emblem */}
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-lg shadow-amber-500/10">
          <AlertTriangle className="w-8 h-8" />
        </div>

        {/* 404 Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono font-bold text-[#a3e635] mb-3">
          <span>ERROR 404</span>
          <span>•</span>
          <span>BALL OUT OF PLAY</span>
        </div>

        {/* Heading */}
        <h1 className="font-display font-black text-3xl sm:text-4xl text-white uppercase tracking-tight leading-tight">
          Tactical Route Not Found
        </h1>

        <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-sm">
          The match session, play card, or route you followed is outside the touchlines or has been moved by the coaching staff.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full">
          <button
            onClick={onReturnHome}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-sm hover:bg-[#b4f046] active:scale-95 transition-all shadow-lg shadow-[#a3e635]/20 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#a3e635] focus-visible:outline-none"
          >
            <Home className="w-4 h-4" />
            <span>Return to Pitch</span>
          </button>

          <button
            onClick={onEnterTactics}
            className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-sm transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
          >
            <Play className="w-4 h-4 text-[#a3e635]" />
            <span>Tactical Board</span>
          </button>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-800/80 w-full flex items-center justify-center">
          <button
            onClick={onOpenContact}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#a3e635] transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Need assistance? Contact Coaching Support</span>
          </button>
        </div>
      </div>
    </div>
  );
};
