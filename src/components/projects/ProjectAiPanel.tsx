/**
 * The AI workspace of the projects section.
 *
 * It does two things, and both of them are grounded in the candidate's own
 * record rather than in a list of projects everyone is told to build.
 *
 * The recommendation side reads the candidate's target role, their rated
 * skills, their open gaps, their roadmap, their learning history and the
 * projects they already have, and pairs that with the portfolio work the role
 * catalogue names for their level. Each recommendation comes with a complete
 * plan — the steps, the milestones, the deliverables, the resources that
 * genuinely exist and the line to write on a CV.
 *
 * The health side reads the projects the candidate already has and reports
 * what is wrong with them: no description, nothing to show at the end, no
 * technologies recorded, a scope that cannot be finished, and a project that
 * demonstrates none of the target role's skills.
 *
 * The model improves the wording of both. It never decides what a
 * recommendation is and never decides that a problem exists, and a resource
 * with a link is only ever one the platform's own catalogue holds.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Wrench,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useAIProcessing } from '../../lib/useAIProcessing';
import { aiButtonLabel } from '../../lib/aiTokenCosts';
import {
  fetchProjectHealth,
  fetchProjectRecommendations,
} from '../../lib/projectRecommendationApi';
import type {
  ProjectHealthReport,
  ProjectPlan,
} from '../../../shared/projectRecommendation';

/** The minimum a job description paste must contain before it is worth reading. */
const MIN_DESCRIPTION_LENGTH = 20;

/** The severity order the issues are shown in. */
const SEVERITY_STYLES: Record<string, string> = {
  high: 'text-[var(--color-warning)]',
  medium: 'text-[var(--color-primary-text)]',
  low: 'text-[var(--text-muted)]',
};

/** A planning estimate, labelled as one: it is derived from the plan's own scope. */
function estimatePlanHours(plan: ProjectPlan): number {
  const perStep =
    plan.difficulty === 'Advanced' ? 6 : plan.difficulty === 'Intermediate' ? 4 : 3;
  return Math.max(perStep, plan.steps.length * perStep);
}

function planInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export const ProjectAiPanel: React.FC = () => {
  const { t, aiPreferences, projects, addProject, targetRole } = useCareer();
  // The AI response language comes from the explicit selector, never from the
  // interface language.
  const language = aiPreferences.preferredLanguage;

  const [jobDescription, setJobDescription] = useState('');
  const [plans, setPlans] = useState<ProjectPlan[] | null>(null);
  const [reports, setReports] = useState<ProjectHealthReport[] | null>(null);
  const [activeOperation, setActiveOperation] = useState<'recommend' | 'analyze' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiOutcome, setAiOutcome] = useState<{ aiUsed: boolean; reason: string | null } | null>(null);
  const { run: runAIProcessing, isRunning, modal: aiProcessingModal } = useAIProcessing();
  const isRecommending = isRunning && activeOperation === 'recommend';
  const isAnalyzing = isRunning && activeOperation === 'analyze';
  const [createdTitles, setCreatedTitles] = useState<string[]>([]);
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);

  const handleRecommend = async () => {
    if (isRunning) return;
    setError(null);
    setAiOutcome(null);
    setActiveOperation('recommend');
    await runAIProcessing({
      title: t('AI Project Advisor'),
      stage: t('Finding projects…'),
      failureMessage: t('Projects could not be recommended right now.'),
      run: (signal) => fetchProjectRecommendations(
        { language, jobDescription: jobDescription.trim() || undefined },
        { signal }
      ),
      onSuccess: (result) => {
        setPlans(result.plans);
        setAiOutcome({ aiUsed: result.aiUsed, reason: result.aiFallbackReason });
      },
    });
    setActiveOperation(null);
  };

  const handleAnalyze = async () => {
    if (isRunning) return;
    setError(null);
    setAiOutcome(null);
    setActiveOperation('analyze');
    await runAIProcessing({
      title: t('AI Project Advisor'),
      stage: t('Checking your projects…'),
      failureMessage: t('Your projects could not be analysed right now.'),
      run: (signal) => fetchProjectHealth({ language }, { signal }),
      onSuccess: (result) => {
        setReports(result.reports);
        setAiOutcome({ aiUsed: result.aiUsed, reason: result.aiFallbackReason });
      },
    });
    setActiveOperation(null);
  };

  /**
   * Creates the recommended project in the candidate's own workspace.
   *
   * The plan is written into the project record as it stands: the goal, the
   * steps as tasks, the deliverables and the technologies. Nothing else is
   * written, and the candidate can edit every field afterwards.
   */
  const handleCreate = async (plan: ProjectPlan) => {
    if (creatingTitle) return;
    // Starting the same recommendation twice must not create a second record.
    // The session flag below covers repeated clicks; this covers a reload,
    // where the advisor can offer the same plan again.
    const alreadyExists = projects.some(
      (project) => project.title.trim().toLowerCase() === plan.title.trim().toLowerCase()
    );
    if (alreadyExists) {
      setCreatedTitles((previous) =>
        previous.includes(plan.title) ? previous : [...previous, plan.title]
      );
      return;
    }
    setError(null);
    setCreatingTitle(plan.title);
    try {
      await addProject({
        title: plan.title,
        goal: plan.expectedOutcome,
        description: plan.whyItFits,
        difficulty: plan.difficulty,
        skills: [...plan.skillsToDevelop, ...plan.tools],
        tasks: plan.steps,
        deliverables: plan.deliverables,
        status: 'planned',
      });
      setCreatedTitles((previous) => [...previous, plan.title]);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : t('The project could not be saved. Please try again.')
      );
    } finally {
      setCreatingTitle(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* The controls. */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--color-primary-text)]" />
            {t('AI Project Advisor')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {t(
              'Recommendations are built from your target role, your skills, the gaps you still have, your roadmap, what you have already been studying and the projects you already have.'
            )}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--text-secondary)]">
            {t('Job Description (optional)')}
          </label>
          <textarea
            value={jobDescription}
            onChange={(event) => setJobDescription(event.target.value)}
            rows={4}
            placeholder={t(
              'Paste the job description you are aiming at, and the recommendations will be aimed at it…'
            )}
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <p className="text-[11px] text-[var(--text-muted)]">
            {jobDescription.trim().length >= MIN_DESCRIPTION_LENGTH
              ? t('This job description will be read and used for the recommendations.')
              : t('Leave this empty to be recommended against your target role alone.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleRecommend}
            disabled={isRecommending || isAnalyzing}
            className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isRecommending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Lightbulb className="w-3.5 h-3.5" />
            )}
            <span>
              {isRecommending
                ? t('Finding projects…')
                : aiButtonLabel(t('Recommend projects for me'), 'project_analysis', t)}
            </span>
          </button>

          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing || isRecommending || projects.length === 0}
            className="px-3.5 py-2 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--color-primary-text)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wrench className="w-3.5 h-3.5" />
            )}
            <span>
              {isAnalyzing
                ? t('Checking your projects…')
                : aiButtonLabel(t('Check my existing projects'), 'project_analysis', t)}
            </span>
          </button>

          {projects.length === 0 && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {t('Add a project first and it can be checked.')}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed flex-1">{error}</p>
        </div>
      )}

      {/* The deterministic answer is shown as it is: the plans are never
          discarded because the model was unavailable, and the reason for that
          is never hidden either. */}
      {aiOutcome && !aiOutcome.aiUsed && (
        <div
          role="status"
          className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {t('AI explanations were not available; the deterministic reasons are shown.')}
          </p>
          {aiOutcome.reason && (
            <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
              {aiOutcome.reason}
            </p>
          )}
        </div>
      )}

      {/* The recommendations. */}
      {plans && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Recommended Projects For You')}
          </h3>

          {plans.length === 0 && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-center">
              <p className="text-xs text-[var(--text-secondary)]">
                {t(
                  'No project could be recommended from your records yet. Set your target role and rate your skills to get recommendations.'
                )}
              </p>
            </div>
          )}

          {plans.map((plan) => (
            <div
              key={plan.id}
              className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-xs"
            >
              {/* A designed cover, not a fabricated screenshot: the project's
                  own initials over the product palette, with its track. */}
              <div className="relative flex h-28 items-center justify-between gap-4 bg-gradient-to-br from-[var(--accent-primary)]/25 via-[var(--surface-secondary)] to-[var(--accent-secondary)]/20 px-6">
                <div
                  aria-hidden
                  className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10"
                />
                <div className="relative">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-primary-text)]">
                    {t('Recommended Project')}
                  </div>
                  <div className="mt-1 text-2xl font-black tracking-tight text-[var(--color-primary-text)]">
                    {planInitials(plan.title)}
                  </div>
                </div>
                <div className="relative text-end">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('Track')}
                  </div>
                  <div className="max-w-[12rem] truncate text-xs font-bold text-[var(--text-primary)]">
                    {targetRole?.title || t('Your target role')}
                  </div>
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                    <Clock className="h-3 w-3" />~
                    {estimatePlanHours(plan)}h {t('estimated')}
                  </div>
                </div>
              </div>

              <div className="space-y-5 p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <h4 className="text-base font-bold text-[var(--text-primary)]">{plan.title}</h4>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                      {plan.difficulty}
                    </span>
                    {plan.gapsAddressed.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-[var(--accent-surface)] text-[var(--color-primary-text)]">
                        {t('Closes')} {plan.gapsAddressed.join(', ')}
                      </span>
                    )}
                    {plan.aiGenerated && (
                      <span className="px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--color-primary-text)]">
                        {t('Written by AI')}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => handleCreate(plan)}
                  disabled={creatingTitle !== null || createdTitles.includes(plan.title)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-[11px] font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {creatingTitle === plan.title ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : createdTitles.includes(plan.title) ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {createdTitles.includes(plan.title)
                      ? t('Added to your projects')
                      : t('Start this project')}
                  </span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Why This Fits You')}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {plan.whyItFits}
                </p>
              </div>

              {plan.skillsToDevelop.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Skills To Develop')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.skillsToDevelop.map((skill, index) => (
                      <span
                        key={`${skill}-${index}`}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {plan.tools.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Tools & Technologies')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.tools.map((tool, index) => (
                      <span
                        key={`${tool}-${index}`}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Expected Outcome')}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {plan.expectedOutcome}
                </p>
              </div>

              {plan.steps.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Step-By-Step Implementation')}
                  </div>
                  <ol className="space-y-1.5">
                    {plan.steps.map((step, index) => (
                      <li key={`${step}-${index}`} className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        <span className="font-semibold text-[var(--color-primary-text)]">
                          {index + 1}.
                        </span>{' '}
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {plan.milestones.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Milestones')}
                  </div>
                  <ul className="space-y-1.5">
                    {plan.milestones.map((milestone, index) => (
                      <li
                        key={`${milestone.title}-${index}`}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        <span className="font-semibold text-[var(--text-primary)]">
                          {milestone.title}
                        </span>{' '}
                        — {milestone.outcome}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.deliverables.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Deliverables')}
                  </div>
                  <ul className="space-y-1">
                    {plan.deliverables.map((deliverable, index) => (
                      <li
                        key={`${deliverable}-${index}`}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        • {deliverable}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.resources.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Resources')}
                  </div>
                  <ul className="space-y-1.5">
                    {plan.resources.map((resource, index) => (
                      <li
                        key={`${resource.label}-${index}`}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-[var(--color-primary-text)] hover:underline inline-flex items-center gap-1"
                          >
                            {resource.label}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-medium">{resource.label}</span>
                        )}
                        {resource.note && (
                          <span className="text-[var(--text-muted)]"> — {resource.note}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {plan.cvPresentation && (
                <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase flex items-center gap-1.5">
                    <Target className="h-3 w-3" />
                    {t('How To Present It On Your CV')}
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {plan.cvPresentation}
                  </p>
                </div>
              )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The health of the projects the candidate already has. */}
      {reports && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Your Existing Projects')}
          </h3>

          {reports.length === 0 && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-center">
              <p className="text-xs text-[var(--text-secondary)]">
                {t('There are no projects to check yet.')}
              </p>
            </div>
          )}

          {reports.map((report) => (
            <div
              key={report.projectId}
              className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h4 className="text-base font-bold text-[var(--text-primary)]">
                  {report.projectTitle}
                </h4>
                <div className="text-end">
                  <div className="text-2xl font-extrabold font-mono tabular-nums text-[var(--color-primary-text)]">
                    {report.score}
                    <span className="text-sm font-normal text-[var(--text-muted)]"> / 100</span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {t('Strength as evidence')}
                  </div>
                </div>
              </div>

              {report.issues.length === 0 ? (
                <div className="p-3 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success)]/10 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[var(--color-success-strong)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    {t(
                      'Nothing is missing from this project. It has a description, deliverables, technologies and a place in your target role.'
                    )}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {report.issues.map((issue, index) => (
                    <li
                      key={`${issue.kind}-${index}`}
                      className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-1.5"
                    >
                      <div
                        className={`text-xs font-bold flex items-center gap-1.5 ${SEVERITY_STYLES[issue.severity] ?? SEVERITY_STYLES.medium}`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {issue.title}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {issue.detail}
                      </p>
                      <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                        <span className="font-semibold">{t('Do this:')} </span>
                        {issue.suggestion}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {report.cvPresentation && (
                <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase flex items-center gap-1.5">
                    <Target className="h-3 w-3" />
                    {t('How To Present It On Your CV')}
                  </div>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">
                    {report.cvPresentation}
                  </p>
                </div>
              )}

              {report.missingRoleSkills.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t('Role Skills This Project Does Not Yet Show')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {report.missingRoleSkills.map((skill, index) => (
                      <span
                        key={`${skill}-${index}`}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-warning)] font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {aiProcessingModal}
    </div>
  );
};
