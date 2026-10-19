import React, { useState } from 'react';
import { 
  Search, 
  Check, 
  Briefcase, 
  Bookmark, 
  BookmarkCheck, 
  ArrowRight, 
  Layers, 
  DollarSign, 
  Award, 
  BookOpen, 
  ArrowLeftRight,
  GitBranch,
  TrendingUp
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { TARGET_ROLES } from '../../data/rolesData';
import { TargetRole } from '../../types/career';

interface CareerSetupViewProps {
  onNavigate: (view: string) => void;
}

export const CareerSetupView: React.FC<CareerSetupViewProps> = ({ onNavigate }) => {
  const { targetRole, savedRoles, setPrimaryTargetRole, saveRole, removeSavedRole, skills, profile, t } = useCareer();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<TargetRole>(targetRole);
  const [compareRole, setCompareRole] = useState<TargetRole | null>(null);

  const filteredRoles = TARGET_ROLES.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.tools.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isSaved = (roleId: string) => savedRoles.some(r => r.id === roleId);

  // Compute fit for any role
  const computeRoleFit = (role: TargetRole) => {
    let earned = 0;
    let total = 0;
    role.requiredSkills.forEach(req => {
      const found = skills.find(s => s.name.toLowerCase() === req.name.toLowerCase());
      const cur = found ? found.currentLevel : 1;
      total += req.minLevel;
      earned += Math.min(cur, req.minLevel);
    });
    return total > 0 ? Math.round((earned / total) * 100) : 75;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">CAREER ARCHITECTURE & DECISION SUPPORT</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Target Roles & Path Explorer
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {compareRole ? (
            <button
              onClick={() => setCompareRole(null)}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Exit Comparison
            </button>
          ) : (
            <button
              onClick={() => {
                const secondRole = TARGET_ROLES.find(r => r.id !== selectedRole.id) || TARGET_ROLES[1];
                setCompareRole(secondRole);
              }}
              className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Compare Two Roles</span>
            </button>
          )}
          <button
            onClick={() => onNavigate('analysis')}
            className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>View Gap Analysis</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SIDE-BY-SIDE COMPARISON VIEW (Section 55) */}
      {compareRole && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--accent-primary)]/40 space-y-6 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Role Comparison: {selectedRole.title} vs {compareRole.title}
              </h2>
            </div>
            <button
              onClick={() => setCompareRole(null)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              Close Comparison
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Role A */}
            <div className="p-5 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[var(--accent-primary)] font-bold">Role A</span>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">{selectedRole.title}</h3>
                  <div className="text-xs text-[var(--text-muted)]">{selectedRole.category} · {selectedRole.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-[var(--accent-primary)]">
                    {computeRoleFit(selectedRole)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">Candidate Fit</div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                <div><strong>Salary:</strong> <span className="font-mono text-[var(--color-success)]">{selectedRole.salaryRange}</span></div>
                <div><strong>Experience:</strong> {selectedRole.experienceExpectation}</div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Required Skills</div>
                <div className="flex flex-wrap gap-1">
                  {selectedRole.requiredSkills.map((s, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-main)] text-[var(--text-primary)]">
                      {s.name} (Lvl {s.minLevel})
                    </span>
                  ))}
                </div>
              </div>

              {targetRole.id !== selectedRole.id && (
                <button
                  onClick={() => setPrimaryTargetRole(selectedRole.id)}
                  className="w-full py-2 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:bg-[var(--accent-secondary)] transition-colors"
                >
                  Switch Primary Target to {selectedRole.title}
                </button>
              )}
            </div>

            {/* Role B */}
            <div className="p-5 rounded-xl bg-[var(--surface-secondary)]/40 border border-[var(--border-subtle)] space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[var(--accent-primary)] font-bold">Role B</span>
                  <select
                    value={compareRole.id}
                    onChange={(e) => {
                      const r = TARGET_ROLES.find(item => item.id === e.target.value);
                      if (r) setCompareRole(r);
                    }}
                    className="text-base font-bold text-[var(--text-primary)] bg-transparent border-0 focus:outline-none cursor-pointer block"
                  >
                    {TARGET_ROLES.map(r => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                  <div className="text-xs text-[var(--text-muted)]">{compareRole.category} · {compareRole.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-[var(--accent-primary)]">
                    {computeRoleFit(compareRole)}%
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">Candidate Fit</div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                <div><strong>Salary:</strong> <span className="font-mono text-[var(--color-success)]">{compareRole.salaryRange}</span></div>
                <div><strong>Experience:</strong> {compareRole.experienceExpectation}</div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Required Skills</div>
                <div className="flex flex-wrap gap-1">
                  {compareRole.requiredSkills.map((s, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-main)] text-[var(--text-primary)]">
                      {s.name} (Lvl {s.minLevel})
                    </span>
                  ))}
                </div>
              </div>

              {targetRole.id !== compareRole.id && (
                <button
                  onClick={() => setPrimaryTargetRole(compareRole.id)}
                  className="w-full py-2 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:bg-[var(--accent-secondary)] transition-colors"
                >
                  Switch Primary Target to {compareRole.title}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role Selection & Details Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Role Search & Directory */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by role title, tool, or discipline..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
            {filteredRoles.map((role) => {
              const isCurrentTarget = targetRole.id === role.id;
              const isSelected = selectedRole.id === role.id;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[var(--accent-surface)]/40 border-[var(--accent-primary)] shadow-xs'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[var(--text-primary)]">{role.title}</span>
                        {isCurrentTarget && (
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--accent-primary)] text-white">
                            Primary
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{role.category} · {role.level}</div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSaved(role.id)) {
                          removeSavedRole(role.id);
                        } else {
                          saveRole(role);
                        }
                      }}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] p-1 rounded"
                      title={isSaved(role.id) ? 'Saved' : 'Save for comparison'}
                    >
                      {isSaved(role.id) ? (
                        <BookmarkCheck className="w-4 h-4 text-[var(--accent-primary)]" />
                      ) : (
                        <Bookmark className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-2 leading-relaxed">
                    {role.overview}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)]/70 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span className="font-mono text-[var(--color-success)]">{role.salaryRange.split(' ')[0]}</span>
                    <span className="hover:text-[var(--accent-primary)] font-medium">Inspect Specification →</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (7 cols): Detailed Role Blueprint & Career Path Explorer */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <div className="text-xs text-[var(--text-muted)]">{selectedRole.category} · {selectedRole.level} Level</div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{selectedRole.title}</h2>
              </div>

              <div className="flex items-center gap-2">
                {targetRole.id !== selectedRole.id ? (
                  <button
                    onClick={() => setPrimaryTargetRole(selectedRole.id)}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold transition-all shadow-xs"
                  >
                    Set as Primary Target Role
                  </button>
                ) : (
                  <div className="px-3 py-1.5 rounded-lg bg-[var(--color-success)]/10 text-[var(--color-success)] text-xs font-semibold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Active Primary Target</span>
                  </div>
                )}
              </div>
            </div>

            {/* Overview & Salary */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Role Overview</div>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{selectedRole.overview}</p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs text-[var(--text-secondary)]">
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">Salary Expectation:</span>{' '}
                  <span className="font-mono text-[var(--color-success)]">{selectedRole.salaryRange}</span>
                </div>
                <div>
                  <span className="font-semibold text-[var(--text-primary)]">Experience Expected:</span> {selectedRole.experienceExpectation}
                </div>
              </div>
            </div>

            {/* Core Responsibilities */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Core Responsibilities</div>
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                {selectedRole.responsibilities.map((resp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--accent-primary)] font-bold mt-0.5">•</span>
                    <span>{resp}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Required Skills & Proficiency Baselines */}
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Required Skills & Baselines</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedRole.requiredSkills.map((sk, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--text-primary)]">{sk.name}</span>
                    <span className="font-mono text-[var(--text-secondary)]">Level {sk.minLevel}/5</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tools & Technologies */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tools & Ecosystem</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedRole.tools.map((tool, i) => (
                  <span key={i} className="text-xs px-2.5 py-1 rounded bg-[var(--surface-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            {/* CAREER PATH EXPLORER (Section 56) */}
            <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Career Path Progression Horizon</h3>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {selectedRole.careerProgression.map((stage, i) => (
                  <React.Fragment key={i}>
                    <div className="p-2.5 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-center text-xs flex-1">
                      <div className="font-mono text-[10px] text-[var(--text-muted)]">Level {i + 1}</div>
                      <div className="font-semibold text-[var(--text-primary)] mt-0.5">{stage}</div>
                    </div>
                    {i < selectedRole.careerProgression.length - 1 && (
                      <div className="text-[var(--text-muted)] text-center hidden sm:block">→</div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
