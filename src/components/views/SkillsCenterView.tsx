import React, { useState } from 'react';
import { Plus, Award, Filter, ArrowUpDown, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { SkillCategory, SkillSource } from '../../types/career';

export const SkillsCenterView: React.FC = () => {
  const { skills, updateSkillLevel, addCustomSkill, removeSkill, targetRole } = useCareer();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New skill form state
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<SkillCategory>('technical');
  const [newSkillLevel, setNewSkillLevel] = useState(3);
  const [newSkillTarget, setNewSkillTarget] = useState(4);
  const [newSkillSource, setNewSkillSource] = useState<SkillSource>('self_reported');

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
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">COMPETENCY TAXONOMY</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Skills Center & Gap Analytics
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Custom Skill</span>
        </button>
      </div>

      {/* Filter Tabs (Functional segmented buttons per Zero-Pill rule) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-[var(--accent-primary)] text-white shadow-xs'
              : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          All Skills ({skills.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              selectedCategory === cat
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {cat.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Skills Table / Cards */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="flex items-center justify-between text-xs text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-3">
          <div className="w-1/3">Skill & Source</div>
          <div className="w-1/3 text-center">Current Level vs Target for {targetRole.title}</div>
          <div className="w-1/3 text-right">Remaining Gap</div>
        </div>

        <div className="space-y-4">
          {filteredSkills.map((skill) => {
            const hasGap = skill.gap > 0;

            return (
              <div 
                key={skill.id}
                className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Skill Name & Metadata (Clean unboxed separators) */}
                <div className="md:w-1/3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[var(--text-primary)]">{skill.name}</span>
                    {skill.evidenceIds.length > 0 && (
                      <span className="text-[10px] text-[var(--color-success)] font-medium">· Verified</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                    <span className="capitalize">{skill.category.replace('_', ' ')}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{skill.source.replace('_', ' ')}</span>
                  </div>
                </div>

                {/* Interactive Level Slider */}
                <div className="md:w-1/3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[var(--text-primary)] font-semibold">
                      Current: {skill.currentLevel} / 5
                    </span>
                    <span className="text-[var(--text-muted)]">
                      Target: {skill.targetLevel} / 5
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
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-[var(--color-warning)]">
                        -{skill.gap} Level Gap
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Requires improvement</div>
                    </div>
                  ) : (
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-[var(--color-success)] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Target Satisfied</span>
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">Meets role requirement</div>
                    </div>
                  )}

                  <button
                    onClick={() => removeSkill(skill.id)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)] rounded transition-colors"
                    title="Remove skill"
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
              <h3 className="text-base font-bold text-[var(--text-primary)]">Add Custom Skill</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Skill Name</label>
                <input
                  type="text"
                  required
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="e.g. Next.js, Redis, Prompt Engineering"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Category</label>
                <select
                  value={newSkillCategory}
                  onChange={(e) => setNewSkillCategory(e.target.value as SkillCategory)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Current Level (1-5)</label>
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
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Target Level (1-5)</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:bg-[var(--accent-secondary)]"
                >
                  Save Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
