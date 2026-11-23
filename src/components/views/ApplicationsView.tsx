import React, { useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  Plus,
  Trash2,
  X,
  FileText,
  FolderClosed,
  Search,
  CalendarClock,
  AlertTriangle,
  Archive,
  TrendingUp,
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
  // The list view's own controls. They live in this screen rather than in the
  // URL because they are a way of reading the list the candidate already has,
  // not a destination that can be shared.
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<'all' | ApplicationStage>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'applied' | 'company'>('updated');
  // A deletion is irreversible, so it is confirmed rather than done on the
  // first click. The row is held here until the candidate says yes.
  const [pendingDelete, setPendingDelete] = useState<JobApplication | null>(null);
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

  /**
   * The follow-up reminders.
   *
   * A reminder is the follow-up date the candidate already recorded on their
   * own application — nothing is scheduled for them. The three groups are the
   * three things a reminder can mean: it is late, it is today, or it is coming.
   * Applications that were withdrawn or rejected are left out, because there is
   * nothing left to follow up.
   */
  const followUps = useMemo(() => {
    const today = todayIsoDate();
    const live = applications
      .filter((app) => Boolean(app.nextActionDate))
      .filter((app) => !['withdrawn', 'rejected'].includes(app.stage))
      .map((app) => ({ app, date: String(app.nextActionDate) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    return {
      today,
      overdue: live.filter((entry) => entry.date < today),
      dueToday: live.filter((entry) => entry.date === today),
      upcoming: live.filter((entry) => entry.date > today),
    };
  }, [applications]);

  /**
   * The pipeline analytics.
   *
   * Only the two measures the stored rows can actually support are computed:
   * the share of confirmed applications that reached an interview, and the
   * share that reached an offer. Both are ratios of the candidate's own rows.
   * A response-time average is deliberately NOT shown: the record has no
   * transition timestamps, and `lastUpdated` changes when a note is edited, so
   * an average built from it would be a guess wearing a number's clothes.
   */
  const analytics = useMemo(() => {
    const confirmed = applications.filter((app) => app.stage !== 'saved');
    const reachedInterview = confirmed.filter((app) =>
      ['interview', 'technical', 'final', 'offer'].includes(app.stage)
    );
    const offers = confirmed.filter((app) => app.stage === 'offer');
    const awaiting = confirmed.filter((app) => app.stage === 'applied' || app.stage === 'screening');

    return {
      confirmed: confirmed.length,
      reachedInterview: reachedInterview.length,
      offers: offers.length,
      awaiting: awaiting.length,
      conversionPct:
        confirmed.length === 0
          ? null
          : Math.round((reachedInterview.length / confirmed.length) * 100),
      offerPct:
        confirmed.length === 0 ? null : Math.round((offers.length / confirmed.length) * 100),
    };
  }, [applications]);

  /** The list view's rows: searched, filtered and sorted in one pass. */
  const listApplications = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = applications.filter((app) => {
      if (stageFilter !== 'all' && app.stage !== stageFilter) return false;
      if (!term) return true;
      return [app.role, app.company, app.location, app.workMode, app.notes, app.nextAction]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'company') return a.company.localeCompare(b.company);
      if (sortBy === 'applied') {
        const left = a.appliedDate ?? '';
        const right = b.appliedDate ?? '';
        return left < right ? 1 : left > right ? -1 : 0;
      }
      return a.lastUpdated < b.lastUpdated ? 1 : a.lastUpdated > b.lastUpdated ? -1 : 0;
    });
  }, [applications, search, stageFilter, sortBy]);

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
        THE FOLLOW-UP REMINDERS.

        The dates here are dates the candidate recorded on their own rows. The
        panel only sorts them into the three things a reminder can mean — late,
        today, coming up — and offers the one action that closes it.
      */}
      <section
        aria-labelledby="application-follow-ups"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4"
        data-applications-followups
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3
              id="application-follow-ups"
              className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]"
            >
              <CalendarClock className="h-4 w-4 text-[var(--color-primary-text)]" />
              {t('Follow-up reminders')}
            </h3>
            <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
              {t('From the follow-up dates you set on your own applications.')}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {followUps.overdue.length} {t('overdue')}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--color-warning)]">
              {followUps.dueToday.length} {t('today')}
            </span>
            <span className="text-[var(--text-muted)]">
              {followUps.upcoming.length} {t('coming up')}
            </span>
          </div>
        </div>

        {followUps.overdue.length + followUps.dueToday.length + followUps.upcoming.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border-subtle)] p-3 text-[11px] text-[var(--text-secondary)]">
            {t('No follow-ups scheduled. Open an application and set a follow-up date to be reminded here.')}
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {[...followUps.overdue, ...followUps.dueToday, ...followUps.upcoming]
              .slice(0, 5)
              .map(({ app, date }) => {
                const late = date < followUps.today;
                const dueToday = date === followUps.today;
                return (
                  <li
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleOpenDetails(app)}
                      className="min-w-0 text-start text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
                    >
                      <span className="font-bold text-[var(--text-primary)]">{app.role}</span>
                      <span className="text-[var(--text-secondary)]"> · {app.company}</span>
                      {app.nextAction ? (
                        <span className="block text-[11px] text-[var(--text-secondary)]">
                          {app.nextAction}
                        </span>
                      ) : null}
                    </button>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                          late
                            ? 'bg-[var(--color-danger-surface)] text-[var(--color-danger)]'
                            : dueToday
                              ? 'bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
                              : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                        }`}
                      >
                        {late ? t('Overdue') : dueToday ? t('Today') : date}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          updateApplicationNotes(app.id, app.notes, '', '');
                          showToast({
                            variant: 'success',
                            title: t('Follow-up cleared'),
                            description: `${app.role} ${t('at')} ${app.company}`,
                          });
                        }}
                        className="text-[10px] font-semibold text-[var(--color-primary-text)] hover:underline"
                      >
                        {t('Mark done')}
                      </button>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/*
        THE CONVERSION ANALYTICS.

        Two ratios the stored rows can support, and the count of applications
        still waiting. Nothing is shown when there is nothing to divide: a
        percentage of zero applications is not 0%, it is unknown.
      */}
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        data-applications-analytics
      >
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <TrendingUp className="h-3.5 w-3.5" />
            {t('Application-to-interview conversion')}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-primary)]">
            {analytics.conversionPct === null ? '—' : `${analytics.conversionPct}%`}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {analytics.confirmed === 0
              ? t('Confirm an application to measure this')
              : `${analytics.reachedInterview} ${t('of')} ${analytics.confirmed} ${t('confirmed applications reached an interview')}`}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Briefcase className="h-3.5 w-3.5" />
            {t('Offer rate')}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--color-success-strong)]">
            {analytics.offerPct === null ? '—' : `${analytics.offerPct}%`}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {analytics.confirmed === 0
              ? t('Confirm an application to measure this')
              : `${analytics.offers} ${t('offers from')} ${analytics.confirmed} ${t('confirmed applications')}`}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <CalendarClock className="h-3.5 w-3.5" />
            {t('Awaiting a response')}
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[var(--text-secondary)]">
            {analytics.awaiting}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {t('Applied or in screening, with no later stage recorded yet')}
          </div>
        </div>
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
                        className={`p-3 rounded-lg bg-[var(--surface-secondary)]/50 border space-y-2 text-xs transition-all duration-200 hover:shadow-md shadow-xs ${
                          draggingId === app.id
                            ? 'border-[var(--accent-primary)] opacity-60'
                            : 'border-[var(--border-subtle)] hover:border-[var(--accent-primary)]'
                        }`}
                      >
                        {/*
                          The card's title is the control that opens it, so the
                          card is reachable and openable from the keyboard. A
                          click on the card body still opens it for a pointer,
                          and the stage menu and delete control stop their own
                          clicks from doing the same.
                        */}
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(app)}
                          aria-label={`${app.role} ${t('at')} ${app.company} — ${t('drag to another stage, or use the stage menu')}`}
                          className="block w-full cursor-pointer rounded text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]/40"
                        >
                          <div className="font-bold text-sm text-[var(--text-primary)] leading-tight">{app.role}</div>
                          <div className="text-[var(--text-muted)] mt-0.5">{app.company}</div>
                        </button>

                        {app.nextAction && (
                          <div className="text-[11px] text-[var(--color-primary-text)] font-medium line-clamp-2">
                            → {app.nextAction}
                          </div>
                        )}

                        {/* A recorded follow-up date is shown on the card, so a
                            reminder is visible without opening the application. */}
                        {app.nextActionDate ? (
                          <div
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                              String(app.nextActionDate) < followUps.today
                                ? 'bg-[var(--color-danger-surface)] text-[var(--color-danger)]'
                                : String(app.nextActionDate) === followUps.today
                                  ? 'bg-[var(--color-warning-surface)] text-[var(--color-warning)]'
                                  : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
                            }`}
                          >
                            <CalendarClock className="h-3 w-3" />
                            {app.nextActionDate}
                          </div>
                        ) : null}

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
                            onClick={() => setPendingDelete(app)}
                            aria-label={`${t('Delete application')}: ${app.role} ${t('at')} ${app.company}`}
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
          {/*
            The list's own controls. Search covers the fields the candidate
            would search by — role, company, place, notes — and the stage
            filter and sort run over the same already-loaded rows, so nothing
            here costs a request.
          */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[180px] flex-1">
              <span className="sr-only">{t('Search applications')}</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search by role, company, place or note')}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] py-1.5 pe-3 ps-8 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
            </label>

            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              {t('Stage')}
              <select
                value={stageFilter}
                onChange={(event) =>
                  setStageFilter(event.target.value as 'all' | ApplicationStage)
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-xs capitalize text-[var(--text-primary)]"
              >
                <option value="all">{t('All stages')}</option>
                {stages.concat(['rejected', 'withdrawn']).map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              {t('Sort by')}
              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value as 'updated' | 'applied' | 'company')
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              >
                <option value="updated">{t('Last updated')}</option>
                <option value="applied">{t('Applied date')}</option>
                <option value="company">{t('Company name')}</option>
              </select>
            </label>

            {(search || stageFilter !== 'all' || sortBy !== 'updated') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setStageFilter('all');
                  setSortBy('updated');
                }}
                className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              >
                {t('Clear filters')}
              </button>
            )}

            <span className="ms-auto text-[11px] text-[var(--text-muted)]">
              {listApplications.length} {t('of')} {applications.length}
            </span>
          </div>

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
                {listApplications.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[11px] text-[var(--text-secondary)]">
                      {t('No application matches these filters.')}
                    </td>
                  </tr>
                ) : (
                  listApplications.map((app) => (
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
                      {app.nextActionDate ? (
                        <div className="mt-0.5 font-mono text-[10px] font-normal text-[var(--text-muted)]">
                          {app.nextActionDate}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 text-end">
                      <button
                        onClick={() => setPendingDelete(app)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] px-2 py-1"
                      >
                        {t('Delete')}
                      </button>
                    </td>
                  </tr>
                  ))
                )}
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
                aria-label={t('Close')}
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
                <label htmlFor="application-followup-action" className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Next Follow-up Action')}
                </label>
                <input
                  id="application-followup-action"
                  type="text"
                  value={editNextAction}
                  onChange={(e) => setEditNextAction(e.target.value)}
                  placeholder={t('e.g. Round 2 Technical Interview with Lead Architect')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label htmlFor="application-followup-date" className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Follow-up / Interview Deadline Date')}
                </label>
                <input
                  id="application-followup-date"
                  type="date"
                  value={editNextActionDate}
                  onChange={(e) => setEditNextActionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label htmlFor="application-private-notes" className="font-semibold text-[var(--text-primary)] block mb-1">
                  {t('Private Application Notes (Salary, Recruiter details, Technical interview questions)')}
                </label>
                <textarea
                  id="application-private-notes"
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
                    <label htmlFor="application-cv-version" className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
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
                      id="application-cv-version"
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
                    <label htmlFor="application-cover-letter" className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderClosed className="w-3.5 h-3.5 text-[var(--color-accent-strong)]" />
                        {t('Linked Cover Letter')}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {selectedCoverLetterId ? t('Linked') : t('None linked')}
                      </span>
                    </label>
                    <select
                      id="application-cover-letter"
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

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[var(--border-subtle)]">
              {/*
                Archiving is a stage change, not a deletion: the application
                and its history stay, and it can be brought back from the stage
                menu. Nothing the candidate wrote is thrown away.
              */}
              <button
                type="button"
                onClick={() => {
                  const archived = selectedApp;
                  setSelectedApp(null);
                  void updateApplicationStage(archived.id, 'withdrawn').then((moved) => {
                    showToast({
                      variant: moved ? 'success' : 'error',
                      title: moved ? t('Application archived') : t('The application could not be archived'),
                      description: moved
                        ? t('It is kept under Withdrawn and can be moved back at any time.')
                        : t('The stage was not saved, so the application stayed where it was.'),
                    });
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
              >
                <Archive className="h-3.5 w-3.5" />
                {t('Archive application')}
              </button>

              <div className="flex items-center gap-2">
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
        </div>
      )}

      {/* MODAL: Confirm a deletion. A tracked application carries notes, a
          stage history and document links, so it is never removed on a single
          click. */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-application-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setPendingDelete(null);
          }}
        >
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-2xl">
            <div>
              <h3 id="delete-application-title" className="text-base font-bold text-[var(--text-primary)]">
                {t('Delete this application?')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                {pendingDelete.role} {t('at')} {pendingDelete.company}.{' '}
                {t('This removes the tracked application and its notes. If you only want it out of the active pipeline, archive it instead.')}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setPendingDelete(null)}
                className="rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  void deleteApplication(target.id);
                  showToast({
                    variant: 'success',
                    title: t('Application deleted'),
                    description: `${target.role} ${t('at')} ${target.company}`,
                  });
                }}
                className="rounded-xl bg-[var(--color-danger)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                {t('Delete application')}
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
                aria-label={t('Close')}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="application-company" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Company Name')}</label>
                <input
                  id="application-company"
                  type="text"
                  required
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={t('e.g. Google, Linear, Vercel')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label htmlFor="application-role" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Target Role Title')}</label>
                <input
                  id="application-role"
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
                  <label htmlFor="application-stage" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Pipeline Stage')}</label>
                  <select
                    id="application-stage"
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
                  <label htmlFor="application-work-mode" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Work Mode')}</label>
                  <select
                    id="application-work-mode"
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
                <label htmlFor="application-applied-date" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Applied Date')}</label>
                <input
                  id="application-applied-date"
                  type="date"
                  value={appliedDate}
                  onChange={(e) => setAppliedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label htmlFor="application-next-action" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Follow-up Action / Interview Details')}</label>
                <input
                  id="application-next-action"
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder={t('e.g. Technical round scheduled for Oct 22')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label htmlFor="application-notes" className="block font-semibold text-[var(--text-secondary)] mb-1">{t('Private Notes')}</label>
                <textarea
                  id="application-notes"
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
