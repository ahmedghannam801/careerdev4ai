import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Filter,
  PlayCircle,
  Rocket,
  Search,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { ExperienceCard, experienceReasonText } from '../experiences/ExperienceCard';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { EmptyState } from '../ui/EmptyState';
import {
  EXPERIENCE_TABS,
  type ExperienceTab,
} from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import {
  EXPERIENCE_DIFFICULTY_LABELS,
  providerForSimulationUrl,
  type CareerExperience,
  type ExperienceDifficulty,
  type ExperienceProgressStatus,
} from '../../../shared/careerExperience';
import {
  rankExperiences,
  selectNextExperience,
  type ExperienceMatch,
  type ExperienceMatchContext,
} from '../../../shared/experienceMatching';
import { CAREER_DOMAINS, getCareerDomainLabel } from '../../../shared/careerDomains';

type DifficultyFilter = ExperienceDifficulty | 'all';
type StatusFilter = ExperienceProgressStatus | 'all';
type DurationFilter = 'all' | 'short' | 'medium' | 'long';

const DURATION_OPTIONS: Array<{ value: DurationFilter; label: string }> = [
  { value: 'all', label: 'Any duration' },
  { value: 'short', label: 'Short — up to 2 hours' },
  { value: 'medium', label: 'Medium — 3 to 4 hours' },
  { value: 'long', label: 'Long — 5 hours or more' },
];

/** The published duration midpoint, used only to filter. */
function matchesDuration(experience: CareerExperience, duration: DurationFilter): boolean {
  if (duration === 'all') return true;
  const hours = experience.durationHours;
  if (hours === null) return false;
  if (duration === 'short') return hours <= 2;
  if (duration === 'medium') return hours > 2 && hours <= 4;
  return hours > 4;
}

function matchesSearch(experience: CareerExperience, search: string): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return (
    experience.title.toLowerCase().includes(term) ||
    experience.provider.toLowerCase().includes(term) ||
    experience.category.toLowerCase().includes(term) ||
    experience.description.toLowerCase().includes(term) ||
    experience.domainIds.some((domainId) =>
      getCareerDomainLabel(domainId).toLowerCase().includes(term)
    ) ||
    experience.skills.some((skill) => skill.name.toLowerCase().includes(term)) ||
    experience.roles.some((role) => role.roleSlug.toLowerCase().includes(term))
  );
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (typeof name !== 'string' || !name.trim()) continue;
    const key = name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name.trim());
  }
  return result;
}

export const ExperienceHubView: React.FC = () => {
  const {
    t,
    targetRole,
    experienceLevel,
    analysis,
    roadmapPhases,
    learningCatalog,
    learningItems,
    skills,
    ownedSkills,
    experienceCatalog,
    experienceProgress,
    experienceCertificates,
    isExperiencesLoading,
    experienceError,
    saveExperience,
    startExperience,
    completeExperience,
    resetExperience,
    saveExperienceCertificate,
    removeExperienceCertificate,
  } = useCareer();

  const [tab, setTab] = useRouteParam<ExperienceTab>(
    'tab',
    EXPERIENCE_TABS,
    'recommended'
  );
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const experienceById = useMemo(() => {
    const map = new Map<string, CareerExperience>();
    for (const experience of experienceCatalog) map.set(experience.id, experience);
    return map;
  }, [experienceCatalog]);

  const progressById = useMemo(() => {
    const map = new Map<string, (typeof experienceProgress)[number]>();
    for (const row of experienceProgress) map.set(row.experienceId, row);
    return map;
  }, [experienceProgress]);

  const certificateById = useMemo(() => {
    const map = new Map<string, (typeof experienceCertificates)[number]>();
    for (const row of experienceCertificates) map.set(row.experienceId, row);
    return map;
  }, [experienceCertificates]);

  const matchingContext = useMemo<ExperienceMatchContext>(() => {
    const completedCourseIds = new Set(
      learningItems
        .filter((item) => item.status === 'completed')
        .map((item) => item.courseId)
    );

    return {
      targetRoleSlug: targetRole?.id ?? null,
      targetRoleTitle: targetRole?.title ?? null,
      targetDomainId: targetRole?.domainId ?? null,
      requiredSkills: (targetRole?.requiredSkills ?? []).map((skill) => skill.name),
      gapSkills: uniqueNames([
        ...(analysis?.criticalGaps ?? []).map((gap) => gap.skill),
        ...skills.filter((skill) => skill.gap > 0).map((skill) => skill.name),
      ]),
      roadmapSkills: uniqueNames(
        roadmapPhases.flatMap((phase) =>
          phase.milestones.flatMap((milestone) =>
            milestone.tasks
              .filter(
                (task) => task.status !== 'completed' && task.status !== 'skipped'
              )
              .map((task) => task.skillName)
          )
        )
      ),
      learningSkills: uniqueNames(
        learningCatalog
          .filter((course) => completedCourseIds.has(course.id))
          .flatMap((course) => course.skills.map((skill) => skill.name))
      ),
      ownedSkills,
      experienceLevel,
    };
  }, [
    analysis?.criticalGaps,
    experienceLevel,
    learningCatalog,
    learningItems,
    ownedSkills,
    roadmapPhases,
    skills,
    targetRole?.domainId,
    targetRole?.id,
    targetRole?.requiredSkills,
    targetRole?.title,
  ]);

  const ranked = useMemo(
    () =>
      rankExperiences(experienceCatalog, matchingContext, experienceProgress, {
        includeCompleted: true,
      }),
    [experienceCatalog, experienceProgress, matchingContext]
  );

  const matchById = useMemo(() => {
    const map = new Map<string, ExperienceMatch>();
    for (const match of ranked) map.set(match.experience.id, match);
    return map;
  }, [ranked]);

  const rankById = useMemo(() => {
    const map = new Map<string, number>();
    ranked.forEach((match, index) => map.set(match.experience.id, index));
    return map;
  }, [ranked]);

  const recommended = useMemo(
    () =>
      ranked.filter(
        (match) => progressById.get(match.experience.id)?.status !== 'completed'
      ),
    [progressById, ranked]
  );

  const statusOf = (experienceId: string): ExperienceProgressStatus =>
    progressById.get(experienceId)?.status ?? 'not_started';

  const entriesForStatus = (predicate: (row: (typeof experienceProgress)[number]) => boolean) =>
    experienceProgress
      .filter(predicate)
      .map((row) => experienceById.get(row.experienceId))
      .filter((entry): entry is CareerExperience => Boolean(entry));

  const savedItems = entriesForStatus(
    (row) => row.saved && row.status === 'not_started'
  );
  const inProgressItems = entriesForStatus((row) => row.status === 'in_progress');
  const completedItems = entriesForStatus((row) => row.status === 'completed');

  const categories = useMemo(
    () =>
      [...new Set(experienceCatalog.map((experience) => experience.category))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [experienceCatalog]
  );

  const domains = useMemo(() => {
    const present = new Set<string>();
    for (const experience of experienceCatalog) {
      for (const domainId of experience.domainIds) present.add(domainId);
    }
    return CAREER_DOMAINS.filter((domain) => present.has(domain.slug));
  }, [experienceCatalog]);

  const matchesFilters = (experience: CareerExperience): boolean => {
    if (categoryFilter !== 'all' && experience.category !== categoryFilter) return false;
    if (difficultyFilter !== 'all' && experience.difficulty !== difficultyFilter) {
      return false;
    }
    if (domainFilter !== 'all' && !experience.domainIds.includes(domainFilter as never)) {
      return false;
    }
    if (!matchesDuration(experience, durationFilter)) return false;
    if (statusFilter !== 'all' && statusOf(experience.id) !== statusFilter) return false;
    return matchesSearch(experience, search);
  };

  const filteredRecommended = recommended.filter((match) =>
    matchesFilters(match.experience)
  );

  const catalogFiltered = useMemo(
    () =>
      experienceCatalog
        .filter(matchesFilters)
        .sort((a, b) => {
          const ra = rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const rb = rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          if (ra !== rb) return ra - rb;
          return a.title.localeCompare(b.title);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      experienceCatalog,
      categoryFilter,
      difficultyFilter,
      domainFilter,
      durationFilter,
      statusFilter,
      search,
      rankById,
    ]
  );

  const quickWins = useMemo(
    () =>
      recommended
        .filter(
          (match) =>
            (match.experience.durationHours ?? Number.POSITIVE_INFINITY) <= 2.5
        )
        .slice(0, 4),
    [recommended]
  );

  const activeFilterCount =
    Number(Boolean(search.trim())) +
    Number(categoryFilter !== 'all') +
    Number(difficultyFilter !== 'all') +
    Number(domainFilter !== 'all') +
    Number(durationFilter !== 'all') +
    Number(statusFilter !== 'all');

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setDifficultyFilter('all');
    setDomainFilter('all');
    setDurationFilter('all');
    setStatusFilter('all');
  };

  const nextBest = selectNextExperience(recommended);
  const roleLabel = targetRole?.title || t('your target role');
  const certificateCount = experienceCertificates.length;

  const tabs: Array<{ id: ExperienceTab; label: string; count: number }> = [
    { id: 'recommended', label: 'Recommended', count: recommended.length },
    { id: 'saved', label: 'Saved', count: savedItems.length },
    { id: 'in_progress', label: 'In progress', count: inProgressItems.length },
    { id: 'completed', label: 'Completed', count: completedItems.length },
    { id: 'catalog', label: 'Explore catalog', count: experienceCatalog.length },
  ];

  const cardProps = (experience: CareerExperience) => ({
    experience,
    progress: progressById.get(experience.id),
    certificate: certificateById.get(experience.id),
    match: matchById.get(experience.id),
    isBusy: isExperiencesLoading,
    onSave: () => saveExperience(experience.id),
    onStart: () => startExperience(experience.id),
    onComplete: () => completeExperience(experience.id),
    onReset: () => resetExperience(experience.id),
    onSubmitCertificate: (url: string) =>
      saveExperienceCertificate(experience.id, url),
    onRemoveCertificate: () => removeExperienceCertificate(experience.id),
  });

  const filterSelectClass =
    'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text-primary)]';

  const renderGrid = (matches: ExperienceMatch[], key: string) => (
    <Stagger key={key} gap={0.06} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {matches.map((match) => (
        <StaggerItem key={match.experience.id} className="h-full">
          <ExperienceCard {...cardProps(match.experience)} />
        </StaggerItem>
      ))}
    </Stagger>
  );

  return (
    <Reveal className="space-y-7">
      <div className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
            <Rocket size={14} /> {t('Career Experience Hub')}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Prove you can do the work before you are hired')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            {t(
              'Curated Forage virtual job simulations, ranked from your target role, skill gaps, roadmap and completed learning. Every link opens the official provider page.'
            )}
          </p>
        </div>
        <a
          href="https://www.theforage.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
        >
          <ExternalLink size={15} />
          {t('Visit Forage')}
        </a>
      </div>

      {experienceError && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t('Experience Hub request failed')}</div>
            <div className="text-xs">{experienceError}</div>
          </div>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'In the catalogue',
            value: experienceCatalog.length,
            icon: Building2,
          },
          { label: 'In progress', value: inProgressItems.length, icon: PlayCircle },
          { label: 'Completed', value: completedItems.length, icon: CheckCircle2 },
          { label: 'Certificate links', value: certificateCount, icon: Award },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]">
              <stat.icon size={15} />
            </span>
            <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
              {stat.value}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {t(stat.label)}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 text-xs text-[var(--text-secondary)]">
        <Sparkles size={13} className="text-[var(--color-accent-strong)]" />
        {t(
          'Recommendations are deterministic: the same career graph always produces the same order and each card names the signals that fired.'
        )}
        <span className="text-[var(--text-muted)]">•</span>
        {t('Progress and certificate links are self-reported.')}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-subtle)] pb-2">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === entry.id
                ? 'bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(entry.label)}{' '}
            <span className="text-[11px] opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      {tab === 'recommended' && (
        <section className="space-y-5">
          {nextBest && (
            <div className="rounded-2xl border border-[var(--color-accent)]/25 bg-gradient-to-br from-[var(--color-accent)]/10 via-[var(--surface-main)] to-[var(--surface-main)] p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
                <Trophy size={14} /> {t('Next best step')}
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-primary)]">
                    {nextBest.experience.title}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
                    {nextBest.experience.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextBest.reasons
                      .filter((reason) => reason.code !== 'explore')
                      .slice(0, 3)
                      .map((reason) => (
                        <span
                          key={reason.code}
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
                        >
                          {experienceReasonText(reason, t)}
                        </span>
                      ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {providerForSimulationUrl(nextBest.experience.url) ? (
                      <a
                        href={nextBest.experience.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
                      >
                        <ExternalLink size={14} />
                        {t('Open on Forage')}
                      </a>
                    ) : null}
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <Clock size={13} />
                      {nextBest.experience.durationLabel ??
                        `${nextBest.experience.durationHours ?? '—'}h`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-4 py-3">
                  <div className="text-3xl font-bold text-[var(--color-accent-strong)]">
                    {nextBest.score}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
                    {t('deterministic')}
                    <br />
                    {t('match score')}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Recommended for You')} — {roleLabel}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {recommended.length} {t('simulations')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('catalog')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-accent-strong)] hover:underline"
            >
              {t('Browse the full catalogue')} <ArrowRight size={12} className="rtl:rotate-180" />
            </button>
          </div>

          {experienceCatalog.length === 0 ? (
            isExperiencesLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-56 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/60"
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Rocket}
                title={t('The experience catalogue could not be loaded.')}
                description={t(
                  'Refresh the page to try again. The rest of your career plan is unaffected.'
                )}
              />
            )
          ) : recommended.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={t('You have completed every simulation in the catalogue.')}
              description={t(
                'The catalogue grows over time. Browse the full catalogue to review what you have done.'
              )}
              actionLabel={t('Explore catalog')}
              onAction={() => setTab('catalog')}
            />
          ) : (
            renderGrid(recommended.slice(0, 12), 'recommended')
          )}

          {inProgressItems.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Continue a simulation')}
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('Finish what you started before opening another brief.')}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {inProgressItems.map((experience) => (
                  <ExperienceCard
                    key={experience.id}
                    {...cardProps(experience)}
                  />
                ))}
              </div>
            </section>
          )}

          {quickWins.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Short simulations')}
                </h2>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('Published at around two hours or less.')}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quickWins.map((match) => (
                  <ExperienceCard
                    key={match.experience.id}
                    {...cardProps(match.experience)}
                  />
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {tab === 'saved' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              {t('Saved simulations')}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('Open one when you have the time to finish it.')}
            </p>
          </div>
          {savedItems.length === 0 ? (
            <EmptyState
              compact
              icon={BookmarkCheck}
              title={t('Nothing saved yet')}
              description={t(
                'Save a simulation from your recommendations and it will wait here until you are ready to start it.'
              )}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {savedItems.map((experience) => (
                <ExperienceCard key={experience.id} {...cardProps(experience)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'in_progress' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              {t('Simulations in progress')}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)]">
              {t(
                'The provider runs the simulation. Mark it complete here when you finish it.'
              )}
            </p>
          </div>
          {inProgressItems.length === 0 ? (
            <EmptyState
              compact
              icon={PlayCircle}
              title={t('No simulation in progress')}
              description={t(
                'Start a simulation and it will appear here until you mark it complete.'
              )}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {inProgressItems.map((experience) => (
                <ExperienceCard key={experience.id} {...cardProps(experience)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'completed' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Completed simulations')}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {completedItems.length} {t('completed')} · {certificateCount}{' '}
                {t('certificate links stored as self-reported')}
              </p>
            </div>
            {completedItems.length > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                {t('Self-reported progress')}
              </span>
            )}
          </div>
          {completedItems.length === 0 ? (
            <EmptyState
              compact
              icon={CheckCircle2}
              title={t('No completed simulations yet')}
              description={t(
                'Finish a simulation and record it here as self-reported experience. Add the certificate link the provider gave you.'
              )}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {completedItems.map((experience) => (
                <ExperienceCard key={experience.id} {...cardProps(experience)} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'catalog' && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
                <Filter size={14} /> {t('Filter the catalog')}
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[var(--accent-primary)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-on-primary)]">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X size={12} /> {t('Clear filters')}
                </button>
              )}
            </div>

            <div className="relative mt-3">
              <Search
                size={14}
                className="pointer-events-none absolute start-2.5 top-2.5 text-[var(--text-muted)]"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('Search simulations, companies, skills or categories')}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Category')}
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All categories')}</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {t(category)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Difficulty')}
                <select
                  value={difficultyFilter}
                  onChange={(event) =>
                    setDifficultyFilter(event.target.value as DifficultyFilter)
                  }
                  className={filterSelectClass}
                >
                  <option value="all">{t('Any difficulty')}</option>
                  {(['introductory', 'intermediate', 'advanced'] as const).map(
                    (difficulty) => (
                      <option key={difficulty} value={difficulty}>
                        {t(EXPERIENCE_DIFFICULTY_LABELS[difficulty].en)}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Career domain')}
                <select
                  value={domainFilter}
                  onChange={(event) => setDomainFilter(event.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">{t('All domains')}</option>
                  {domains.map((domain) => (
                    <option key={domain.slug} value={domain.slug}>
                      {t(domain.label)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('Duration')}
                <select
                  value={durationFilter}
                  onChange={(event) =>
                    setDurationFilter(event.target.value as DurationFilter)
                  }
                  className={filterSelectClass}
                >
                  {DURATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.label)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                {t('My progress')}
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  className={filterSelectClass}
                >
                  <option value="all">{t('Any status')}</option>
                  <option value="not_started">{t('Not started')}</option>
                  <option value="in_progress">{t('In progress')}</option>
                  <option value="completed">{t('Completed')}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                {t('Full catalogue')}
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                {experienceCatalog.length} {t('simulations')}
                {catalogFiltered.length !== experienceCatalog.length
                  ? ` · ${catalogFiltered.length} ${t('match these filters')}`
                  : ''}
              </p>
            </div>

            {experienceCatalog.length === 0 ? (
              isExperiencesLoading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-56 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/60"
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Rocket}
                  title={t('The experience catalogue could not be loaded.')}
                  description={t(
                    'Refresh the page to try again. The rest of your career plan is unaffected.'
                  )}
                />
              )
            ) : catalogFiltered.length === 0 ? (
              <EmptyState
                icon={Search}
                title={t('No simulations match these filters.')}
                description={t('Clear a filter or search term to see the full catalogue.')}
                actionLabel={t('Clear filters')}
                onAction={clearFilters}
              />
            ) : (
              <Stagger
                key="catalog"
                gap={0.05}
                className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                {catalogFiltered.map((experience) => (
                  <StaggerItem key={experience.id} className="h-full">
                    <ExperienceCard {...cardProps(experience)} />
                  </StaggerItem>
                ))}
              </Stagger>
            )}
          </div>

          {filteredRecommended.length > 0 &&
            filteredRecommended.length < recommended.length && (
              <p className="text-[11px] text-[var(--text-muted)]">
                {filteredRecommended.length} {t('recommended simulations match these filters.')}
              </p>
            )}
        </section>
      )}

      <footer className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 text-xs text-[var(--text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <Compass size={13} className="text-[var(--text-muted)]" />
          {t(
            'Simulations are published by Forage and open on the official provider site. CareerDev4AI curates the catalogue and records your own progress; it does not verify completion or certificates.'
          )}
        </span>
        <span className="mx-2 text-[var(--text-muted)]">•</span>
        {t(
          'Simulation titles and descriptions are shown as the provider publishes them.'
        )}
      </footer>
    </Reveal>
  );
};

export default ExperienceHubView;
