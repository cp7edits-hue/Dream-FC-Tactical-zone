import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MousePointer,
  ArrowRight,
  CornerUpRight,
  Flame,
  CircleDot,
  RotateCcw,
  Play,
  Trash2,
  Users2,
  Undo2,
  Redo2,
} from 'lucide-react';
import { FormationType, TacticalPathType } from '../types/tactics';

interface TacticalDockProps {
  currentFormation: FormationType;
  onSelectFormation: (formation: FormationType) => void;
  teamDisplay: 'both' | 'home' | 'away';
  onToggleTeamDisplay: (mode: 'both' | 'home' | 'away') => void;
  isDrawingMode: boolean;
  drawingType: TacticalPathType;
  onSelectDrawTool: (tool: TacticalPathType | 'pointer') => void;
  onPlaySequence: () => void;
  onResetFormation: () => void;
  onClearPaths: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isPlaying: boolean;
}

export const TacticalDock = ({
  currentFormation,
  onSelectFormation,
  teamDisplay,
  onToggleTeamDisplay,
  isDrawingMode,
  drawingType,
  onSelectDrawTool,
  onPlaySequence,
  onResetFormation,
  onClearPaths,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isPlaying,
}: TacticalDockProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'formations' | 'tools'>('formations');

  const formations: FormationType[] = [
    '4-3-3',
    '4-4-2',
    '4-2-3-1',
    '3-5-2',
    '3-4-3',
    '4-1-4-1',
    '5-3-2',
  ];

  return (
    <aside
      aria-label="Tactical Board Controls"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-full max-w-[min(940px,94vw)] pointer-events-auto transition-transform duration-300 ease-out"
    >
      {/* Collapse / Expand Toggle Button */}
      <div className="flex justify-center mb-1">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-lg bg-slate-900/95 border-t border-x border-slate-700/80 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shadow-lg shadow-black/50"
        >
          {isCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-[#a3e635]" />
              <span>Show Board Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Hide Controls</span>
            </>
          )}
        </button>
      </div>

      {/* Main Dock Container */}
      {!isCollapsed && (
        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 shadow-2xl shadow-black/80 p-2.5 sm:p-3 backdrop-blur-md">
          {/* Top Bar inside dock: Tabs and Main Play button */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2 mb-2.5">
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('formations')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'formations'
                    ? 'bg-[#a3e635] text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Formations
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'tools'
                    ? 'bg-[#a3e635] text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tactical Tools
              </button>
            </div>

            {/* Team View Selector */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => onToggleTeamDisplay('both')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'both' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Both Teams
              </button>
              <button
                onClick={() => onToggleTeamDisplay('home')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'home' ? 'bg-slate-100 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Home (White)
              </button>
              <button
                onClick={() => onToggleTeamDisplay('away')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'away' ? 'bg-blue-900 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Away (Navy)
              </button>
            </div>

            {/* Play Sequence Action */}
            <button
              onClick={onPlaySequence}
              disabled={isPlaying}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#a3e635] to-[#84cc16] text-slate-950 font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-[#a3e635]/25 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isPlaying ? 'Playing...' : 'Play Play'}</span>
            </button>
          </div>

          {/* Tab 1: Formations Grid */}
          {activeTab === 'formations' && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex items-center gap-1.5 min-w-max">
                {formations.map((f) => {
                  const isActive = currentFormation === f;
                  return (
                    <button
                      key={f}
                      onClick={() => onSelectFormation(f)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#a3e635] text-slate-950 shadow-md shadow-[#a3e635]/20 scale-105'
                          : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1 pl-2 border-l border-slate-800">
                <button
                  onClick={onResetFormation}
                  className="p-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
                  title="Reset positions to default formation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Tactical Tools (Draw, Arrows, Eraser) */}
          {activeTab === 'tools' && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex items-center gap-2">
                {/* Pointer / Move */}
                <button
                  onClick={() => onSelectDrawTool('pointer')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    !isDrawingMode
                      ? 'bg-[#a3e635] text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Move Player</span>
                </button>

                {/* Straight Pass Arrow */}
                <button
                  onClick={() => onSelectDrawTool('pass')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'pass'
                      ? 'bg-white text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Pass Arrow</span>
                </button>

                {/* Curved Run Arrow */}
                <button
                  onClick={() => onSelectDrawTool('run')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'run'
                      ? 'bg-[#a3e635] text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <CornerUpRight className="w-3.5 h-3.5" />
                  <span>Run Curve</span>
                </button>

                {/* Press Arrow */}
                <button
                  onClick={() => onSelectDrawTool('press')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'press'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Pressing Run</span>
                </button>

                {/* Zone Area */}
                <button
                  onClick={() => onSelectDrawTool('zone')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'zone'
                      ? 'bg-sky-500 text-white shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span>Space Zone</span>
                </button>
              </div>

              {/* History & Clear Actions */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                  title="Undo last path"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                  title="Redo"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClearPaths}
                  className="p-2 rounded-lg bg-slate-900 text-rose-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
                  title="Clear all tactical drawings"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
