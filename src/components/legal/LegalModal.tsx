import { useState } from 'react';
import { X, Shield, FileText, Lock, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '../../services/api';

export type LegalTab = 'privacy' | 'terms' | 'cookies' | 'deletion';

interface LegalModalProps {
  isOpen: boolean;
  initialTab?: LegalTab;
  onClose: () => void;
}

export const LegalModal = ({ isOpen, initialTab = 'privacy', onClose }: LegalModalProps) => {
  const [activeTab, setActiveTab] = useState<LegalTab>(initialTab);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deletionResult, setDeletionResult] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleDeleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteConfirmed) return;
    setIsSubmitting(true);
    try {
      const res = await api.requestDataDeletion(deleteEmail, deleteReason);
      setDeletionResult(res.requestId);
    } catch (err: any) {
      alert(err.message || 'Failed to submit deletion request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none">
      <div className="relative w-full max-w-3xl max-h-[85vh] rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#a3e635]" />
            <h2 className="font-display font-bold text-lg text-white">Trust, Security & Privacy Center</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/30 overflow-x-auto">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'privacy'
                ? 'border-[#a3e635] text-[#a3e635]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'terms'
                ? 'border-[#a3e635] text-[#a3e635]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Terms of Service
          </button>
          <button
            onClick={() => setActiveTab('cookies')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'cookies'
                ? 'border-[#a3e635] text-[#a3e635]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Cookie Policy
          </button>
          <button
            onClick={() => setActiveTab('deletion')}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'deletion'
                ? 'border-rose-400 text-rose-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Data Deletion Request
          </button>
        </div>

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto p-6 text-xs sm:text-sm text-slate-300 space-y-4 leading-relaxed">
          {activeTab === 'privacy' && (
            <div>
              <h3 className="font-bold text-base text-white mb-2">Dream FC Tactical Zone — Privacy Policy</h3>
              <p className="text-slate-400 text-xs mb-3">Effective Date: October 2026 • Version 1.2</p>

              <h4 className="font-semibold text-white mt-4 mb-1">1. Data Minimization & Purpose</h4>
              <p>
                Dream FC Tactical Zone collects only the minimal data strictly necessary to facilitate real-time tactical football whiteboard meetings and live audio/video communication. We do not sell user data, run third-party advertising trackers, or fingerprint devices.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">2. Information We Process</h4>
              <ul className="list-disc pl-5 space-y-1 text-slate-300">
                <li><strong>Coach Account Information:</strong> Email address and display name for authenticated host accounts.</li>
                <li><strong>Meeting Metadata:</strong> Ephemeral meeting identifiers, generated passcodes (hashed server-side via bcrypt), session timestamps, and participant display names.</li>
                <li><strong>Tactical Board Coordinates:</strong> Monotonically incremented 3D pitch coordinates for player markers, ball position, and vector annotations.</li>
                <li><strong>Audio & Video Streams:</strong> Peer-to-peer and routed media via LiveKit. <em>Audio and video streams are NOT recorded or stored on any server.</em></li>
              </ul>

              <h4 className="font-semibold text-white mt-4 mb-1">3. Third-Party Service Processors</h4>
              <p>
                Media streams are routed securely through LiveKit Cloud. Persistent account storage and database Row Level Security are handled via PostgreSQL / Supabase with end-to-end access rules.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">4. Data Retention Schedule</h4>
              <p>
                Temporary meeting session records, participant logs, and chat messages are automatically purged after 30 days. Saved tactics remain in the coach's private library until deleted by the user.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">5. User Rights (GDPR & CCPA)</h4>
              <p>
                You have the right to access, rectify, or permanently delete all personal data associated with your identity. Use our Data Deletion Request tab or contact our data protection representative at privacy@dreamfc.internal.
              </p>
            </div>
          )}

          {activeTab === 'terms' && (
            <div>
              <h3 className="font-bold text-base text-white mb-2">Terms of Service</h3>
              <p className="text-slate-400 text-xs mb-3">Last Updated: October 2026</p>

              <h4 className="font-semibold text-white mt-4 mb-1">1. Acceptance of Terms</h4>
              <p>
                By creating or joining a tactical meeting on Dream FC Tactical Zone, you agree to these Terms of Service. If you disagree, do not use the service.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">2. Acceptable Use & Conduct</h4>
              <p>
                This platform is designed solely for football coaching, match analysis, and sports education. Users must not broadcast unlawful, harassing, defamatory, or abusive material, attempt unauthorized access to another team's private meeting, or intercept media channels.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">3. Intellectual Property & Tactical Plans</h4>
              <p>
                Coaches retain full ownership of their proprietary game plans, formation modifications, and tactical annotations. Dream FC Tactical Zone claims no ownership over user-generated strategy drawings.
              </p>

              <h4 className="font-semibold text-white mt-4 mb-1">4. Limitation of Liability</h4>
              <p>
                The service is provided on an "as is" and "as available" basis without warranties of uninterrupted availability.
              </p>
            </div>
          )}

          {activeTab === 'cookies' && (
            <div>
              <h3 className="font-bold text-base text-white mb-2">Cookie & Local Storage Policy</h3>
              <p className="text-slate-400 text-xs mb-3">Audited: October 2026</p>

              <p>
                Dream FC Tactical Zone operates on a <strong>zero-advertising, zero-tracking policy</strong>. We use only strictly necessary cookies:
              </p>

              <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between font-mono text-xs text-[#a3e635]">
                  <span>dfc_session</span>
                  <span className="text-[10px] text-slate-400 font-sans">Strictly Necessary</span>
                </div>
                <p className="text-xs text-slate-300">
                  Cryptographically generated HTTP-only session identifier ensuring participant authorization, meeting room security, and CSRF protection. Expires when the session ends or within 8 hours.
                </p>
              </div>

              <p className="mt-3 text-xs text-slate-400">
                Because we do not use marketing or analytical tracking cookies, no invasive cookie consent banner is legally required under the EU ePrivacy Directive and GDPR Article 5(3).
              </p>
            </div>
          )}

          {activeTab === 'deletion' && (
            <div>
              <h3 className="font-bold text-base text-white mb-2">Submit Data Deletion Request</h3>
              <p className="text-slate-400 text-xs mb-4">
                In compliance with GDPR Article 17 (Right to Erasure) and CCPA, you can request the permanent removal of your account, meeting logs, and saved tactics.
              </p>

              {deletionResult ? (
                <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Deletion Request Confirmed</span>
                  </div>
                  <p className="text-xs">
                    Your request ID is <strong>{deletionResult}</strong>. All associated records will be permanently purged from our database within 30 days. A confirmation receipt has been scheduled.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleDeleteSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Account / Contact Email
                    </label>
                    <input
                      type="email"
                      value={deleteEmail}
                      onChange={(e) => setDeleteEmail(e.target.value)}
                      placeholder="coach@example.com"
                      required
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Reason for Deletion (Optional)
                    </label>
                    <textarea
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      placeholder="e.g. Closing team account..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-rose-400"
                    />
                  </div>

                  <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={deleteConfirmed}
                      onChange={(e) => setDeleteConfirmed(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-rose-500 focus:ring-rose-400"
                      required
                    />
                    <span>
                      I confirm that I want to permanently delete all my meeting history, saved tactics, and personal identifiers. This action is irreversible.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={isSubmitting || !deleteConfirmed}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isSubmitting ? 'Submitting...' : 'Submit Deletion Request'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>Dream FC Tactical Zone • Compliance Verified</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
