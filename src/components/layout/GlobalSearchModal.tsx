import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  X, 
  Briefcase, 
  Award, 
  FolderGit2, 
  BookOpen, 
  ExternalLink, 
  Plus, 
  Sparkles, 
  FileText, 
  Layers, 
  Target, 
  User, 
  ArrowRight,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { TARGET_ROLES } from '../../data/rolesData';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onOpenCopilot?: () => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ 
  isOpen, 
  onClose, 
  onNavigate, 
  onOpenCopilot 
}) => {
  const [query, setQuery] = useState('');
  const { skills, projects, jobs, learningResources, documents, secondaryGoals, targetRole } = useCareer();

  // Close on Escape, open on Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const results = useMemo(() => {
    if (!query.trim()) return { roles: [], skills: [], projects: [], jobs: [], learning: [], docs: [] };
    const q = query.toLowerCase();

    return {
      roles: TARGET_ROLES.filter(r => r.title.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)).slice(0, 3),
      skills: skills.filter(s => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)).slice(0, 3),
      projects: projects.filter(p => p.title.toLowerCase().includes(q) || p.skills.some(s => s.toLowerCase().includes(q))).slice(0, 3),
      jobs: jobs.filter(j => j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)).slice(0, 3),
      learning: learningResources.filter(l => l.title.toLowerCase().includes(q) || l.skill.toLowerCase().includes(q)).slice(0, 3),
      docs: documents.filter(d => d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q)).slice(0, 3)
    };
  }, [query, skills, projects, jobs, learningResources, documents]);

  if (!isOpen) return null;

  const totalResults = results.roles.length + results.skills.length + results.projects.length + results.jobs.length + results.learning.length + results.docs.length;

  const quickActions = [
    { label: 'Add New Skill', icon: Award, view: 'skills' },
    { label: 'Add Proof-of-Skill Project', icon: FolderGit2, view: 'projects' },
    { label: 'Add Work Experience', icon: Briefcase, view: 'profile' },
    { label: 'Add Certification', icon: ShieldCheck, view: 'profile' },
    { label: 'Add Secondary Career Goal', icon: Target, view: 'my-career' },
    { label: 'Track New Job Application', icon: Calendar, view: 'applications' },
    { label: 'Open CV Studio', icon: FileText, view: 'cv-studio' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-[var(--border-subtle)] gap-3">
          <Search className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command, search skills, projects, jobs, documents..."
            className="w-full bg-transparent border-0 text-sm focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            autoFocus
          />
          <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-secondary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
            ESC
          </span>
          <button 
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-4 space-y-5">
          {/* Quick Actions (when query is empty) */}
          {query.trim() === '' ? (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2 flex items-center justify-between">
                  <span>Quick Create Actions</span>
                  <span className="text-[10px] font-normal text-[var(--text-muted)]">1-Click Fast Track</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickActions.map((qa, i) => {
                    const Icon = qa.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => {
                          onNavigate(qa.view);
                          onClose();
                        }}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent-primary)]/40 hover:bg-[var(--surface-secondary)] text-left transition-colors text-xs text-[var(--text-primary)]"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-[var(--accent-surface)] text-[var(--accent-primary)]">
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="font-medium">{qa.label}</span>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {onOpenCopilot && (
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenCopilot();
                    }}
                    className="w-full p-3 rounded-xl bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center justify-between shadow-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span>Ask AI Copilot for Personalized Strategy</span>
                    </div>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : totalResults === 0 ? (
            <div className="text-center py-10 text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-bold text-[var(--text-primary)]">No matching records found for "{query}".</p>
              <p className="text-[var(--text-muted)]">Try searching for a skill, company, job title, or project name.</p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              {results.roles.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Roles</div>
                  <div className="space-y-1">
                    {results.roles.map(r => (
                      <button
                        key={r.id}
                        onClick={() => { onNavigate('my-career'); onClose(); }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-secondary)] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span className="font-semibold text-[var(--text-primary)]">{r.title}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">({r.category})</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.skills.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Skills</div>
                  <div className="space-y-1">
                    {results.skills.map(s => (
                      <button
                        key={s.id}
                        onClick={() => { onNavigate('skills'); onClose(); }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-secondary)] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Award className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="font-semibold text-[var(--text-primary)]">{s.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">L{s.currentLevel} • {s.category}</span>
                        </div>
                        <span className="text-[10px] font-mono text-[var(--accent-primary)]">Skills Center →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.projects.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Projects</div>
                  <div className="space-y-1">
                    {results.projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { onNavigate('projects'); onClose(); }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-secondary)] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FolderGit2 className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-semibold text-[var(--text-primary)]">{p.title}</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.jobs.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Job Opportunities</div>
                  <div className="space-y-1">
                    {results.jobs.map(j => (
                      <button
                        key={j.id}
                        onClick={() => { onNavigate('jobs'); onClose(); }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-secondary)] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span className="font-semibold text-[var(--text-primary)]">{j.title}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">at {j.company}</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {results.docs.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Documents</div>
                  <div className="space-y-1">
                    {results.docs.map(d => (
                      <button
                        key={d.id}
                        onClick={() => { onNavigate('documents'); onClose(); }}
                        className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[var(--surface-secondary)] text-left transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-purple-500" />
                          <span className="font-semibold text-[var(--text-primary)]">{d.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)]">({d.type})</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
