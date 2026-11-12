import React, { useMemo, useState } from 'react';
import { Plus, CheckCircle2, X, Target } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { SKILL_CATEGORIES } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { SkillCategory, SkillSource, SkillEvidenceSource } from '../../types/career';
import { Reveal } from '../motion/Motion';
import {
  computeSkillGaps,
  explainGap,
  normalizeSkillName,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../../../shared/skillGap';
import { explainGapTranslated } from '../../lib/gapExplanation';
import { WhyWeRecommend } from '../ui/WhyWeRecommend';
import { useToast } from '../toast/ToastProvider';
import { isSkillSectionHeader } from '../../../shared/cvDedupe';

/** The colour used for each gap priority. */
const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600',
  low: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  sufficient: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
};

/**
 * The badge shown beside a skill for each kind of evidence behind it.
 *
 * The labels name WHERE the level came from, because "Python: 4/5" says
 * nothing about whether the candidate rated themselves, was measured, or
 * built something that proves it.
 */
const EVIDENCE_BADGE_LABELS: Record<SkillEvidenceSource, string> = {
  self_reported: 'Self-reported',
  diagnostic_assessment: 'Diagnostic Assessment',
  course_completed: 'Course Completed',
  verified_project: 'Verified Project',
  certificate: 'Certificate',
  work_experience: 'Work Experience',
};

export const SkillsCenterView: React.FC = () => {
  const { skills, skillEvidence, updateSkillLevel, addCustomSkill, removeSkill, targetRole, t} = useCareer();
  const { showToast } = useToast();
  const [skillError, setSkillError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useRouteParam<string>('category', SKILL_CATEGORIES, 'all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New skill form state
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<SkillCategory>('technical');
  const [newSkillLevel, setNewSkillLevel] = useState(3);
  const [newSkillTarget, setNewSkillTarget] = useState(4);
  const [newSkillSource] = useState<SkillSource>('self_reported');

  const categories: SkillCategory[] = [
    'technical',
    'analytical',
    'business',
    'communication',
    'leadership',
    'tools',
    'domain',
    'soft_skills'
  ];

  const filteredSkills = skills.filter(s =>
    selectedCategory === 'all' ? true : s.category === selectedCategory
  );

  /**
   * The gap analysis, computed with the same engine the server and the AI
   * context use, so a skill's priority never disagrees with the roadmap.
   */
  const gapAnalysis = useMemo(() => {
    if (!targetRole) return null;
    const requirements = toRoleSkillRequirements(targetRole);
    const gaps = computeSkillGaps(
      requirements,
      skills.map((skill) => ({ name: skill.name, level: skill.currentLevel })),
    );
    const byName = new Map(gaps.map((gap) => [normalizeSkillName(gap.name), gap]));
    return { byName, summary: summarizeSkillGaps(gaps, requirements) };
  }, [targetRole, skills]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newSkillName.trim();
    if (!cleaned) return;
    if (isSkillSectionHeader(cleaned)) {
      const msg = t('Category headings like SOFT SKILLS or TECHNICAL SKILLS cannot be added as individual skills. Enter a specific skill name instead.');
      setSkillError(msg);
      showToast({ variant: 'error', title: t('Invalid skill name'), description: msg });
      return;
    }

    setSkillError(null);
    try {
      await addCustomSkill({
        name: cleaned,
        category: newSkillCategory,
        currentLevel: newSkillLevel,
        targetLevel: newSkillTarget,
        source: newSkillSource,
        evidenceIds: []
      });
      setNewSkillName('');
      setShowAddModal(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('Failed to save skill');
      setSkillError(msg);
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('COMPETENCY TAXONOMY')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('Skills Center & Gap Analytics')}
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('Add Custom Skill')}</span>
        </button>
      </div>

      {/* Readiness summary: how far the user is from the role's bar. */}
      {gapAnalysis && (
        <div
          data-guide="skills-gaps"
          className="grid grid-cols-2 md:grid-cols-5 gap-3"
        >
          <div className="p-4 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <Target className="h-3 w-3" />
              {t('Role readiness')}
            </div>
            <div className="mt-1 text-2xl font-bold font-mono text-[var(--color-primary-text)]">
              {gapAnalysis.summary.readinessPct}%
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">
              {t('of the role requirement set')}
            </div>
          </div>
          {(
            [
              ['critical', 'Critical'],
              ['high', 'High'],
              ['medium', 'Medium'],
              ['low', 'Low'],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="p-4 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {t(label)}
              </div>
              <div className="mt-1 text-2xl font-bold font-mono text-[var(--text-primary)]">
                {gapAnalysis.summary[key]}
              </div>
              <div className="text-[10px] text-[var(--text-muted)]">
                {t('skills to work on')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs (Functional segmented buttons per Zero-Pill rule) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
              : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('All Skills')} ({skills.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              selectedCategory === cat
                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(cat.replace('_', ' '))}
          </button>
        ))}
      </div>

      {/* Skills Table / Cards */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-3">
          <div className="w-1/3">{t('Skill & Source')}</div>
          <div className="w-1/3 text-center">
            {targetRole
              ? `${t('Current Level vs Target for')} ${targetRole.title}`
              : t('Current Level vs General Target')}
          </div>
          <div className="w-1/3 text-end">{t('Remaining Gap')}</div>
        </div>

        <div className="space-y-4">
          {filteredSkills.map((skill) => {
            const hasGap = skill.gap > 0;
            const gapEntry = gapAnalysis?.byName.get(normalizeSkillName(skill.name));
            const priority = gapEntry?.priority;
            const evidenceRec = skillEvidence[skill.name.toLowerCase()];

            return (
              <div 
                key={skill.id}
                className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Skill Name & Metadata (Clean unboxed separators) */}
                <div className="md:w-1/3 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-[var(--text-primary)]">{skill.name}</span>
                    {priority && priority !== 'sufficient' && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          PRIORITY_CLASS[priority] ?? PRIORITY_CLASS.low
                        }`}
                      >
                        {t(priority)}
                      </span>
                    )}
                    {skill.evidenceIds.length > 0 && (
                      <span className="text-[10px] text-[var(--color-success-strong)] font-medium">· {t('Verified')}</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <span className="capitalize">{t(skill.category.replace('_', ' '))}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{t(skill.source.replace('_', ' '))}</span>
                  </div>
                  {/* WHY THIS SKILL IS ON THE LIST.
                      The reason comes from the same gap engine that ranked it,
                      so the explanation and the priority can never disagree. */}
                  <WhyWeRecommend
                    reason={gapEntry ? explainGapTranslated(explainGap(gapEntry), t) : null}
                    title={t('Why this skill is prioritised')}
                    compact
                    className="mt-1.5"
                  />
                </div>

                {/* Interactive Level Slider */}
                <div data-tour="skill-rate-widget" className="md:w-1/3 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <span className="text-[var(--text-primary)] font-semibold">
                      {t('Current:')} {skill.currentLevel} / 5
                    </span>
                    {evidenceRec && (
                      <span className="text-[10px] text-[var(--text-muted)] font-sans">
                        {evidenceRec.selfReportedLevel !== null && (
                          <>{t('Self')}: L{evidenceRec.selfReportedLevel}</>
                        )}
                        {evidenceRec.selfReportedLevel !== null && evidenceRec.assessedLevel !== null && ' · '}
                        {evidenceRec.assessedLevel !== null && (
                          <>{t('Assessed')}: L{evidenceRec.assessedLevel}</>
                        )}
                      </span>
                    )}
                    <span className="text-[var(--text-muted)]">
                      {t('Target:')} {skill.targetLevel} / 5
                    </span>
                  </div>

                  {/* The bar, with the target marked on it.
                      A slider alone says "you are here"; the bar says how far
                      that is from what the role asks for. */}
                  <div
                    className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--color-progress-track)]"
                    role="img"
                    aria-label={t(
                      'Current level {current} of 5. Target level {target} of 5.',
                    )
                      .replace('{current}', String(skill.currentLevel))
                      .replace('{target}', String(skill.targetLevel))}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        skill.gap > 0
                          ? 'bg-[var(--color-primary)]'
                          : 'bg-[var(--color-success-strong)]'
                      }`}
                      style={{ width: `${(skill.currentLevel / 5) * 100}%` }}
                    />
                    {/* The target marker. */}
                    <div
                      className="absolute top-0 h-full w-0.5 bg-[var(--text-primary)]"
                      style={{ left: `${(skill.targetLevel / 5) * 100}%` }}
                      aria-hidden="true"
                    />
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={skill.currentLevel}
                    onChange={(e) => {
                      const level = parseInt(e.target.value, 10);
                      updateSkillLevel(skill.id, level);
                      // The rating is saved on the server and the roadmap is
                      // rebuilt from it, so the candidate is told what
                      // happened rather than left watching a slider move.
                      showToast({
                        variant: 'success',
                        title: t('Skill level saved.'),
                        description: t('{skill} is now rated {level}/5. Your roadmap was rebuilt from it.').replace(
                          '{skill}',
                          skill.name
                        ).replace('{level}', String(level)),
                      });
                    }}
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />

                  {/* The evidence behind the level.
                      A number on its own says nothing about how the candidate
                      knows it, so the badges say which of the three levels is
                      carrying the weight: what they claim, what a check
                      measured, and what the records prove. */}
                  {skill.evidenceSources && skill.evidenceSources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {skill.evidenceSources.map((source) => (
                        <span
                          key={source}
                          className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                        >
                          {t(EVIDENCE_BADGE_LABELS[source] ?? source)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Gap Indicator */}
                <div className="md:w-1/3 flex items-center justify-between md:justify-end gap-3">
                  {hasGap ? (
                    <div className="text-end">
                      <div className="text-xs font-mono font-bold text-[var(--color-warning)]">
                        -{skill.gap} {t('Level Gap')}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{t('Requires improvement')}</div>
                    </div>
                  ) : (
                    <div className="text-end">
                      <div className="text-xs font-mono font-bold text-[var(--color-success-strong)] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('Target Satisfied')}</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{t('Meets role requirement')}</div>
                    </div>
                  )}

                  <button
                    onClick={() => removeSkill(skill.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)] rounded transition-colors"
                    title={t('Remove skill')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Custom Skill Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">{t('Add Custom Skill')}</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              {skillError && (
                <div role="alert" className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
                  {skillError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Skill Name')}</label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => {
                    setNewSkillName(e.target.value);
                    if (skillError) setSkillError(null);
                  }}
                  placeholder={t('e.g. Next.js, Redis, Prompt Engineering')}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Category')}</label>
                <select
                  value={newSkillCategory}
                  onChange={(e) => setNewSkillCategory(e.target.value as SkillCategory)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{t(c.replace('_', ' '))}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Current Level (1-5)')}</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newSkillLevel}
                    onChange={(e) => setNewSkillLevel(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Target Level (1-5)')}</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={newSkillTarget}
                    onChange={(e) => setNewSkillTarget(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-[var(--color-on-primary)] text-xs font-semibold hover:bg-[var(--accent-secondary)]"
                >
                  {t('Save Skill')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Reveal>
  );
};
