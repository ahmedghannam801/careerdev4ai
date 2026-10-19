import React, { useState } from 'react';
import { 
  Compass, 
  ArrowRight, 
  Target, 
  Layers, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ShieldAlert, 
  TrendingUp, 
  Award, 
  FolderGit2, 
  FileText, 
  Briefcase, 
  Calendar, 
  Plus, 
  Check, 
  X, 
  ChevronRight,
  Filter,
  Flame,
  ShieldCheck,
  Star
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { SecondaryCareerGoal, CareerMilestoneItem, MilestoneCategory } from '../../types/career';

export const MyCareerView: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const { 
    profile, 
    targetRole, 
    analysis, 
    skills, 
    projects, 
    evidenceItems, 
    applications, 
    interviewSessions, 
    roadmapPhases, 
    secondaryGoals, 
    addSecondaryGoal, 
    updateSecondaryGoal, 
    deleteSecondaryGoal,
    milestones, 
    addMilestone, 
    careerBlockers, 
    t 
  } = useCareer();

  const [addGoalModalOpen, setAddGoalModalOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
    priority: 'high' as const,
    deadline: ''
  });

  const [addMilestoneModalOpen, setAddMilestoneModalOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({
    title: '',
    category: 'role' as MilestoneCategory,
    dateAchieved: '',
    notes: ''
  });

  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'recommended' | 'optional'>('all');

  // Unified Career Timeline Events
  const timelineEvents = [
    ...profile.education.map(e => ({
      id: `timeline-edu-${e.id}`,
      year: e.startDate.slice(0, 4) || '2022',
      date: e.startDate,
      type: 'Education',
      title: `${e.degree} in ${e.field}`,
      subtitle: e.institution,
      status: 'completed',
      icon: Award
    })),
    ...profile.experiences.map(e => ({
      id: `timeline-exp-${e.id}`,
      year: e.startDate.slice(0, 4) || '2024',
      date: e.startDate,
      type: 'Experience',
      title: `${e.role} at ${e.company}`,
      subtitle: e.employmentType,
      status: e.isCurrent ? 'current' : 'completed',
      icon: Briefcase
    })),
    ...profile.certifications.map(c => ({
      id: `timeline-cert-${c.id}`,
      year: c.issueDate.slice(0, 4) || '2024',
      date: c.issueDate,
      type: 'Certification',
      title: c.name,
      subtitle: c.provider,
      status: 'completed',
      icon: Award
    })),
    ...projects.map(p => ({
      id: `timeline-proj-${p.id}`,
      year: p.createdAt.slice(0, 4) || '2026',
      date: p.createdAt,
      type: 'Project',
      title: p.title,
      subtitle: p.difficulty,
      status: p.status,
      icon: FolderGit2
    })),
    ...applications.map(a => ({
      id: `timeline-app-${a.id}`,
      year: a.appliedDate?.slice(0, 4) || '2026',
      date: a.appliedDate || a.lastUpdated,
      type: 'Application',
      title: `${a.role} at ${a.company}`,
      subtitle: `Stage: ${a.stage.toUpperCase()}`,
      status: a.stage,
      icon: Calendar
    }))
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Asset Scorecard calculation
  const assetScorecard = [
    {
      name: 'Profile Identity',
      status: profile.professionalSummary && profile.headline ? 'Complete' : 'Needs Improvement',
      desc: `${profile.experiences.length} experiences, ${profile.education.length} credentials`,
      view: 'profile'
    },
    {
      name: 'Skills Taxonomy',
      status: skills.length >= 8 ? 'Complete' : 'Needs Improvement',
      desc: `${skills.filter(s => s.gap === 0).length} of ${skills.length} mastered`,
      view: 'skills'
    },
    {
      name: 'Evidence & Proof',
      status: evidenceItems.length >= 2 ? 'Complete' : 'Needs Improvement',
      desc: `${evidenceItems.length} verified artifacts linked`,
      view: 'evidence'
    },
    {
      name: 'Portfolio Projects',
      status: projects.length >= 2 ? 'Complete' : 'Needs Improvement',
      desc: `${projects.filter(p => p.status === 'completed').length} completed portfolio items`,
      view: 'projects'
    },
    {
      name: 'Target CV Alignment',
      status: 'Complete',
      desc: 'ATS Match Score: 84% tailored for Frontend Engineer',
      view: 'cv-studio'
    },
    {
      name: 'Job Applications',
      status: applications.length >= 2 ? 'Complete' : 'Needs Improvement',
      desc: `${applications.length} tracked active applications`,
      view: 'applications'
    },
    {
      name: 'Interview Readiness',
      status: interviewSessions.length >= 1 ? 'Complete' : 'Missing',
      desc: `${interviewSessions.length} STAR mock simulations passed`,
      view: 'interviews'
    }
  ];

  // Journey Map stages
  const journeySteps = [
    { key: 'current', label: 'Current State', desc: profile.careerState.replace('_', ' '), active: false, done: true },
    { key: 'target', label: 'Target Role', desc: targetRole.title, active: false, done: true },
    { key: 'gaps', label: 'Skill Gaps', desc: `${analysis.criticalGaps.length} critical gaps`, active: false, done: true },
    { key: 'plan', label: 'Strategic Plan', desc: '6 Phases Mapped', active: false, done: true },
    { key: 'build', label: 'Build & Learn', desc: 'Active Roadmap', active: true, done: false },
    { key: 'prove', label: 'Prove Skill', desc: `${evidenceItems.length} Artifacts`, active: false, done: false },
    { key: 'apply', label: 'Apply', desc: `${applications.length} Applications`, active: false, done: false },
    { key: 'interview', label: 'Interview', desc: 'Vanguard Systems', active: false, done: false },
    { key: 'outcome', label: 'Offer', desc: 'Targeting Q4 2026', active: false, done: false },
  ];

  const handleSaveGoal = () => {
    if (!goalForm.title.trim()) return;
    addSecondaryGoal({
      title: goalForm.title.trim(),
      description: goalForm.description.trim(),
      priority: goalForm.priority,
      deadline: goalForm.deadline || '2026-12-31',
      status: 'active',
      progressPercent: 10
    });
    setAddGoalModalOpen(false);
    setGoalForm({ title: '', description: '', priority: 'high', deadline: '' });
  };

  const handleSaveMilestone = () => {
    if (!milestoneForm.title.trim()) return;
    addMilestone({
      title: milestoneForm.title.trim(),
      category: milestoneForm.category,
      dateAchieved: milestoneForm.dateAchieved || new Date().toISOString().split('T')[0],
      notes: milestoneForm.notes.trim(),
      verified: true
    });
    setAddMilestoneModalOpen(false);
    setMilestoneForm({ title: '', category: 'role', dateAchieved: '', notes: '' });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner: Where Am I in My Journey? */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--accent-surface)] text-[var(--accent-primary)] text-xs font-semibold">
              <Compass className="w-3.5 h-3.5" />
              <span>Career Journey Command</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              Where Am I in My Career Journey?
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl">
              You are currently transitioning from <strong className="text-[var(--text-primary)] capitalize">{profile.careerState.replace('_', ' ')}</strong> to a verified <strong className="text-[var(--accent-primary)]">{targetRole.title}</strong>. Your current market match is at <strong className="text-emerald-500">{analysis.matchPercentage}%</strong> with active interview pipelines.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('analysis')}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-primary)] transition-colors shadow-2xs"
            >
              Detailed Gap Analysis
            </button>
            <button
              onClick={() => onNavigate('roadmap')}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span>View Active Roadmap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 9-Step Visual Career Journey Map */}
        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4">
            Visual Career Journey Map
          </h3>

          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
            {journeySteps.map((step, idx) => (
              <div 
                key={step.key}
                className={`p-3 rounded-xl border text-center transition-all ${
                  step.active 
                    ? 'bg-[var(--accent-surface)] border-[var(--accent-primary)] shadow-xs scale-102 ring-1 ring-[var(--accent-primary)]'
                    : step.done
                    ? 'bg-[var(--surface-main)] border-emerald-500/40 text-[var(--text-primary)]'
                    : 'bg-[var(--surface-secondary)]/40 border-[var(--border-subtle)] opacity-70'
                }`}
              >
                <div className="text-[10px] font-mono text-[var(--text-muted)] mb-1">
                  0{idx + 1}
                </div>
                <div className="text-xs font-bold truncate text-[var(--text-primary)]">
                  {step.label}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] truncate mt-0.5">
                  {step.desc}
                </div>
                <div className="mt-2 flex justify-center">
                  {step.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  ) : step.active ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-primary)] animate-ping" />
                  ) : (
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* "What's Blocking You?" Actionable Blockers Engine */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                What's Blocking You?
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Proactive diagnostic engine identifying constraints impeding your career progress.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-500 font-semibold px-2 py-0.5 rounded bg-amber-500/10">
            {careerBlockers.length} Active Blockers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {careerBlockers.map(blocker => (
            <div 
              key={blocker.id}
              className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-600 font-mono">
                    {blocker.severity} Priority
                  </span>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    {blocker.title}
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {blocker.description}
                </p>
              </div>

              <button
                onClick={() => onNavigate(blocker.ctaView)}
                className="self-start px-3 py-1.5 rounded-lg bg-[var(--surface-main)] hover:bg-[var(--accent-primary)] hover:text-white border border-[var(--border-subtle)] text-xs font-semibold text-[var(--accent-primary)] flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <span>{blocker.ctaText}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Goals Management: Primary Goal + Secondary Goals */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[var(--accent-primary)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Career Goals Management
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Calibrate primary targets and secondary tactical goals with connected data progress.
              </p>
            </div>
          </div>
          <button
            onClick={() => setAddGoalModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Secondary Goal</span>
          </button>
        </div>

        {/* Primary Goal Card */}
        <div className="p-5 rounded-xl border-2 border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]/20 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-primary)] font-mono">
                Primary Goal
              </span>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                Secure Mid-Level Frontend Engineer Role (Vanguard Systems / Top-Tier Product)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Achieve promotion / market transition with a 35% compensation step and ownership over design system architecture.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 font-mono">
              In Progress (75%)
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
            <div className="h-full bg-[var(--accent-primary)] rounded-full w-3/4" />
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] pt-1">
            <span>Deadline: Q4 2026 (Target: Nov 30)</span>
            <span className="text-[var(--text-primary)] font-medium">Next Action: Technical Round with Vanguard Systems</span>
          </div>
        </div>

        {/* Secondary Goals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {secondaryGoals.map((goal) => (
            <div 
              key={goal.id}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-colors space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)] font-mono">
                      {goal.priority} Priority
                    </span>
                    <h4 className="text-xs font-bold text-[var(--text-primary)]">
                      {goal.title}
                    </h4>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {goal.description}
                  </p>
                </div>
                <button
                  onClick={() => deleteSecondaryGoal(goal.id)}
                  className="p-1 text-[var(--text-muted)] hover:text-red-500"
                  title="Remove goal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>Connected Progress</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{goal.progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--surface-secondary)] overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-[var(--accent-primary)]"
                    style={{ width: `${goal.progressPercent}%` }}
                  />
                </div>
              </div>

              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                Deadline: {goal.deadline}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Career Asset Scorecard */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Career Asset Scorecard
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Evaluates every career instrument required to win tier-1 job offers.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {assetScorecard.map((asset, i) => (
            <div 
              key={i}
              onClick={() => onNavigate(asset.view)}
              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)] cursor-pointer transition-colors space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">{asset.name}</h4>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  asset.status === 'Complete' 
                    ? 'bg-emerald-500/10 text-emerald-600'
                    : 'bg-amber-500/10 text-amber-600'
                }`}>
                  {asset.status}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">{asset.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Career Milestones & Career Timeline Dual Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Career Milestones */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Milestones ({milestones.length})
              </h2>
            </div>
            <button
              onClick={() => setAddMilestoneModalOpen(true)}
              className="p-1 rounded-md hover:bg-[var(--surface-secondary)] text-[var(--accent-primary)] font-bold text-xs"
              title="Add Milestone"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            {milestones.map((m) => (
              <div 
                key={m.id}
                className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text-primary)]">{m.title}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                  <span>{m.category.toUpperCase()}</span>
                  <span>{m.dateAchieved}</span>
                </div>
                {m.notes && (
                  <p className="text-[11px] text-[var(--text-secondary)]">{m.notes}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chronological Career Timeline */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--accent-primary)]" />
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Career Timeline
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Chronological trail synthesized directly from verified career records.
                </p>
              </div>
            </div>
          </div>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border-subtle)]">
            {timelineEvents.map((ev) => {
              const Icon = ev.icon;
              return (
                <div key={ev.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-[var(--surface-main)] border-2 border-[var(--accent-primary)] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                  </div>

                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] group-hover:border-[var(--accent-primary)]/40 transition-colors space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                      <span>{ev.type} • {ev.date}</span>
                      <span className="font-semibold text-[var(--accent-primary)] capitalize">{ev.status}</span>
                    </div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {ev.title}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      {ev.subtitle}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MODAL: Add Secondary Goal */}
      {addGoalModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Add Secondary Career Goal</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Goal Title</label>
                <input
                  type="text"
                  value={goalForm.title}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Master E2E testing with Playwright"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={goalForm.description}
                  onChange={(e) => setGoalForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Deliverable and milestones..."
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Priority</label>
                  <select
                    value={goalForm.priority}
                    onChange={(e: any) => setGoalForm(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Deadline</label>
                  <input
                    type="date"
                    value={goalForm.deadline}
                    onChange={(e) => setGoalForm(prev => ({ ...prev, deadline: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setAddGoalModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleSaveGoal} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">Save Goal</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Record Milestone */}
      {addMilestoneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-main)] rounded-2xl border border-[var(--border-subtle)] shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">Record Career Milestone</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Milestone Title</label>
                <input
                  type="text"
                  value={milestoneForm.title}
                  onChange={(e) => setMilestoneForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. First Tech Lead Promotion"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Category</label>
                  <select
                    value={milestoneForm.category}
                    onChange={(e: any) => setMilestoneForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  >
                    <option value="role">New Role</option>
                    <option value="promotion">Promotion</option>
                    <option value="internship">Internship</option>
                    <option value="certification">Certification</option>
                    <option value="project">Project</option>
                    <option value="application">Application</option>
                    <option value="interview">Interview</option>
                    <option value="offer">Job Offer</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[var(--text-primary)] block mb-1">Date Achieved</label>
                  <input
                    type="date"
                    value={milestoneForm.dateAchieved}
                    onChange={(e) => setMilestoneForm(prev => ({ ...prev, dateAchieved: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-[var(--text-primary)] block mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={milestoneForm.notes}
                  onChange={(e) => setMilestoneForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Scored 100% on architecture review"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button onClick={() => setAddMilestoneModalOpen(false)} className="px-3 py-1.5 text-xs text-[var(--text-secondary)]">Cancel</button>
              <button onClick={handleSaveMilestone} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-white rounded-lg text-xs font-semibold">Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
