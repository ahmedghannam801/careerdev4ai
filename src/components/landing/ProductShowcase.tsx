import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Eye,
  FolderGit2,
  GraduationCap,
  LayoutTemplate,
  PenLine,
  Route,
  Search,
  Sparkles,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { ROLE_DEFINITION_LIST } from '../../../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../../../shared/roadmapGenerator.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../../../shared/skillGap.ts';
import { JOB_SOURCE_LABELS, JOB_SOURCE_LABEL } from '../../../shared/jobs.ts';
import { smoothScale } from '../../lib/motion';

/**
 * ProductShowcase — the real product, shown as the product.
 *
 * The landing page described the platform's capabilities in words and showed
 * one live preview. This is the other half: the five areas a visitor most
 * wants to see, each represented by the interface the platform actually
 * renders.
 *
 * The rule the whole component is built on is that nothing on it may be
 * invented. There are no fake dashboard screenshots and no fabricated job
 * postings, because a picture of a product that does not exist is worse than
 * no picture at all. Instead:
 *
 *   * the roadmap is the platform's own planning engine, run against the
 *     platform's own role catalogue;
 *   * the skills are the platform's own gap engine, in the platform's own
 *     order;
 *   * the studio's panels are the studio's own tabs and workflow;
 *   * the assistant's panel is the assistant's own record list and the
 *     prompts it actually offers;
 *   * the jobs panel is the search the platform actually performs, over the
 *     boards it actually reads.
 *
 * Where the product needs a signed-in user to show real rows, the panel shows
 * the structure that produces those rows instead of pretending to have them.
 */

/** The five areas the showcase covers. */
type ShowcaseId = 'cv' | 'assistant' | 'roadmap' | 'learning' | 'jobs';

export const ProductShowcase: React.FC = () => {
  const { t } = useCareer();
  const reduced = useReducedMotion() ?? false;
  const [tab, setTab] = useState<ShowcaseId>('cv');

  const tabs: { id: ShowcaseId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'cv', label: t('CV Studio'), icon: PenLine },
    { id: 'assistant', label: t('AI Career Assistant'), icon: Sparkles },
    { id: 'roadmap', label: t('navRoadmap'), icon: Route },
    { id: 'learning', label: t('Learning Hub'), icon: BookOpen },
    { id: 'jobs', label: t('navJobs'), icon: Briefcase },
  ];

  const activeTab = tabs.find((entry) => entry.id === tab) ?? tabs[0];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
      {/* ------------------------------------------------ the area chooser */}
      <div className="lg:col-span-4">
        {/* On a narrow screen the chooser is a horizontal strip; on a wide one
            it is a column beside the panel. Both are the same controls. */}
        <div
          role="tablist"
          aria-label={t('Product preview')}
          aria-orientation="vertical"
          className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`showcase-tab-${id}`}
                aria-selected={active}
                aria-controls={`showcase-panel-${id}`}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-[background-color,border-color,transform] duration-200 lg:shrink ${
                  active
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]'
                    : 'border-transparent bg-transparent hover:bg-[var(--color-surface-secondary)]'
                }`}
              >
                <span
                  className={`cp-icon-tile flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    active
                      ? 'bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
                      : 'bg-[var(--color-surface-secondary)] text-[var(--text-muted)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span
                  className={`whitespace-nowrap text-xs font-semibold transition-colors ${
                    active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------- the panel */}
      <div className="lg:col-span-8">
        <motion.div
          key={tab}
          variants={smoothScale(reduced)}
          initial="hidden"
          animate="visible"
          role="tabpanel"
          id={`showcase-panel-${tab}`}
          aria-labelledby={`showcase-tab-${tab}`}
          className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--surface-main)] shadow-[var(--shadow-raised)]"
        >
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-3">
            <div aria-hidden="true" className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
            </div>
            <div className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--text-secondary)]">
              {activeTab.label}
            </div>
          </div>

          <div className="min-h-[340px] p-5">
            <ShowcasePanel id={tab} />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* The panels                                                                 */
/* -------------------------------------------------------------------------- */

/** Dispatches to the panel of the chosen area. */
const ShowcasePanel: React.FC<{ id: ShowcaseId }> = ({ id }) => {
  if (id === 'cv') return <CvStudioPanel />;
  if (id === 'assistant') return <AssistantPanel />;
  if (id === 'roadmap') return <RoadmapPanel />;
  if (id === 'learning') return <LearningPanel />;
  return <JobsPanel />;
};

/** The shell every panel shares. */
const PanelShell: React.FC<{ title: string; caption: string; children: React.ReactNode }> = ({
  title,
  caption,
  children,
}) => (
  <div>
    <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{caption}</p>
    <div className="mt-4">{children}</div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* A. CV Studio                                                               */
/* -------------------------------------------------------------------------- */

/** The studio's own workflow, and the sections inside its first step. */
const CvStudioPanel: React.FC = () => {
  const { t } = useCareer();

  const workflow = [
    t('My CV'),
    t('Import and review'),
    t('Analyze'),
    t('Improve'),
    t('Export'),
  ];

  const sections = [
    { label: t('Document Editor & Preview'), icon: PenLine },
    { label: t('Templates'), icon: LayoutTemplate },
    { label: t('My Data'), icon: FolderGit2 },
    { label: t('Version History'), icon: CheckCircle2 },
  ];

  return (
    <PanelShell
      title={t('CV Studio')}
      caption={t(
        'Parse your CV, work on it, and produce role-targeted versions without ever overwriting the original.',
      )}
    >
      {/* The five steps of the studio's own path through the work. */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {workflow.map((step, index) => (
          <li key={step} className="flex items-center gap-1.5">
            <span
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                index === 0
                  ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                  : 'bg-[var(--color-surface-secondary)] text-[var(--text-secondary)]'
              }`}
            >
              {step}
            </span>
            {index < workflow.length - 1 && (
              <span aria-hidden="true" className="h-px w-3 bg-[var(--color-border-strong)]" />
            )}
          </li>
        ))}
      </ol>

      {/* The sections of the studio's first step. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {sections.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 px-2.5 py-2"
          >
            <Icon className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
            <div className="mt-1.5 text-[10px] font-semibold leading-tight text-[var(--text-primary)]">
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* What the analysis produces. */}
      <div className="mt-4 rounded-xl border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ai-text)]">
          <Sparkles className="h-3 w-3" />
          {t('ATS Audit')}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[t('atsScore'), t('atsKeywordsMatched'), t('atsKeywordsMissing')].map((label) => (
            <span
              key={label}
              className="rounded-md bg-[var(--surface-main)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]"
            >
              {label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          {t(
            'The measurement of this document. The editor shows the advice it holds next to the section each piece of advice is about, so the two cannot drift apart: they come from the same report.',
          )}
        </p>
      </div>
    </PanelShell>
  );
};

/* -------------------------------------------------------------------------- */
/* B. AI Career Assistant                                                     */
/* -------------------------------------------------------------------------- */

/** The assistant, its prompts, and the records it is allowed to read. */
const AssistantPanel: React.FC = () => {
  const { t } = useCareer();

  const prompts = [t('copilotPrompt1'), t('copilotPrompt3'), t('copilotPrompt4')];

  const records = [
    { label: t('Target role'), icon: Eye },
    { label: t('Skills recorded'), icon: Award },
    { label: t('Roadmap steps'), icon: Route },
    { label: t('Learning items'), icon: BookOpen },
    { label: t('Projects'), icon: FolderGit2 },
    { label: t('Evidence entries'), icon: Award },
    { label: t('Applications'), icon: Briefcase },
    { label: t('Work experience'), icon: GraduationCap },
  ];

  return (
    <PanelShell
      title={t('AI Career Assistant')}
      caption={t(
        'An assistant that answers from your verified records and shows you the evidence behind each answer.',
      )}
    >
      {/* The prompts the product itself offers. */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Sparkles className="h-3 w-3" />
          {t('Quick Actions:')}
        </div>
        <div className="mt-2 space-y-1.5">
          {prompts.map((prompt) => (
            <div
              key={prompt}
              className="flex items-start gap-2 rounded-lg bg-[var(--surface-main)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--text-secondary)]"
            >
              <span aria-hidden="true" className="mt-px text-[var(--color-primary-text)]">
                →
              </span>
              <span>{prompt}</span>
            </div>
          ))}
        </div>
      </div>

      {/* The records the assistant reads — the reason its answer can be checked. */}
      <div className="mt-4">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Eye className="h-3 w-3" />
          {t('What the assistant can see')}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {records.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--surface-main)] px-2 py-1.5"
            >
              <Icon className="h-3 w-3 shrink-0 text-[var(--color-ai-text)]" />
              <span className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
                {label}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
          {t(
            'The assistant reads these verified records when it answers. It cannot see anything you have not recorded here, and it is told to say so when a record is missing.',
          )}
        </p>
      </div>
    </PanelShell>
  );
};

/* -------------------------------------------------------------------------- */
/* C. Career Roadmap                                                          */
/* -------------------------------------------------------------------------- */

/** The roadmap, built live by the platform's own planning engine. */
const RoadmapPanel: React.FC = () => {
  const { t } = useCareer();

  const role = useMemo(
    () =>
      ROLE_DEFINITION_LIST.find((candidate) => candidate.id === 'data-analyst') ??
      ROLE_DEFINITION_LIST[0],
    []
  );
  const plan = useMemo(() => generateRoadmapPlan({ role, userSkills: [] }), [role]);

  return (
    <PanelShell
      title={t('navRoadmap')}
      caption={t(
        'A phased plan of real tasks, with prerequisites, hour estimates and the reason each task is in your plan.',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {role.title}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          {plan.summary.totalTasks} {t('Tasks')} · {plan.summary.estimatedHours}h
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {plan.phases.slice(0, 3).map((phase, phaseIndex) => (
          <div
            key={phase.title}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 p-3"
          >
            <div className="flex items-start gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[9px] font-bold text-[var(--color-on-primary)]">
                {phaseIndex + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-[var(--text-primary)]">{phase.title}</div>
                <p className="mt-0.5 text-[10px] leading-snug text-[var(--text-secondary)]">
                  {phase.goal}
                </p>
              </div>
            </div>
            <ul className="mt-2 space-y-1 ps-7">
              {phase.milestones
                .flatMap((milestone) => milestone.tasks)
                .slice(0, 2)
                .map((task) => (
                  <li
                    key={task.title}
                    className="flex items-start gap-1.5 text-[10px] leading-snug text-[var(--text-secondary)]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--color-border-strong)]"
                    />
                    <span className="min-w-0 flex-1">{task.title}</span>
                    <span className="shrink-0 font-mono text-[9px] text-[var(--text-muted)]">
                      {task.estimatedHours}h
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </PanelShell>
  );
};

/* -------------------------------------------------------------------------- */
/* D. Learning Hub                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The learning hub, shown as the machine that matches resources to gaps.
 *
 * The course rows themselves need a signed-in candidate, because the
 * catalogue is fetched per account. So the panel shows the part that is
 * always true: the tabs the hub offers, the preferences it ranks by, and the
 * gaps the ranking is produced from.
 */
const LearningPanel: React.FC = () => {
  const { t } = useCareer();

  const role = useMemo(
    () =>
      ROLE_DEFINITION_LIST.find((candidate) => candidate.id === 'data-analyst') ??
      ROLE_DEFINITION_LIST[0],
    []
  );
  const gaps = useMemo(() => computeSkillGaps(toRoleSkillRequirements(role), []), [role]);

  const tabs = [
    t('Recommended'),
    t('Saved'),
    t('In progress'),
    t('Completed'),
    t('Explore catalog'),
  ];

  return (
    <PanelShell
      title={t('Learning Hub')}
      caption={t(
        'A curated catalogue filtered to the gaps your target role actually has, with the source shown for each one.',
      )}
    >
      {/* The tabs the hub really offers. */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((label, index) => (
          <span
            key={label}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
              index === 0
                ? 'bg-[var(--color-primary)] text-[var(--color-on-primary)]'
                : 'bg-[var(--color-surface-secondary)] text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </span>
        ))}
      </div>

      {/* The preferences the ranking is produced from. */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: t('Hours/week'), value: '5' },
          { label: t('Budget'), value: t('Free only') },
          { label: t('Format'), value: t('Any format') },
        ].map((preference) => (
          <div
            key={preference.label}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 px-2.5 py-2"
          >
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              {preference.label}
            </div>
            <div className="mt-1 text-[11px] font-semibold text-[var(--text-primary)]">
              {preference.value}
            </div>
          </div>
        ))}
      </div>

      {/* The gaps the ranking comes from. */}
      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('Recommended for You')} — {role.title}
        </div>
        <ul className="mt-2 space-y-1.5">
          {gaps.slice(0, 4).map((gap) => (
            <li
              key={gap.name}
              className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-secondary)]/50 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-[var(--text-secondary)]">
                {gap.name}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-ai-surface)] px-2 py-0.5 text-[9px] font-semibold text-[var(--color-ai-text)]">
                {t('Recommended')}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </PanelShell>
  );
};

/* -------------------------------------------------------------------------- */
/* E. Live Jobs & Internships                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The live jobs board, shown as the search that performs it.
 *
 * The rows themselves belong to whatever the boards are publishing at that
 * moment, so a static panel that named them would be a fabrication. What is
 * shown instead is the search — the boards it reads, the filters it offers,
 * and the honest attribution of where the vacancies come from.
 */
const JobsPanel: React.FC = () => {
  const { t } = useCareer();

  const sources = [
    JOB_SOURCE_LABELS.google_jobs,
    JOB_SOURCE_LABELS.indeed,
    JOB_SOURCE_LABELS.ziprecruiter,
    JOB_SOURCE_LABELS.handshake,
    JOB_SOURCE_LABELS.company_careers,
  ];

  const filters = [
    t('Cairo, Egypt'),
    t('Remote'),
    t('Full-time'),
    t('Internship'),
    t('Junior'),
  ];

  return (
    <PanelShell
      title={t('navJobs')}
      caption={t(
        'Live vacancies from the boards the platform reads, with internships included, filtered by the kind of opening you are aiming at.',
      )}
    >
      {/* The search itself. */}
      <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--surface-secondary)]/60 px-3 py-2.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 truncate text-[11px] text-[var(--text-muted)]">
          {t('Search jobs')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-primary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-on-primary)]">
          {t('Search jobs')}
        </span>
      </div>

      {/* The filters the search offers. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {filters.map((filter, index) => (
          <span
            key={filter}
            className={`rounded-lg px-2.5 py-1 text-[10px] font-medium ${
              index === 0
                ? 'bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
                : 'bg-[var(--color-surface-secondary)] text-[var(--text-secondary)]'
            }`}
          >
            {filter}
          </span>
        ))}
      </div>

      {/* The boards that are read, and what they are. */}
      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          {t('navJobDiscovery')}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {sources.map((source) => (
            <div
              key={source}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--surface-main)] px-2 py-1.5"
            >
              <Briefcase className="h-3 w-3 shrink-0 text-[var(--color-primary-text)]" />
              <span className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
                {source}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[10px] leading-relaxed text-[var(--text-muted)]">
          {JOB_SOURCE_LABEL}
        </p>
      </div>
    </PanelShell>
  );
};

export default ProductShowcase;
