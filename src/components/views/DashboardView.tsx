import React from 'react';
import { 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Briefcase, 
  Target, 
  Layers, 
  Calendar, 
  BookOpen, 
  FileText,
  AlertCircle,
  Activity,
  Award,
  ShieldCheck,
  TrendingUp,
  CheckSquare,
  Square
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';

interface DashboardViewProps {
  onNavigate: (view: string) => void;
  onOpenCopilot: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, onOpenCopilot }) => {
  const { 
    profile, 
    targetRole, 
    analysis, 
    roadmapPhases, 
    skills, 
    applications, 
    projects, 
    learningResources,
    enrolledResourceIds,
    updateTaskStatus,
    dailyActions,
    toggleDailyAction,
    weeklyReview,
    careerHealth,
    cvVersions,
    t 
  } = useCareer();

  // Find next pending roadmap tasks
  const pendingTasks = roadmapPhases
    .flatMap(p => p.milestones.flatMap(m => m.tasks))
    .filter(t => t.status !== 'completed');

  const topTask = pendingTasks[0];
  const activeApplications = applications.filter(a => !['rejected', 'withdrawn', 'offer'].includes(a.stage));
  const activeProject = projects.find(p => p.status === 'in_progress') || projects[0];

  const totalTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks)).length;
  const completedTasks = roadmapPhases.flatMap(p => p.milestones.flatMap(m => m.tasks.filter(t => t.status === 'completed'))).length;
  const masteredSkillsCount = skills.filter(s => s.gap === 0).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Welcome & Role Context Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
            <span>{profile.careerState.replace('_', ' ').toUpperCase()}</span>
            <span>·</span>
            <span>TARGETING: {targetRole.title.toUpperCase()}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('dashboardWelcome')}, {profile.name}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('my-career')}
            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:bg-[var(--surface-secondary)] text-xs font-medium text-[var(--text-primary)] transition-colors"
          >
            Switch Target Role
          </button>
          <button
            onClick={onOpenCopilot}
            className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Consult Copilot</span>
          </button>
        </div>
      </div>

      {/* TOP SECTION: What should I do next? (Next Best Action) */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] relative overflow-hidden shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Next Best Action</span>
            </div>

            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {analysis.nextBestAction?.title || 'Review Core Skill Milestones'}
            </h2>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {analysis.nextBestAction?.description}
            </p>

            <div className="pt-1 text-xs text-[var(--text-muted)] flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">Why am I seeing this?</span>
              <span>·</span>
              <span>{analysis.nextBestAction?.reason}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
            {topTask && (
              <button
                onClick={() => updateTaskStatus(topTask.id, 'completed')}
                className="px-4 py-2.5 rounded-lg bg-[var(--accent-primary)] text-white text-xs font-semibold hover:bg-[var(--accent-secondary)] flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Action Complete</span>
              </button>
            )}
            <button
              onClick={() => onNavigate('roadmap')}
              className="px-4 py-2 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-primary)] flex items-center justify-center gap-1 transition-colors"
            >
              <span>View Full Roadmap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* DAILY CAREER ACTIONS (Sections 35, 36) */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">Today's High-Impact Actions</h2>
          </div>
          <span className="text-xs text-[var(--text-muted)] font-mono">
            {dailyActions.filter(a => a.completed).length} of {dailyActions.length} completed
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {dailyActions.map((action) => (
            <div
              key={action.id}
              onClick={() => toggleDailyAction(action.id)}
              className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 ${
                action.completed
                  ? 'bg-[var(--surface-secondary)]/50 border-[var(--border-subtle)] opacity-75'
                  : 'bg-[var(--surface-secondary)]/30 border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
              }`}
            >
              <div className="mt-0.5 text-[var(--accent-primary)]">
                {action.completed ? (
                  <CheckSquare className="w-4 h-4 text-[var(--color-success)]" />
                ) : (
                  <Square className="w-4 h-4 text-[var(--text-muted)]" />
                )}
              </div>
              <div className="space-y-1 flex-1">
                <div className={`text-xs font-bold ${action.completed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                  {action.title}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {action.description}
                </div>
                <div className="text-[10px] text-[var(--text-muted)] pt-1 flex items-center justify-between">
                  <span>{action.reason}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(action.actionView);
                    }}
                    className="text-[var(--accent-primary)] hover:underline font-semibold"
                  >
                    Open →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CORE SCANNABLE METRICS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
          <div className="text-xs text-[var(--text-secondary)]">Role Readiness Match</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {analysis.matchPercentage}%
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-success)] flex items-center gap-1">
            <span>+8%</span>
            <span className="text-[var(--text-muted)]">vs last assessment</span>
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
          <div className="text-xs text-[var(--text-secondary)]">Skills Mastered</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {masteredSkillsCount} <span className="text-sm font-normal text-[var(--text-muted)]">/ {skills.length}</span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">
            {analysis.criticalGaps.length} critical gaps remaining
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
          <div className="text-xs text-[var(--text-secondary)]">Roadmap Completion</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {completedTasks} <span className="text-sm font-normal text-[var(--text-muted)]">/ {totalTasks}</span>
          </div>
          <div className="mt-1 text-[11px] text-[var(--text-muted)]">
            {totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% overall progress
          </div>
        </div>

        <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
          <div className="text-xs text-[var(--text-secondary)]">Active Applications</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
            {activeApplications.length}
          </div>
          <div className="mt-1 text-[11px] text-[var(--accent-primary)] font-medium">
            1 interview scheduled
          </div>
        </div>
      </div>

      {/* 2-Column Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (8 cols): Critical Gaps & In-Flight Project */}
        <div className="lg:col-span-8 space-y-8">
          {/* Critical Skill Gaps */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Primary Skill Gaps</h3>
                <p className="text-xs text-[var(--text-secondary)]">Calculated against {targetRole.title} industry benchmarks</p>
              </div>
              <button
                onClick={() => onNavigate('skills')}
                className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
              >
                Manage Skills →
              </button>
            </div>

            <div className="space-y-3">
              {analysis.criticalGaps.map((gap, idx) => (
                <div key={idx} className="p-3.5 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--text-primary)]">{gap.skill}</span>
                      <span className="text-xs text-[var(--text-muted)]">· Current Level {gap.current} → Target Level {gap.target}</span>
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">{gap.reason}</div>
                  </div>
                  <button
                    onClick={() => onNavigate('learning')}
                    className="self-start sm:self-auto px-3 py-1.5 rounded bg-[var(--surface-main)] hover:bg-[var(--accent-surface)] text-xs font-medium text-[var(--accent-primary)] border border-[var(--border-subtle)] whitespace-nowrap transition-colors"
                  >
                    View Resource
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Project & Evidence */}
          {activeProject && (
            <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-[var(--text-primary)]">Active Portfolio Project</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Proof of skill for hiring managers</p>
                </div>
                <button
                  onClick={() => onNavigate('projects')}
                  className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                >
                  All Projects →
                </button>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-sm text-[var(--text-primary)]">{activeProject.title}</div>
                    <div className="text-xs text-[var(--text-muted)]">{activeProject.difficulty} · Status: {activeProject.status.replace('_', ' ')}</div>
                  </div>
                  {activeProject.repositoryUrl && (
                    <a
                      href={activeProject.repositoryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--accent-primary)] hover:underline font-medium"
                    >
                      Repository ↗
                    </a>
                  )}
                </div>

                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {activeProject.goal}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeProject.skills.map((s, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-[var(--surface-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* WEEKLY CAREER REVIEW (Section 37) */}
          <div className="p-6 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Weekly Career Review</h3>
                <p className="text-xs text-[var(--text-secondary)]">Week {weeklyReview.weekNumber} · {weeklyReview.startDate} - {weeklyReview.endDate}</p>
              </div>
              <span className="font-mono text-xs font-bold text-[var(--color-success)] bg-[var(--color-success)]/10 px-2.5 py-1 rounded">
                Health Score: {weeklyReview.healthScore}/100
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="font-semibold text-[var(--text-muted)] uppercase text-[10px] mb-1.5">Accomplishments This Week</div>
                <ul className="space-y-1 text-[var(--text-secondary)]">
                  {weeklyReview.keyAchievements.map((ach, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--color-success)] font-bold">✓</span>
                      <span>{ach}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)]">
                <div className="font-semibold text-[var(--text-muted)] uppercase text-[10px] mb-1.5">Priorities For Next Week</div>
                <ul className="space-y-1 text-[var(--text-secondary)]">
                  {weeklyReview.nextWeekPriorities.map((pri, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[var(--accent-primary)] font-bold">→</span>
                      <span>{pri}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (4 cols): Deadlines, Career Health Dimensions */}
        <div className="lg:col-span-4 space-y-8">
          {/* Upcoming Deadlines & Interviews */}
          <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Upcoming Milestones</span>
              </h3>
              <span className="text-xs text-[var(--text-muted)]">October 2026</span>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-surface)]/40 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--accent-primary)]">
                  <span>Technical Round 2</span>
                  <span className="font-mono">OCT 22</span>
                </div>
                <div className="text-xs text-[var(--text-primary)] font-medium">Vanguard Systems</div>
                <div className="text-[11px] text-[var(--text-secondary)]">React Fiber & custom hooks deep dive</div>
                <button
                  onClick={() => onNavigate('interviews')}
                  className="mt-2 text-xs font-semibold text-[var(--accent-primary)] hover:underline block"
                >
                  Prepare STAR Answers →
                </button>
              </div>

              <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                  <span>Roadmap Deadline</span>
                  <span className="font-mono">OCT 25</span>
                </div>
                <div className="text-xs text-[var(--text-primary)] font-medium">Refactor component generics</div>
                <div className="text-[11px] text-[var(--text-muted)]">TypeScript strict typing milestone</div>
              </div>
            </div>
          </div>

          {/* EXPLAINABLE CAREER HEALTH (Section 38) */}
          <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[var(--color-success)]" />
                <span>Career Health Breakdown</span>
              </h3>
              <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                {careerHealth.overallHealth}%
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {[
                { label: 'Skills Confidence', val: careerHealth.skillsConfidence, hint: 'Mastered vs remaining gaps' },
                { label: 'Evidence Coverage', val: careerHealth.evidenceCoverage, hint: 'GitHub repos and live demos' },
                { label: 'CV Role Alignment', val: careerHealth.cvAlignment, hint: 'ATS keyword match score' },
                { label: 'Market Engagement', val: careerHealth.marketEngagement, hint: 'Tracked active applications' }
              ].map((dim, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-medium text-[var(--text-primary)]">{dim.label}</span>
                    <span className="font-mono text-[var(--text-muted)]">{dim.val}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--surface-secondary)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--accent-primary)] rounded-full" 
                      style={{ width: `${dim.val}%` }} 
                    />
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">{dim.hint}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Nav Tools */}
          <div className="p-5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Career Workspaces
            </h3>

            <div className="space-y-1.5 text-xs">
              <button
                onClick={() => onNavigate('cv-studio')}
                className="w-full p-2.5 rounded-lg hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="font-medium">CV Studio (ATS Score: {cvVersions[0]?.atsAnalysis?.overallScore || 84})</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>

              <button
                onClick={() => onNavigate('jobs')}
                className="w-full p-2.5 rounded-lg hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[var(--color-success)]" />
                  <span className="font-medium">Matched Job Openings</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>

              <button
                onClick={() => onNavigate('interviews')}
                className="w-full p-2.5 rounded-lg hover:bg-[var(--surface-secondary)] flex items-center justify-between text-[var(--text-primary)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--color-warning)]" />
                  <span className="font-medium">AI Mock Interview Simulator</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
