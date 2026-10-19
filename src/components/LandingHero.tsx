import { Video, LogIn, Play, Users, Sparkles, Shield } from 'lucide-react';

interface LandingHeroProps {
  onCreateMeeting: () => void;
  onJoinMeeting: () => void;
  onEnterTactics: () => void;
}

export const LandingHero = ({ onCreateMeeting, onJoinMeeting, onEnterTactics }: LandingHeroProps) => {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none px-4 select-none">
      {/* Dark gradient vignette backing to keep text razor sharp over the 3D stadium lights */}
      <div className="absolute inset-0 bg-radial-[at_50%_40%] from-transparent via-slate-950/40 to-slate-950/80 pointer-events-none" />

      {/* Hero Content Container */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl mx-auto pointer-events-auto">
        {/* Top subtle badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-xs font-semibold text-slate-300 backdrop-blur-md mb-6 shadow-lg shadow-black/40">
          <Shield className="w-3.5 h-3.5 text-[#a3e635]" />
          <span>OFFICIAL STRATEGY SUITE</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635]" />
          <span className="text-[#a3e635] font-mono tracking-wider">3D PITCH READY</span>
        </div>

        {/* Brand Headline - Exactly matching reference image */}
        <h1 className="font-display text-5xl sm:text-7xl md:text-8xl font-black tracking-tight text-white uppercase leading-[0.95] drop-shadow-2xl">
          <span className="block text-white">DREAM FC</span>
          <span className="block mt-1">
            <span className="text-white">TACTICAL </span>
            <span className="text-[#a3e635]">ZONE</span>
          </span>
        </h1>

        {/* Subtitle - Exactly matching reference image */}
        <p className="mt-4 sm:mt-5 text-lg sm:text-2xl md:text-3xl font-medium text-slate-100 tracking-normal drop-shadow-lg max-w-2xl">
          Plan the Game, Win Together.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-5 w-full max-w-lg">
          {/* Create Meeting Button */}
          <button
            onClick={onCreateMeeting}
            className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-base sm:text-lg hover:bg-[#b4f046] active:scale-[0.98] transition-all shadow-xl shadow-[#a3e635]/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#a3e635] focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            <Video className="w-5 h-5" />
            <span>Create Meeting</span>
          </button>

          {/* Join Meeting Button */}
          <button
            onClick={onJoinMeeting}
            className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-slate-900/90 text-white border border-slate-700/80 hover:bg-slate-800 hover:border-slate-500 active:scale-[0.98] transition-all font-semibold text-base sm:text-lg shadow-xl shadow-black/50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            <LogIn className="w-5 h-5 text-[#a3e635]" />
            <span>Join Meeting</span>
          </button>
        </div>

        {/* Quick Launch Board Button */}
        <div className="mt-4">
          <button
            onClick={onEnterTactics}
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white font-medium py-2 px-4 rounded-lg bg-slate-950/60 hover:bg-slate-900/80 border border-slate-800 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-[#a3e635]" />
            <span>Launch Tactical Board (Solo Mode)</span>
          </button>
        </div>

        {/* Quick hint */}
        <p className="mt-8 text-xs text-slate-400 flex items-center gap-2">
          <span>Click and drag player tokens to set formations</span>
          <span>•</span>
          <span>Rotate pitch with left-click</span>
          <span>•</span>
          <span>Right-click to pan</span>
        </p>
      </div>
    </div>
  );
};
