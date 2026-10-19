import React from 'react';
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldAlert, 
  TrendingUp, 
  BookOpen, 
  FolderGit2, 
  RefreshCw,
  Award
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface CareerAnalysisViewProps {
  onNavigate: (view: string) => void;
}

export const CareerAnalysisView: React.FC<CareerAnalysisViewProps> = ({ onNavigate }) => {
  const { analysis, targetRole, profile, skills, refreshAiAnalysis, isAnalyzing, t } = useCareer();

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">GRAPH REASONING ENGINE</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Career Analysis: Current State vs Target State
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refreshAiAnalysis}
            disabled={isAnalyzing}
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-primary)] flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <span>{isAnalyzing ? 'Re-evaluating with AI...' : 'Run Deep AI Gap Analysis'}</span>
          </button>
          <button
            onClick={() => onNavigate('plan')}
            className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span>Generate Personal Plan</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* High-Level Comparison Banner */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Current State Column */}
          <div className="md:col-span-5 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Current State</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">{profile.name}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {profile.currentTitle} · {profile.careerState.replace('_', ' ')}
            </div>
            <div className="text-xs text-[var(--text-muted)] pt-1">
              {skills.length} tracked skills · {skills.filter(s => s.evidenceIds.length > 0).length} verified with evidence
            </div>
          </div>

          {/* Central Match Indicator */}
          <div className="md:col-span-2 text-center py-4 border-y md:border-y-0 md:border-x border-[var(--border-subtle)] space-y-1">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">Readiness Match</div>
            <div className="text-4xl font-extrabold font-mono tabular-nums text-[var(--accent-primary)]">
              {analysis.matchPercentage}%
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">Relative to Role Benchmarks</div>
          </div>

          {/* Target State Column */}
          <div className="md:col-span-5 space-y-2 md:text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)]">Target State</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">{targetRole.title}</div>
            <div className="text-xs text-[var(--text-secondary)]">
              {targetRole.category} · {targetRole.level} Level
            </div>
            <div className="text-xs text-[var(--text-muted)] pt-1">
              Salary Expectation: <span className="font-mono text-[var(--color-success)]">{targetRole.salaryRange.split(' ')[0]}</span>
            </div>
          </div>
        </div>

        {/* Responsible AI Disclaimer (Mandatory per Prompt) */}
        <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <AlertTriangle className="w-3.5 h-3.5 text-[var(--color-warning)] shrink-0" />
          <span>
            Career readiness reflects algorithmic alignment with industry skill requirements. It is a developmental guidance metric and not a guarantee of employment.
          </span>
        </div>
      </div>

      {/* Detailed Analysis 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Left Column: Strengths & Critical Gaps */}
        <div className="space-y-6">
          {/* Strengths */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Demonstrated Strengths</h3>
            </div>
            <div className="space-y-2.5">
              {analysis.strengths.map((st, i) => (
                <div key={i} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs space-y-0.5">
                  <div className="font-semibold text-[var(--text-primary)]">{st.skill}</div>
                  <div className="text-[var(--text-secondary)]">{st.note}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Critical Gaps */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Critical Skill Gaps</h3>
            </div>
            <div className="space-y-2.5">
              {analysis.criticalGaps.map((gap, i) => (
                <div key={i} className="p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold text-[var(--text-primary)]">
                    <span>{gap.skill}</span>
                    <span className="font-mono text-[var(--color-warning)]">
                      Lvl {gap.current} → Lvl {gap.target}
                    </span>
                  </div>
                  <div className="text-[var(--text-secondary)] leading-relaxed">{gap.reason}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Missing Experience, Career Risks, & Recommendations */}
        <div className="space-y-6">
          {/* Missing Experience & Career Risks */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[var(--color-danger)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Missing Experience & Career Risks</h3>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <div className="font-semibold text-[var(--text-muted)] uppercase text-[10px] mb-1.5">Missing Experience</div>
                <ul className="space-y-1.5 text-[var(--text-secondary)]">
                  {analysis.missingExperience.map((exp, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--color-danger)]">•</span>
                      <span>{exp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="font-semibold text-[var(--text-muted)] uppercase text-[10px] mb-1.5">Marketplace Risks</div>
                <ul className="space-y-1.5 text-[var(--text-secondary)]">
                  {analysis.careerRisks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--color-warning)]">•</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Actionable Project & Learning Prescriptions */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Recommended Bridging Artifacts</h3>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)]">
                  <FolderGit2 className="w-3.5 h-3.5" />
                  <span>Prescribed Project Deliverables</span>
                </div>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                  {analysis.recommendedProjects.map((proj, i) => (
                    <li key={i}>· {proj}</li>
                  ))}
                </ul>
                <button
                  onClick={() => onNavigate('projects')}
                  className="mt-1 text-xs text-[var(--accent-primary)] hover:underline font-medium block"
                >
                  Create Prescribed Project →
                </button>
              </div>

              <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-success)]">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Recommended Curricula</span>
                </div>
                <ul className="text-xs text-[var(--text-secondary)] space-y-1">
                  {analysis.recommendedLearning.map((learn, i) => (
                    <li key={i}>· {learn}</li>
                  ))}
                </ul>
                <button
                  onClick={() => onNavigate('learning')}
                  className="mt-1 text-xs text-[var(--accent-primary)] hover:underline font-medium block"
                >
                  Browse Curated Courses →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
