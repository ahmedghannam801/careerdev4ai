import React, { useState } from 'react';
import { Plus, ShieldCheck, ExternalLink, Github, Award, CheckCircle2, FileCheck, X } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { EvidenceType, EvidenceItem } from '../../types/career';

export const EvidenceView: React.FC = () => {
  const { evidenceItems, addEvidence, deleteEvidence, targetRole, skills } = useCareer();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New evidence form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EvidenceType>('github');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [skillNamesStr, setSkillNamesStr] = useState('React, TypeScript');

  const evidenceTypes: EvidenceType[] = [
    'github',
    'demo',
    'certificate',
    'project',
    'experience',
    'course',
    'assessment',
    'portfolio'
  ];

  const filtered = evidenceItems.filter(e => 
    selectedType === 'all' ? true : e.type === selectedType
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    addEvidence({
      title: title.trim(),
      type,
      description: description.trim(),
      url: url.trim() || undefined,
      skillNames: skillNamesStr.split(',').map(s => s.trim()).filter(Boolean),
      verified: true
    });

    setTitle('');
    setDescription('');
    setUrl('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">VERIFIABLE PROOF HUB</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Evidence Records & Skill Validation
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Evidence Artifact</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedType('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
            selectedType === 'all'
              ? 'bg-[var(--accent-primary)] text-white shadow-xs'
              : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          All Evidence ({evidenceItems.length})
        </button>
        {evidenceTypes.map((t) => (
          <button
            key={t}
            onClick={() => setSelectedType(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
              selectedType === t
                ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Evidence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 flex flex-col justify-between shadow-xs hover:border-[var(--border-strong)] transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="capitalize">{item.type}</span>
                    <span>·</span>
                    <span className="font-mono text-[11px]">{item.dateAdded}</span>
                  </div>
                  <h3 className="text-base font-bold text-[var(--text-primary)] mt-0.5">{item.title}</h3>
                </div>

                {item.verified && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--color-success)] bg-[var(--color-success)]/10 px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verified</span>
                  </span>
                )}
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {item.description}
              </p>

              {/* Linked Skills */}
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Validated Competencies</div>
                <div className="flex flex-wrap gap-1.5">
                  {item.skillNames.map((sk, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--accent-primary)] font-medium">
                      ✓ {sk}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[var(--accent-primary)] hover:underline font-medium"
                >
                  <span>Verify Link</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : <div />}

              <button
                onClick={() => deleteEvidence(item.id)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Evidence Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)]">Add Evidence Artifact</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Meta Frontend Certification or GitHub Repository"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Artifact Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as EvidenceType)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] capitalize"
                >
                  {evidenceTypes.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Description</label>
                <textarea
                  required
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe how this artifact demonstrates mastery..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">URL / Link</label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Validated Skills (comma separated)</label>
                <input
                  type="text"
                  value={skillNamesStr}
                  onChange={(e) => setSkillNamesStr(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                />
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
                  Attach Evidence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
