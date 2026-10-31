import React, { useMemo, useState } from 'react';
import { Plus, CheckCircle2, X, Target } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { SKILL_CATEGORIES } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { SkillCategory, SkillSource } from '../../types/career';
import { Reveal } from '../motion/Motion';
import {
  computeSkillGaps,
  normalizeSkillName,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../../../shared/skillGap';

/** The colour used for each gap priority. */
const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600',
  low: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  sufficient: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
};

export const SkillsCenterView: React.FC = () => {
  const { skills, updateSkillLevel, addCustomSkill, removeSkill, targetRole, t} = useCareer();
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

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;

    addCustomSkill({
      name: newSkillName.trim(),
      category: newSkillCategory,
      currentLevel: newSkillLevel,
      targetLevel: newSkillTarget,
      source: newSkillSource,
      evidenceIds: []
    });

    setNewSkillName('');
    setShowAddModal(false);
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
          <div className="w-1/3 text-center">{t('Current Level vs Target for')} {targetRole.title}</div>
          <div className="w-1/3 text-end">{t('Remaining Gap')}</div>
        </div>

        <div className="space-y-4">
          {filteredSkills.map((skill) => {
            const hasGap = skill.gap > 0;
            const priority = gapAnalysis?.byName.get(normalizeSkillName(skill.name))?.priority;

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
                </div>

                {/* Interactive Level Slider */}
                <div className="md:w-1/3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--text-primary)] font-semibold">
                      {t('Current:')} {skill.currentLevel} / 5
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {t('Target:')} {skill.targetLevel} / 5
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={skill.currentLevel}
                    onChange={(e) => updateSkillLevel(skill.id, parseInt(e.target.value, 10))}
                    className="w-full accent-[var(--accent-primary)] cursor-pointer"
                  />
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
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">{t('Skill Name')}</label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
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
