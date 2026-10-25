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
  Pause,
  Trash2,
  Undo2,
  Redo2,
  ArrowUp,
  ArrowDown,
  Zap,
  ListOrdered,
} from 'lucide-react';
import { FormationType, TacticalPathType, TacticalPath, SimulationStatus } from '../types/tactics';

interface TacticalDockProps {
  currentFormation: FormationType;
  onSelectFormation: (formation: FormationType) => void;
  teamDisplay: 'both' | 'home' | 'away';
  onToggleTeamDisplay: (mode: 'both' | 'home' | 'away') => void;
  isDrawingMode: boolean;
  drawingType: TacticalPathType;
  onSelectDrawTool: (tool: TacticalPathType | 'pointer') => void;
  paths: TacticalPath[];
  simulationStatus: SimulationStatus;
  currentPassIndex: number;
  onPlaySimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onResetSimulation: () => void;
  onDeletePass: (passId: string) => void;
  onMovePassUp: (index: number) => void;
  onMovePassDown: (index: number) => void;
  onResetFormation: () => void;
  onClearPaths: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  simulationSpeed: number;
  onToggleSpeed: () => void;
}

export const TacticalDock = ({
  currentFormation,
  onSelectFormation,
  teamDisplay,
  onToggleTeamDisplay,
  isDrawingMode,
  drawingType,
  onSelectDrawTool,
  paths,
  simulationStatus,
  currentPassIndex,
  onPlaySimulation,
  onPauseSimulation,
  onResumeSimulation,
  onResetSimulation,
  onDeletePass,
  onMovePassUp,
  onMovePassDown,
  onResetFormation,
  onClearPaths,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  simulationSpeed,
  onToggleSpeed,
}: TacticalDockProps) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'tools' | 'sequence' | 'formations'>('tools');

  const passesOnly = paths.filter((p) => p.type === 'pass');

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
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-full max-w-[min(960px,96vw)] pointer-events-auto transition-transform duration-300 ease-out"
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
              <span>Show Tactical Dock</span>
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
        <div className="rounded-2xl bg-slate-950/95 border border-slate-800/90 shadow-2xl shadow-black/80 p-2 sm:p-3 backdrop-blur-md">
          {/* Top Bar inside dock: Tabs and Simulation Playback Action */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-2 border-b border-slate-800/80 pb-2 mb-2">
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'tools'
                    ? 'bg-[#a3e635] text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setActiveTab('sequence')}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'sequence'
                    ? 'bg-[#a3e635] text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Passes</span>
                {passesOnly.length > 0 && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      activeTab === 'sequence' ? 'bg-slate-950 text-[#a3e635]' : 'bg-slate-800 text-white'
                    }`}
                  >
                    {passesOnly.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('formations')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'formations'
                    ? 'bg-[#a3e635] text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Formations
              </button>
            </div>

            {/* Team View Selector */}
            <div className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => onToggleTeamDisplay('both')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'both' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Both
              </button>
              <button
                onClick={() => onToggleTeamDisplay('home')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'home' ? 'bg-slate-100 text-slate-950 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Home
              </button>
              <button
                onClick={() => onToggleTeamDisplay('away')}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                  teamDisplay === 'away' ? 'bg-blue-900 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Away
              </button>
            </div>

            {/* Simulation Controls: Play, Pause, Resume, Reset, Speed */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              {/* Speed toggle */}
              <button
                onClick={onToggleSpeed}
                className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-[#a3e635] hover:bg-slate-800 cursor-pointer"
                title="Playback speed"
              >
                {simulationSpeed}x
              </button>

              {/* Reset simulation positions button */}
              {(simulationStatus === 'playing' ||
                simulationStatus === 'paused' ||
                simulationStatus === 'completed') && (
                <button
                  onClick={onResetSimulation}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  title="Reset simulation to initial snapshot"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}

              {/* Primary Simulation Action Button */}
              {simulationStatus === 'idle' && (
                <button
                  onClick={onPlaySimulation}
                  disabled={passesOnly.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#a3e635] to-[#84cc16] text-slate-950 font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-[#a3e635]/25 cursor-pointer disabled:opacity-40"
                  title={passesOnly.length === 0 ? 'Draw at least 1 pass line first' : 'Simulate pass sequence'}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play</span>
                </button>
              )}

              {simulationStatus === 'playing' && (
                <button
                  onClick={onPauseSimulation}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                  title="Pause simulation"
                >
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause</span>
                </button>
              )}

              {simulationStatus === 'paused' && (
                <button
                  onClick={onResumeSimulation}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                  title="Resume simulation"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume</span>
                </button>
              )}

              {simulationStatus === 'completed' && (
                <button
                  onClick={onPlaySimulation}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl bg-[#a3e635] text-slate-950 font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                  title="Replay sequence"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Replay</span>
                </button>
              )}
            </div>
          </div>

          {/* Tab 1: Tactical Tools (Draw Pass highlighted, Move, Curves, Clear) */}
          {activeTab === 'tools' && (
            <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* 1. Draw Pass Button - Primary Highlight */}
                <button
                  onClick={() => onSelectDrawTool('pass')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    isDrawingMode && drawingType === 'pass'
                      ? 'bg-[#a3e635] text-slate-950 shadow-md shadow-[#a3e635]/30 ring-2 ring-[#a3e635]/60'
                      : 'bg-slate-900 text-white hover:bg-slate-800 border border-[#a3e635]/40'
                  }`}
                  title="Draw sequential tactical pass lines from player to player"
                >
                  <ArrowRight className="w-3.5 h-3.5 text-current stroke-[2.5]" />
                  <span>Draw Pass</span>
                </button>

                {/* 2. Move Player Pointer */}
                <button
                  onClick={() => onSelectDrawTool('pointer')}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    !isDrawingMode
                      ? 'bg-slate-200 text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  <span>Move</span>
                </button>

                {/* 3. Curved Run */}
                <button
                  onClick={() => onSelectDrawTool('run')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'run'
                      ? 'bg-amber-400 text-slate-950 shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <CornerUpRight className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Run Curve</span>
                  <span className="sm:hidden">Run</span>
                </button>

                {/* 4. Pressing Run */}
                <button
                  onClick={() => onSelectDrawTool('press')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'press'
                      ? 'bg-rose-500 text-white shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Pressing</span>
                  <span className="sm:hidden">Press</span>
                </button>

                {/* 5. Space Zone */}
                <button
                  onClick={() => onSelectDrawTool('zone')}
                  className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isDrawingMode && drawingType === 'zone'
                      ? 'bg-sky-500 text-white shadow-md'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Zone</span>
                </button>
              </div>

              {/* Undo, Redo, Clear Tactics */}
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <button
                  onClick={onUndo}
                  disabled={!canUndo}
                  className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
                  title="Undo last path"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo}
                  className="p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 disabled:opacity-30 transition-colors cursor-pointer"
                  title="Redo"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (paths.length === 0) return;
                    if (window.confirm('Clear all tactical pass lines from the pitch?')) {
                      onClearPaths();
                    }
                  }}
                  disabled={paths.length === 0}
                  className="p-2 rounded-lg bg-slate-900 text-rose-400 hover:text-rose-300 hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer disabled:opacity-30"
                  title="Clear all tactical drawings"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Pass Sequence Manager (Order, Reorder, Delete) */}
          {activeTab === 'sequence' && (
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {passesOnly.length === 0 ? (
                <div className="py-3 text-center text-xs text-slate-400">
                  <span>No pass lines drawn yet. Select </span>
                  <button
                    onClick={() => {
                      setActiveTab('tools');
                      onSelectDrawTool('pass');
                    }}
                    className="text-[#a3e635] font-bold underline cursor-pointer"
                  >
                    Draw Pass
                  </button>
                  <span> to build your tactical sequence.</span>
                </div>
              ) : (
                passesOnly.map((p, idx) => {
                  const isActive = simulationStatus === 'playing' && currentPassIndex === idx;
                  const isDone = simulationStatus === 'playing' && currentPassIndex > idx;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs transition-colors ${
                        isActive
                          ? 'bg-[#a3e635]/15 border-[#a3e635] text-white'
                          : isDone
                          ? 'bg-slate-900/60 border-slate-800 text-slate-400'
                          : 'bg-slate-900/90 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-[#a3e635] text-slate-950 font-bold text-[10px] flex items-center justify-center">
                          {p.order || idx + 1}
                        </span>
                        <div className="leading-tight">
                          <span className="font-semibold text-white">
                            {p.fromPlayerName || 'Ball Position'}
                          </span>
                          <span className="text-slate-400 mx-1.5">➔</span>
                          <span className="font-semibold text-[#a3e635]">
                            {p.toPlayerName || 'Open Space'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {/* Reorder Up */}
                        <button
                          onClick={() => onMovePassUp(idx)}
                          disabled={idx === 0}
                          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                          title="Move earlier in sequence"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        {/* Reorder Down */}
                        <button
                          onClick={() => onMovePassDown(idx)}
                          disabled={idx === passesOnly.length - 1}
                          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                          title="Move later in sequence"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        {/* Delete Pass */}
                        <button
                          onClick={() => onDeletePass(p.id)}
                          className="p-1 rounded text-rose-400 hover:text-rose-300 hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Delete pass"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Tab 3: Formations Grid */}
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
        </div>
      )}
    </aside>
  );
};
