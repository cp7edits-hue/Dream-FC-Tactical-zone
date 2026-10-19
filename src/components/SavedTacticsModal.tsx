import { useState, useEffect } from 'react';
import { X, Bookmark, Plus, Trash2, FolderDown, Check, Loader2 } from 'lucide-react';
import { api } from '../services/api';
import { FormationType, TacticalPath } from '../types/tactics';

interface SavedTacticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFormation: FormationType;
  currentPaths: TacticalPath[];
  onLoadTactic: (formation: FormationType, paths: TacticalPath[], notes?: string) => void;
}

export const SavedTacticsModal = ({
  isOpen,
  onClose,
  currentFormation,
  currentPaths,
  onLoadTactic,
}: SavedTacticsModalProps) => {
  const [tactics, setTactics] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      loadTactics();
    }
  }, [isOpen]);

  const loadTactics = async () => {
    setIsLoading(true);
    try {
      const list = await api.getSavedTactics();
      if (Array.isArray(list)) setTactics(list);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSaveCurrent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const res = await api.saveTactic({
        title: title.trim(),
        formation_type: currentFormation,
        board_state: {
          formation: currentFormation,
          paths: currentPaths,
        },
        notes: notes.trim(),
      });
      if (res.tactic) {
        setTactics((prev) => [res.tactic, ...prev]);
      }
      setTitle('');
      setNotes('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTactic(id);
      setTactics((prev) => prev.filter((t) => t.id !== id));
    } catch {
      // ignore
    }
  };

  const handleApply = (tactic: any) => {
    const f = tactic.formation_type || '4-3-3';
    const p = tactic.board_state?.paths || [];
    onLoadTactic(f, p, tactic.notes);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="playbook-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-slate-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Bookmark className="w-5 h-5 text-[#a3e635]" />
            <div>
              <h2 id="playbook-title" className="font-display font-bold text-base text-white">
                Tactical Playbook
              </h2>
              <p className="text-xs text-slate-400">Save and load custom tactical arrangements</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close playbook"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[#a3e635] focus-visible:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Save Current Board Section */}
        <form onSubmit={handleSaveCurrent} className="mb-4 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="text-xs font-semibold text-slate-300">Save Current 3D Board Setup</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tactic Title (e.g. Inverted Wingback Overload)"
              required
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-[#a3e635] focus-visible:ring-1 focus-visible:ring-[#a3e635]"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a3e635] text-slate-950 font-bold text-xs hover:bg-[#b4f046] transition-colors cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#a3e635]"
            >
              {saveSuccess ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{saveSuccess ? 'Saved' : 'Save'}</span>
            </button>
          </div>
        </form>

        {/* Saved Tactics List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Saved Plays ({tactics.length})
          </div>

          {isLoading ? (
            /* Skeleton Loading State */
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-950/40 border border-slate-850 animate-pulse flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-36 bg-slate-800 rounded" />
                    <div className="h-2.5 w-20 bg-slate-850 rounded" />
                  </div>
                  <div className="h-7 w-16 bg-slate-800 rounded" />
                </div>
              ))}
            </div>
          ) : tactics.length === 0 ? (
            /* Empty State */
            <div className="text-center py-8 text-xs text-slate-500 flex flex-col items-center">
              <Bookmark className="w-8 h-8 text-slate-700 mb-2 stroke-1" />
              <span>No saved tactics yet.</span>
              <span className="text-slate-600 mt-0.5">Arrange your players on the pitch and save your first play above.</span>
            </div>
          ) : (
            tactics.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="font-semibold text-xs text-white flex items-center gap-2">
                    <span>{t.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-[#a3e635] font-mono">
                      {t.formation_type}
                    </span>
                  </div>
                  {t.notes && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{t.notes}</p>}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleApply(t)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-[#a3e635]"
                  >
                    <FolderDown className="w-3 h-3 text-[#a3e635]" />
                    <span>Load</span>
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="p-1 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-rose-400"
                    title="Delete saved play"
                    aria-label={`Delete ${t.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
