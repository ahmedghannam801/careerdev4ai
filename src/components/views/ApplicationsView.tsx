import React, { useState } from 'react';
import { 
  Plus, 
  Calendar, 
  Clock, 
  Edit2, 
  Trash2, 
  ArrowRight, 
  X, 
  ExternalLink,
  FileText,
  DollarSign,
  User,
  ShieldCheck,
  CheckCircle2,
  FolderClosed
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { ApplicationStage, JobApplication } from '../../types/career';

export const ApplicationsView: React.FC = () => {
  const { 
    applications, 
    updateApplicationStage, 
    updateApplicationNotes, 
    deleteApplication, 
    addApplication,
    documents,
    cvVersions,
    logActivity
  } = useCareer();

  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);

  // Form state for new application
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('Remote');
  const [workMode, setWorkMode] = useState('Remote');
  const [stage, setStage] = useState<ApplicationStage>('applied');
  const [nextAction, setNextAction] = useState('Awaiting recruiter response');
  const [nextActionDate, setNextActionDate] = useState('');
  const [salaryDiscussed, setSalaryDiscussed] = useState('$145,000');
  const [notes, setNotes] = useState('');

  // Edit details form inside modal
  const [editNotes, setEditNotes] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [editNextActionDate, setEditNextActionDate] = useState('');

  const stages: ApplicationStage[] = [
    'saved',
    'applied',
    'screening',
    'interview',
    'technical',
    'final',
    'offer'
  ];

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;

    addApplication({
      company: company.trim(),
      role: role.trim(),
      location: location.trim(),
      workMode,
      stage,
      appliedDate: new Date().toISOString().split('T')[0],
      nextAction: nextAction.trim() || undefined,
      nextActionDate: nextActionDate || undefined,
      salaryDiscussed: salaryDiscussed || undefined,
      notes: notes.trim()
    });

    logActivity({
      actionType: 'applied_job',
      title: 'Created Application',
      subtitle: `${role} at ${company}`,
      linkView: 'applications'
    });

    setCompany('');
    setRole('');
    setNotes('');
    setNextActionDate('');
    setShowAddModal(false);
  };

  const handleOpenDetails = (app: JobApplication) => {
    setSelectedApp(app);
    setEditNotes(app.notes || '');
    setEditNextAction(app.nextAction || '');
    setEditNextActionDate(app.nextActionDate || '');
  };

  const handleSaveAppDetails = () => {
    if (!selectedApp) return;
    updateApplicationNotes(selectedApp.id, editNotes, editNextAction, editNextActionDate);
    setSelectedApp(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            OPPORTUNITY PIPELINE
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Job Application Tracker ({applications.length})
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Discipline-driven pipeline management with linked CV versions, tailored cover letters, and private notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="p-1 rounded-lg bg-[var(--surface-secondary)] flex items-center gap-1 border border-[var(--border-subtle)] text-xs">
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-[var(--surface-main)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              Pipeline Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--surface-main)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              List View
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Application</span>
          </button>
        </div>
      </div>

      {/* KANBAN BOARD */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
          {stages.map((st) => {
            const stageApps = applications.filter((a) => a.stage === st);

            return (
              <div
                key={st}
                className="bg-[var(--surface-main)] rounded-xl border border-[var(--border-subtle)] p-3 flex flex-col min-w-[200px] shadow-2xs"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                    {st}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--surface-secondary)] text-[var(--text-muted)] font-semibold">
                    {stageApps.length}
                  </span>
                </div>

                {/* Column Cards */}
                <div className="space-y-2.5 flex-1">
                  {stageApps.length === 0 ? (
                    <div className="h-24 flex items-center justify-center text-[11px] text-[var(--text-muted)] italic">
                      Empty
                    </div>
                  ) : (
                    stageApps.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => handleOpenDetails(app)}
                        className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-2 text-xs hover:border-[var(--accent-primary)] cursor-pointer transition-all shadow-xs"
                      >
                        <div>
                          <div className="font-bold text-sm text-[var(--text-primary)] leading-tight">{app.role}</div>
                          <div className="text-[var(--text-muted)] mt-0.5">{app.company}</div>
                        </div>

                        {app.nextAction && (
                          <div className="text-[11px] text-[var(--accent-primary)] font-medium line-clamp-2">
                            → {app.nextAction}
                          </div>
                        )}

                        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between" onClick={e => e.stopPropagation()}>
                          <select
                            value={app.stage}
                            onChange={(e) => updateApplicationStage(app.id, e.target.value as ApplicationStage)}
                            className="text-[10px] bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] font-medium capitalize"
                          >
                            {stages.concat(['rejected', 'withdrawn']).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => deleteApplication(app.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-red-500 rounded"
                            title="Delete application"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-semibold">Role & Company</th>
                  <th className="pb-3 font-semibold">Stage</th>
                  <th className="pb-3 font-semibold">Location / Mode</th>
                  <th className="pb-3 font-semibold">Next Action</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-[var(--surface-secondary)]/40 transition-colors">
                    <td className="py-3 cursor-pointer" onClick={() => handleOpenDetails(app)}>
                      <div className="font-bold text-sm text-[var(--text-primary)]">{app.role}</div>
                      <div className="text-[var(--text-secondary)]">{app.company}</div>
                    </td>
                    <td className="py-3">
                      <select
                        value={app.stage}
                        onChange={(e) => updateApplicationStage(app.id, e.target.value as ApplicationStage)}
                        className="text-xs bg-[var(--surface-secondary)] border border-[var(--border-subtle)] rounded px-2 py-1 text-[var(--text-primary)] font-medium capitalize"
                      >
                        {stages.concat(['rejected', 'withdrawn']).map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-[var(--text-secondary)]">
                      {app.location} · {app.workMode}
                    </td>
                    <td className="py-3 text-[var(--accent-primary)] font-medium">
                      {app.nextAction || '—'}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-red-500 px-2 py-1"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Application Details, Private Notes & Reminders */}
      {selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {selectedApp.role}
                </h3>
                <p className="text-xs text-[var(--accent-primary)] font-semibold">
                  {selectedApp.company} • {selectedApp.location}
                </p>
              </div>
              <button 
                onClick={() => setSelectedApp(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)]">
                <div>
                  <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Pipeline Stage</span>
                  <span className="font-bold text-[var(--text-primary)] capitalize">{selectedApp.stage}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">Applied Date</span>
                  <span className="font-mono text-[var(--text-primary)]">{selectedApp.appliedDate || 'Oct 15, 2026'}</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  Next Follow-up Action
                </label>
                <input
                  type="text"
                  value={editNextAction}
                  onChange={(e) => setEditNextAction(e.target.value)}
                  placeholder="e.g. Round 2 Technical Interview with Lead Architect"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  Follow-up / Interview Deadline Date
                </label>
                <input
                  type="date"
                  value={editNextActionDate}
                  onChange={(e) => setEditNextActionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  Private Application Notes (Salary, Recruiter details, Technical interview questions)
                </label>
                <textarea
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Private notes remain completely confidential and are never shared publicly..."
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] leading-relaxed"
                />
              </div>

              {/* Linked Documents Showcase */}
              <div className="p-3 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  Linked Application Documents
                </span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs p-1.5 bg-[var(--surface-main)] rounded border border-[var(--border-subtle)]">
                    <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                      <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>{cvVersions[0]?.name || 'Frontend Engineer CV'}</span>
                    </span>
                    <span className="text-[10px] font-mono text-emerald-600">84% ATS Match</span>
                  </div>
                  <div className="flex items-center justify-between text-xs p-1.5 bg-[var(--surface-main)] rounded border border-[var(--border-subtle)]">
                    <span className="flex items-center gap-1.5 text-[var(--text-primary)]">
                      <FolderClosed className="w-3.5 h-3.5 text-blue-500" />
                      <span>{selectedApp.company} - Tailored Cover Letter.pdf</span>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">Verified</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setSelectedApp(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                Close
              </button>
              <button
                onClick={handleSaveAppDetails}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold"
              >
                Save Notes & Reminder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Add Application */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">Track New Application</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Stripe, Linear, Vercel"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Target Role Title</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Frontend Engineer"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Pipeline Stage</label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value as ApplicationStage)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] capitalize"
                  >
                    {stages.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Work Mode</label>
                  <select
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                  >
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Follow-up Action / Interview Details</label>
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Technical round scheduled for Oct 22"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Private Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Details, recruiter name, compensation discussed..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] font-medium text-[var(--text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-white font-semibold hover:bg-[var(--accent-secondary)]"
                >
                  Save to Pipeline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
