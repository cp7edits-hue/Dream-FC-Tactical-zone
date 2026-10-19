import { Shield, Lock, LifeBuoy } from 'lucide-react';
import { LegalTab } from './LegalModal';

interface LegalFooterProps {
  onOpenLegal: (tab: LegalTab) => void;
  onOpenContact?: () => void;
  onOpen404?: () => void;
}

export const LegalFooter = ({ onOpenLegal, onOpenContact, onOpen404 }: LegalFooterProps) => {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between px-3 sm:px-4 py-1.5 bg-slate-950/90 border-t border-slate-900 text-[11px] text-slate-400 select-none pointer-events-auto backdrop-blur-md">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-300">Dream FC Tactical Zone</span>
        <span className="text-slate-600">•</span>
        <span className="flex items-center gap-1 text-slate-400 hidden sm:inline-flex">
          <Lock className="w-3 h-3 text-[#a3e635]" />
          <span>Encrypted Session • Zero Ad Trackers</span>
        </span>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
        <button
          onClick={() => onOpenLegal('privacy')}
          className="hover:text-slate-200 transition-colors cursor-pointer"
        >
          Privacy
        </button>
        <span className="text-slate-600">•</span>
        <button
          onClick={() => onOpenLegal('terms')}
          className="hover:text-slate-200 transition-colors cursor-pointer"
        >
          Terms
        </button>
        <span className="text-slate-600">•</span>
        <button
          onClick={() => onOpenLegal('cookies')}
          className="hover:text-slate-200 transition-colors cursor-pointer"
        >
          Cookies
        </button>
        <span className="text-slate-600">•</span>
        {onOpenContact && (
          <>
            <button
              onClick={onOpenContact}
              className="text-[#a3e635] hover:underline transition-colors cursor-pointer flex items-center gap-1"
            >
              <LifeBuoy className="w-3 h-3" />
              <span>Contact Support</span>
            </button>
            <span className="text-slate-600">•</span>
          </>
        )}
        <button
          onClick={() => onOpenLegal('deletion')}
          className="text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
        >
          Data Deletion
        </button>
      </div>
    </footer>
  );
};
