import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Clock,
  Map,
  Route,
  Sparkles,
  Target,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { ROLE_DEFINITION_LIST } from '../../../shared/careerRoles.ts';
import { generateRoadmapPlan } from '../../../shared/roadmapGenerator.ts';
import { computeSkillGaps, toRoleSkillRequirements } from '../../../shared/skillGap.ts';
import { getCareerDomainLabel } from '../../../shared/careerDomains.ts';

/**
 * The landing page's product preview.
 *
 * This is not a screenshot and not a mock-up. It runs the platform's own
 * roadmap engine — `generateRoadmapPlan` from `shared/roadmapGenerator.ts` —
 * against the platform's own role catalogue, for a visitor who has not
 * signed up and has no skills recorded yet.
 *
 * That matters for two reasons:
 *
 *  1. What the visitor sees is what the platform will actually build for
 *     them. The phases, the tasks, the hour estimates and the readiness
 *     figure are computed by the same code the signed-in product uses, so
 *     the preview cannot drift away from the product.
 *  2. Nothing is invented. Every skill name, task title and hour figure
 *     comes from the same curated catalogue the signed-in experience is
 *     built on.
 *
 * The visitor chooses a role and watches the engine re-plan. The engine
 * takes well under a millisecond for a catalogue role, so the interaction
 * is immediate.
 */

/**
 * The roles offered in the preview.
 *
 * One from each of a spread of domains, so the preview itself makes the
 * point that the platform is not a developer tool: an HR Specialist and a
 * Data Analyst get visibly different plans.
 */
const PREVIEW_ROLE_IDS = [
  'data-analyst',
  'hr-specialist',
  'frontend-engineer',
  'digital-marketing-specialist',
  'financial-analyst',
] as const;

type PreviewTab = 'roadmap' | 'gaps' | 'action';

export const ProductPreview: React.FC = () => {
  const { t } = useCareer();
  const [roleId, setRoleId] = useState<string>(PREVIEW_ROLE_IDS[0]);
  const [tab, setTab] = useState<PreviewTab>('roadmap');

  // The tab labels are translated at the point of definition, as literal
  // translation calls. A call over a variable would render correctly but
  // would be invisible to the localisation audit, which only reads literal
  // calls — so a gap could never be reported.
  const TABS: { id: PreviewTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'roadmap', label: t('Roadmap'), icon: Route },
    { id: 'gaps', label: t('Skill gaps'), icon: BarChart3 },
    { id: 'action', label: t('Next action'), icon: Sparkles },
  ];

  const previewRoles = useMemo(
    () =>
      PREVIEW_ROLE_IDS.map((id) => ROLE_DEFINITION_LIST.find((role) => role.id === id)).filter(
        (role): role is (typeof ROLE_DEFINITION_LIST)[number] => Boolean(role)
      ),
    []
  );

  const role = useMemo(
    () => ROLE_DEFINITION_LIST.find((candidate) => candidate.id === roleId) ?? previewRoles[0],
    [roleId, previewRoles]
  );

  // The real engine, run against the real catalogue, for a user with no
  // recorded skills — which is exactly the state a new visitor is in.
  const plan = useMemo(
    () => (role ? generateRoadmapPlan({ role, userSkills: [] }) : null),
    [role]
  );

  const gaps = useMemo(
    () => (role ? computeSkillGaps(toRoleSkillRequirements(role), []) : []),
    [role]
  );

  if (!role || !plan) return null;

  const domainLabel = getCareerDomainLabel(role.domainId);
  const firstTask = plan.phases[0]?.milestones[0]?.tasks[0] ?? null;
  const criticalGaps = gaps.filter((gap) => gap.priority === 'critical');

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-raised)]">
      {/* A window chrome so the preview reads as the product, not as a card. */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-4 py-3">
        <div aria-hidden="true" className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-border-strong)]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--text-muted)]">
          <Map className="h-3 w-3 shrink-0" />
          <span className="truncate font-mono">careerdev4ai.pages.dev/{domainLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}</span>
        </div>
        <span className="hidden shrink-0 rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ai-text)] sm:inline">
          {t('Live preview')}
        </span>
      </div>

      {/* Role switcher — the one control the visitor is invited to use. */}
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Target className="h-3 w-3" />
          <span>{t('Pick a role to preview')}</span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t('Pick a role to preview')}>
          {previewRoles.map((candidate) => {
            const active = candidate.id === role.id;
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => setRoleId(candidate.id)}
                aria-pressed={active}
                className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? 'border-[var(--color-primary)] bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--text-primary)]'
                }`}
              >
                {candidate.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* The engine's own numbers for the selected role. */}
      <div className="grid grid-cols-2 divide-x divide-[var(--color-border)] border-b border-[var(--color-border)] rtl:divide-x-reverse sm:grid-cols-4">
        <Metric label={t('Phases')} value={String(plan.phases.length)} />
        <Metric label={t('Tasks')} value={String(plan.summary.totalTasks)} />
        <Metric label={t('Hours')} value={`${plan.summary.estimatedHours}h`} />
        <Metric label={t('Open gaps')} value={String(plan.summary.openGaps)} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)] px-3 pt-2" role="tablist" aria-label={t('Product preview')}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`preview-tab-${id}`}
              aria-selected={active}
              aria-controls={`preview-panel-${id}`}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? 'border-[var(--color-primary)] text-[var(--color-primary-text)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Panels */}
      <div className="min-h-[280px] bg-[var(--color-surface)] p-4">
        {tab === 'roadmap' && (
          <div role="tabpanel" id="preview-panel-roadmap" aria-labelledby="preview-tab-roadmap">
            <div className="space-y-3">
              {plan.phases.slice(0, 3).map((phase, phaseIndex) => (
                <div key={phase.title} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] font-bold text-[var(--color-on-primary)]">
                      {phaseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)]">{phase.title}</div>
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-secondary)]">{phase.goal}</p>
                    </div>
                  </div>
                  <ul className="mt-2.5 space-y-1 ps-8">
                    {phase.milestones.slice(0, 2).flatMap((milestone) =>
                      milestone.tasks.slice(0, 2).map((task) => (
                        <li key={task.title} className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--text-secondary)]">
                          <Circle className="mt-1 h-1.5 w-1.5 shrink-0 fill-[var(--text-muted)] text-[var(--text-muted)]" />
                          <span className="min-w-0 flex-1">{task.title}</span>
                          <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">{task.estimatedHours}h</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'gaps' && (
          <div role="tabpanel" id="preview-panel-gaps" aria-labelledby="preview-tab-gaps">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
                {t('Requirements this role opens first, compared against no recorded skills yet.')}
              </p>
              <span className="shrink-0 rounded-full bg-[var(--color-danger)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--color-danger)]">
                {criticalGaps.length} {t('critical')}
              </span>
            </div>
            <ul className="space-y-2">
              {gaps.slice(0, 6).map((gap) => (
                <li key={gap.name} className="flex items-center gap-2.5">
                  <span className="w-28 shrink-0 truncate text-[11px] font-semibold text-[var(--text-primary)]">
                    {gap.name}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-secondary)]">
                    <span
                      className={`block h-full rounded-full ${
                        gap.priority === 'critical'
                          ? 'bg-[var(--color-danger)]'
                          : gap.priority === 'high'
                            ? 'bg-[var(--color-warning)]'
                            : 'bg-[var(--color-success-strong)]'
                      }`}
                      style={{ width: `${Math.round((gap.currentLevel / Math.max(gap.requiredLevel, 1)) * 100)}%` }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-end font-mono text-[10px] text-[var(--text-muted)]">
                    {gap.currentLevel}/{gap.requiredLevel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === 'action' && (
          <div role="tabpanel" id="preview-panel-action" aria-labelledby="preview-tab-action">
            {firstTask ? (
              <div className="rounded-xl border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] p-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-ai-text)]">
                  <Sparkles className="h-3 w-3" />
                  <span>{t('Next best action')}</span>
                </div>
                <div className="mt-2 text-sm font-bold text-[var(--text-primary)]">{firstTask.title}</div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">{firstTask.rationale}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {firstTask.estimatedHours}h
                  </span>
                  <span className="inline-flex items-center gap-1 capitalize">
                    <CheckCircle2 className="h-3 w-3" />
                    {firstTask.difficulty}
                  </span>
                  {firstTask.primarySkillName && (
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {firstTask.primarySkillName}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-[var(--text-secondary)]">{t('This role needs no closing tasks yet.')}</p>
            )}

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-secondary)]/50 p-3">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-warning)]" />
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'The same reason is attached to every suggestion: it names the record that produced it, so you can check the recommendation instead of trusting it.',
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer of the preview: the honest caption. */}
      <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 px-4 py-2.5 text-[10px] leading-snug text-[var(--text-muted)]">
        <ArrowRight className="h-3 w-3 shrink-0 rtl:rotate-180" />
        <span>
          {t('Generated live by the CareerDev4AI planning engine from the role catalogue — not a mock-up.')}
        </span>
      </div>
    </div>
  );
};

/** A single number in the preview's metric strip. */
const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="px-4 py-3">
    <div className="font-mono text-lg font-bold leading-none text-[var(--text-primary)]">{value}</div>
    <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
  </div>
);

export default ProductPreview;
