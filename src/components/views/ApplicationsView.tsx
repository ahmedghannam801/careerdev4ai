import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Plus,
  Trash2,
  X,
  FileText,
  FolderClosed,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { APPLICATION_VIEW_MODES } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { todayIsoDate } from '../../../shared/dateRange';
import {
  listApplicationPackages,
  saveApplicationPackage,
  updateApplicationPackage,
  type ApplicationPackageDTO,
} from '../../lib/applicationPackagesApi';
import { ApplicationStage, JobApplication } from '../../types/career';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import { useToast } from '../toast/ToastProvider';

export const ApplicationsView: React.FC = () => {
  const {
    applications,
    updateApplicationStage,
    updateApplicationNotes,
    deleteApplication,
    addApplication,
    cvVersions,
    coverLetters,
    saveCoverLetter,
    t,
  } = useCareer();
  const { showToast } = useToast();

  const [viewMode, setViewMode] = useRouteParam<'kanban' | 'list'>('view', APPLICATION_VIEW_MODES, 'kanban');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [packages, setPackages] = useState<ApplicationPackageDTO[]>([]);

  // Form state for new application
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [location] = useState('Remote');
  const [workMode, setWorkMode] = useState('Remote');
  const [stage, setStage] = useState<ApplicationStage>('applied');
  const [nextAction, setNextAction] = useState('Awaiting recruiter response');
  const [nextActionDate, setNextActionDate] = useState('');
  const [appliedDate, setAppliedDate] = useState(todayIsoDate());
  const [notes, setNotes] = useState('');

  // Edit details form inside modal
  const [editNotes, setEditNotes] = useState('');
  const [editNextAction, setEditNextAction] = useState('');
  const [editNextActionDate, setEditNextActionDate] = useState('');
  const [selectedCvVersionId, setSelectedCvVersionId] = useState('');
  const [selectedCoverLetterId, setSelectedCoverLetterId] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    let active = true;
    listApplicationPackages()
      .then((list) => {
        if (active) setPackages(list);
      })
      .catch(() => {
        // Packages are optional metadata for document linking.
      });
    return () => {
      active = false;
    };
  }, []);

  const findMatchingPackage = (app: JobApplication): ApplicationPackageDTO | undefined =>
    packages.find(
      (pkg) =>
        (pkg.company ?? '').trim().toLowerCase() === app.company.trim().toLowerCase() &&
        (pkg.jobTitle ?? '').trim().toLowerCase() === app.role.trim().toLowerCase()
    );

  const stages: ApplicationStage[] = [
    'saved',
    'applied',
    'screening',
    'interview',
    'technical',
    'final',
    'offer'
  ];

  /**
   * The overview counters.
   *
   * Every number is counted from the candidate's own application rows. There
   * is no default and no guess: a candidate with no applications sees zeros,
   * which is the truth about their pipeline.
   */
  const overview = useMemo(() => {
    const interviewStages: ApplicationStage[] = ['interview', 'technical', 'final'];
    const pendingStages: ApplicationStage[] = ['saved', 'applied', 'screening'];
    return {
      total: applications.length,
      interviews: applications.filter((app) => interviewStages.includes(app.stage)).length,
      pending: applications.filter((app) => pendingStages.includes(app.stage)).length,
      offers: applications.filter((app) => app.stage === 'offer').length,
    };
  }, [applications]);

  /**
   * The applications, counted by the month they were applied for.
   *
   * The chart shows the last six months, including the months with no
   * applications — a month with no applications is a fact about the pipeline,
   * not a gap in the data, so it is drawn as an empty column rather than
   * skipped.
   */
  const activityByMonth = useMemo(() => {
    const months: { key: string; label: string; count: number }[] = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: date.toLocaleDateString(undefined, { month: 'short' }),
        count: 0,
      });
    }
    const index = new Map(months.map((month) => [month.key, month]));
    for (const app of applications) {
      const applied = app.appliedDate ?? app.lastUpdated;
      if (!applied) continue;
      const parsed = new Date(applied);
      if (Number.isNaN(parsed.getTime())) continue;
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
      const month = index.get(key);
      if (month) month.count += 1;
    }
    const highest = Math.max(1, ...months.map((month) => month.count));
    return months.map((month) => ({ ...month, highest }));
  }, [applications]);

  /* ----------------------------------------------------------------------
   * MOVING A CARD
   * ------------------------------------------------------------------- */

  // The card being dragged, and the column the pointer is over. Both are
  // local to this screen: the drag never leaves the pipeline.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ApplicationStage | null>(null);

  const handleStageChange = async (app: JobApplication, nextStage: ApplicationStage) => {
    if (app.stage === nextStage) return;
    const moved = await updateApplicationStage(app.id, nextStage);
    if (moved) {
      showToast({
        variant: 'success',
        title: t('Application moved'),
        description: `${app.role} ${t('at')} ${app.company} ${t('is now')} ${nextStage}.`,
      });
      return;
    }
    showToast({
      variant: 'error',
      title: t('The application could not be moved'),
      description: t('The stage was not saved, so the application stayed where it was.'),
    });
  };

  const handleDrop = (targetStage: ApplicationStage) => {
    const id = draggingId;
    setDraggingId(null);
    setDragOverStage(null);
    if (!id) return;
    const app = applications.find((entry) => entry.id === id);
    if (!app) return;
    void handleStageChange(app, targetStage);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !role.trim()) return;

    addApplication({
      company: company.trim(),
      role: role.trim(),
      location: location.trim(),
      workMode,
      stage,
      appliedDate: appliedDate || todayIsoDate(),
      nextAction: nextAction.trim() || undefined,
      nextActionDate: nextActionDate || undefined,
      notes: notes.trim()
    });

    // `addApplication` records the activity itself. Logging it here as well
    // put two entries in Recent Activity for one application.

    setCompany('');
    setRole('');
    setNotes('');
    setNextActionDate('');
    setAppliedDate(todayIsoDate());
    setShowAddModal(false);
  };

  const handleOpenDetails = (app: JobApplication) => {
    setSelectedApp(app);
    setEditNotes(app.notes || '');
    setEditNextAction(app.nextAction || '');
    setEditNextActionDate(app.nextActionDate || '');
    const pkg = findMatchingPackage(app);
    const linkedLetter =
      coverLetters.find((letter) => letter.applicationId === app.id) ??
      (pkg?.coverLetterId ? coverLetters.find((letter) => letter.id === pkg.coverLetterId) : undefined);
    setSelectedCvVersionId(pkg?.tailoredCvVersionId ?? '');
    setSelectedCoverLetterId(linkedLetter?.id ?? '');
  };

  const handleSaveAppDetails = async () => {
    if (!selectedApp || savingDetails) return;
    setSavingDetails(true);
    try {
      updateApplicationNotes(selectedApp.id, editNotes, editNextAction, editNextActionDate);

      // Link selected cover letter in PostgreSQL via cover_letters.application_id.
      if (selectedCoverLetterId) {
        const pickedLetter = coverLetters.find((l) => l.id === selectedCoverLetterId);
        if (pickedLetter && pickedLetter.applicationId !== selectedApp.id) {
          await saveCoverLetter({
            id: pickedLetter.id,
            title: pickedLetter.title,
            company: pickedLetter.company,
            role: pickedLetter.role,
            jobDescription: pickedLetter.jobDescription,
            content: pickedLetter.content,
            keyHighlights: pickedLetter.keyHighlights,
            targetJobId: pickedLetter.targetJobId,
            applicationId: selectedApp.id,
          });
        }
      }

      // Link selected CV version / cover letter in application_packages when selected or updating.
      const existingPkg = findMatchingPackage(selectedApp);
      const pickedVersion = cvVersions.find((v) => v.id === selectedCvVersionId) ?? null;
      if (existingPkg) {
        const updated = await updateApplicationPackage(existingPkg.id, {
          tailoredCvVersionId: selectedCvVersionId || null,
          coverLetterId: selectedCoverLetterId || null,
          matchScore: pickedVersion?.atsAnalysis?.overallScore ?? existingPkg.matchScore,
        });
        setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else if (selectedCvVersionId || selectedCoverLetterId) {
        const created = await saveApplicationPackage({
          jobTitle: selectedApp.role,
          company: selectedApp.company,
          jobDescription: `Application package for ${selectedApp.role} at ${selectedApp.company}.`,
          analysis: {},
          matchAnalysis: {},
          matchScore: pickedVersion?.atsAnalysis?.overallScore ?? 0,
          language: null,
          sourceCvId: pickedVersion?.cvId ?? null,
          tailoredCvVersionId: selectedCvVersionId || null,
          coverLetterId: selectedCoverLetterId || null,
        });
        setPackages((prev) => [created, ...prev]);
      }

      showToast({
        variant: 'success',
        title: t('Application updated'),
        description: t('Saved notes and document links for {company}.').replace('{company}', selectedApp.company),
      });
      setSelectedApp(null);
    } catch (error) {
      showToast({
        variant: 'error',
        title: t('Failed to save application links'),
        description: error instanceof Error ? error.message : t('Please try again.'),
      });
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            {t('OPPORTUNITY PIPELINE')}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Job Application Tracker')} ({applications.length})
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {t('Discipline-driven pipeline management with linked CV versions, tailored cover letters, and private notes.')}
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
              {t('Pipeline Board')}
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded font-medium transition-colors ${
                viewMode === 'list'
                  ? 'bg-[var(--surface-main)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {t('List View')}
            </button>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('Add Application')}</span>
          </button>
        </div>
      </div>

      {/*
        The overview.

        Every number is counted from the candidate's own rows, so it moves
        when a card moves: an application that is dragged into "Interview"
        is an interview the moment the write succeeds.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('Total Applications'), value: overview.total, tone: 'text-[var(--text-primary)]' },
          { label: t('Interviews'), value: overview.interviews, tone: 'text-[var(--color-primary-text)]' },
          { label: t('Pending Responses'), value: overview.pending, tone: 'text-[var(--text-secondary)]' },
          { label: t('Offers'), value: overview.offers, tone: 'text-[var(--color-success-strong)]' },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {metric.label}
            </div>
            <div className={`mt-1 font-mono text-2xl font-bold tabular-nums ${metric.tone}`}>
              {metric.value}
            </div>
          </div>
        ))}
      </div>

      {/*
        The activity chart.

        Six months of real application dates. A month with no application is
        drawn as an empty column, because "nothing happened that month" is
        information too.
      */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Application activity')}</h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
          {t('Applications by the month they were sent, over the last six months.')}
        </p>
        <div className="mt-3 flex h-24 items-end gap-2">
          {activityByMonth.map((month) => (
            <div key={month.key} className="flex flex-1 flex-col items-center gap-1">
              <span className="font-mono text-[10px] text-[var(--text-secondary)]">{month.count}</span>
              <div
                className="w-full rounded-t-md bg-[var(--accent-primary)]/70 transition-[height] duration-300"
                style={{ height: `${Math.round((month.count / month.highest) * 64)}px`, minHeight: '2px' }}
                role="img"
                aria-label={`${month.label}: ${month.count}`}
              />
              <span className="text-[10px] text-[var(--text-muted)]">{month.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* KANBAN BOARD */}
      {viewMode === 'kanban' ? (
        <Stagger data-tour="applications-kanban" inView gap={0.06} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 overflow-x-auto pb-4">
          {stages.map((st) => {
            const stageApps = applications.filter((a) => a.stage === st);
            const isDropTarget = dragOverStage === st;

            return (
              <StaggerItem
                key={st}
                onDragOver={(event) => {
                  // The column accepts the card. Without this the browser
                  // refuses the drop and nothing happens.
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dragOverStage !== st) setDragOverStage(st);
                }}
                onDragLeave={() => {
                  if (dragOverStage === st) setDragOverStage(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(st);
                }}
                className={`bg-[var(--surface-main)] rounded-xl border p-3 flex flex-col min-w-[200px] shadow-2xs transition-colors ${
                  isDropTarget
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)]'
                    : 'border-[var(--border-subtle)]'
                }`}
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
                <div className="space-y-2.5 flex-1 min-h-[3rem]">
                  {stageApps.length === 0 ? (
                    <div className="h-24 flex items-center justify-center text-[11px] text-[var(--text-muted)] italic">
                      {t('Empty')}
                    </div>
                  ) : (
                    stageApps.map((app) => (
                      <div
                        key={app.id}
                        onClick={() => handleOpenDetails(app)}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', app.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(app.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        aria-label={`${app.role} ${t('at')} ${app.company} — ${t('drag to another stage, or use the stage menu')}`}
                        className={`p-3 rounded-lg bg-[var(--surface-secondary)]/50 border space-y-2 text-xs cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md shadow-xs ${
                          draggingId === app.id
                            ? 'border-[var(--accent-primary)] opacity-60'
                            : 'border-[var(--border-subtle)] hover:border-[var(--accent-primary)]'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm text-[var(--text-primary)] leading-tight">{app.role}</div>
                          <div className="text-[var(--text-muted)] mt-0.5">{app.company}</div>
                        </div>

                        {app.nextAction && (
                          <div className="text-[11px] text-[var(--color-primary-text)] font-medium line-clamp-2">
                            → {app.nextAction}
                          </div>
                        )}

                        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between" onClick={e => e.stopPropagation()}>
                          <select
                            value={app.stage}
                            onChange={(e) => void handleStageChange(app, e.target.value as ApplicationStage)}
                            className="text-[10px] bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] font-medium capitalize"
                          >
                            {stages.concat(['rejected', 'withdrawn']).map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>

                          <button
                            onClick={() => deleteApplication(app.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)] rounded"
                            title={t('Delete application')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={t('No tracked job applications yet')}
          description={t('Track live opportunities or manual applications to keep linked CV versions, cover letters, follow-up dates, and interview stages organized.')}
          actionLabel={t('Track New Application')}
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        /* LIST VIEW */
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
                  <th className="pb-3 font-semibold">{t('Role & Company')}</th>
                  <th className="pb-3 font-semibold">{t('Stage')}</th>
                  <th className="pb-3 font-semibold">{t('Location / Mode')}</th>
                  <th className="pb-3 font-semibold">{t('Next Action')}</th>
                  <th className="pb-3 font-semibold text-end">{t('Actions')}</th>
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
                        onChange={(e) => void handleStageChange(app, e.target.value as ApplicationStage)}
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
                    <td className="py-3 text-[var(--color-primary-text)] font-medium">
                      {app.nextAction || '—'}
                    </td>
                    <td className="py-3 text-end">
                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] px-2 py-1"
                      >
                        {t('Delete')}
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
                <p className="text-xs text-[var(--color-primary-text)] font-semibold">
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
                  <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">{t('Pipeline Stage')}</span>
                  <span className="font-bold text-[var(--text-primary)] capitalize">{selectedApp.stage}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-[var(--text-muted)] block">{t('Applied Date')}</span>
                  <span className="font-mono text-[var(--text-primary)]">{selectedApp.appliedDate || t('Not set')}</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Next Follow-up Action')}
                </label>
                <input
                  type="text"
                  value={editNextAction}
                  onChange={(e) => setEditNextAction(e.target.value)}
                  placeholder={t('e.g. Round 2 Technical Interview with Lead Architect')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Follow-up / Interview Deadline Date')}
                </label>
                <input
                  type="date"
                  value={editNextActionDate}
                  onChange={(e) => setEditNextActionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Private Application Notes (Salary, Recruiter details, Technical interview questions)')}
                </label>
                <textarea
                  rows={4}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder={t('Private notes remain completely confidential and are never shared publicly...')}
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              {/* Linked Documents Showcase */}
              <div className="p-3 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                  {t('Linked Application Documents')}
                </span>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                        {t('Linked CV Version')}
                      </span>
                      {(() => {
                        const cvVer = cvVersions.find((v) => v.id === selectedCvVersionId);
                        if (!cvVer) return <span className="text-[10px] text-[var(--text-muted)]">{t('None linked')}</span>;
                        return cvVer.atsAnalysis ? (
                          <span className="text-[10px] font-mono text-[var(--color-success-strong)]">
                            {t('ATS')}: {cvVer.atsAnalysis.overallScore}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">{t('Not audited yet')}</span>
                        );
                      })()}
                    </label>
                    <select
                      value={selectedCvVersionId}
                      onChange={(e) => setSelectedCvVersionId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="">{cvVersions.length === 0 ? t('No saved CV snapshots yet') : t('None linked')}</option>
                      {cvVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.name}
                          {version.atsAnalysis ? ` (ATS ${version.atsAnalysis.overallScore}%)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderClosed className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
                        {t('Linked Cover Letter')}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {selectedCoverLetterId ? t('Linked') : t('None linked')}
                      </span>
                    </label>
                    <select
                      value={selectedCoverLetterId}
                      onChange={(e) => setSelectedCoverLetterId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    >
                      <option value="">{coverLetters.length === 0 ? t('No saved cover letters yet') : t('None linked')}</option>
                      {coverLetters.map((letter) => (
                        <option key={letter.id} value={letter.id}>
                          {letter.title} ({letter.company})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={() => setSelectedApp(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                {t('Close')}
              </button>
              <button
                onClick={() => void handleSaveAppDetails()}
                disabled={savingDetails}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold disabled:opacity-60"
              >
                {savingDetails ? t('Saving…') : t('Save Notes & Reminder')}
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
              <h3 className="text-base font-bold text-[var(--text-primary)]">{t('Track New Application')}</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Company Name')}</label>
                <input
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t('e.g. Stripe, Linear, Vercel')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Target Role Title')}</label>
                <input
                  type="text"
                  required
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={t('e.g. Frontend Engineer')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Pipeline Stage')}</label>
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
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Work Mode')}</label>
                  <select
                    value={workMode}
                    onChange={(e) => setWorkMode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                  >
                    <option value="Remote">{t('Remote')}</option>
                    <option value="Hybrid">{t('Hybrid')}</option>
                    <option value="On-site">{t('On-site')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Applied Date')}</label>
                <input
                  type="date"
                  value={appliedDate}
                  onChange={(e) => setAppliedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Follow-up Action / Interview Details')}</label>
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder={t('e.g. Technical round scheduled for Oct 22')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Private Notes')}</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('Details, recruiter name, compensation discussed...')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] font-medium text-[var(--text-secondary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] font-semibold hover:bg-[var(--accent-secondary)]"
                >
                  {t('Save to Pipeline')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Reveal>
  );
};
