import React, { useState } from 'react';
import { 
  Compass, 
  ArrowRight, 
  Target, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Award, 
  FolderGit2, 
  Briefcase, 
  Calendar, 
  Plus, 
  X, 
  ChevronRight,
  ShieldCheck,
  Star
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { MilestoneCategory, CareerGoal } from '../../types/career';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';

/**
 * Plain-language rendering of the career goals the user can pick. Used so the
 * Primary Goal card can describe the user's own goal instead of a fixed
 * sentence about somebody else's career.
 */
const CAREER_GOAL_LABELS: Record<CareerGoal, string> = {
  get_first_job: 'Land a first full-time role',
  get_internship: 'Secure an internship',
  get_promoted: 'Get promoted',
  switch_career: 'Switch careers',
  become_specialist: 'Become a domain specialist',
  become_manager: 'Move into management',
  build_portfolio: 'Build a verifiable portfolio',
  freelance: 'Go freelance',
  explore_careers: 'Explore career options',
  custom: 'Reach a custom goal'
};

/**
 * Parses a date into a timestamp, treating a plain "YYYY-MM-DD" as a LOCAL
 * day rather than UTC midnight. The deadline filter and the deadline
 * formatter must agree, or a deadline set for today silently disappears for
 * users behind UTC.
 */
const parseLocalDate = (value: string): number => {
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = dayOnly
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
    : new Date(value);
  return parsed.getTime();
};

/** Formats a "YYYY-MM-DD" (or ISO) date as a readable date. */
const formatGoalDate = (value: string): string => {
  const parsed = new Date(parseLocalDate(value));
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

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
    cvVersions,
    addSecondaryGoal,
    deleteSecondaryGoal,
    milestones,
    addMilestone,
    careerBlockers,
    learningItems,
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

  // Unified Career Timeline Events
  const timelineEvents = [
    ...profile.education.map(e => ({
      id: `timeline-edu-${e.id}`,
      year: e.startDate.slice(0, 4) || '',
      date: e.startDate,
      type: 'Education',
      title: `${e.degree} in ${e.field}`,
      subtitle: e.institution,
      status: 'completed',
      icon: Award
    })),
    ...profile.experiences.map(e => ({
      id: `timeline-exp-${e.id}`,
      year: e.startDate.slice(0, 4) || '',
      date: e.startDate,
      type: 'Experience',
      title: `${e.role} at ${e.company}`,
      subtitle: e.employmentType,
      status: e.isCurrent ? 'current' : 'completed',
      icon: Briefcase
    })),
    ...profile.certifications.map(c => ({
      id: `timeline-cert-${c.id}`,
      year: c.issueDate.slice(0, 4) || '',
      date: c.issueDate,
      type: 'Certification',
      title: c.name,
      subtitle: c.provider,
      status: 'completed',
      icon: Award
    })),
    ...projects.map(p => ({
      id: `timeline-proj-${p.id}`,
      year: p.createdAt.slice(0, 4) || '',
      date: p.createdAt,
      type: 'Project',
      title: p.title,
      subtitle: p.difficulty,
      status: p.status,
      icon: FolderGit2
    })),
    ...applications.map(a => ({
      id: `timeline-app-${a.id}`,
      year: a.appliedDate?.slice(0, 4) || '',
      date: a.appliedDate || a.lastUpdated,
      type: 'Application',
      title: `${a.role} at ${a.company}`,
      subtitle: `Stage: ${a.stage.toUpperCase()}`,
      status: a.stage,
      icon: Calendar
    }))
  ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // The ATS score of the newest CV snapshot, if the user has one.
  const latestCvAtsScore = cvVersions[0]?.atsAnalysis?.overallScore ?? null;

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
      status: latestCvAtsScore !== null ? 'Complete' : 'Needs Improvement',
      desc: latestCvAtsScore !== null
        ? `ATS Match Score: ${latestCvAtsScore}% tailored for ${targetRole.title}`
        : 'No ATS score yet — run an ATS audit in CV Studio',
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
  // The interview step shows the user's own in-flight interview, if any.
  const nextInterview = applications.find(a => ['interview', 'technical', 'final'].includes(a.stage));
  const nextInterviewLabel = nextInterview ? nextInterview.company : 'No interview yet';
  const interviewCount = applications.filter(a => ['interview', 'technical', 'final'].includes(a.stage)).length;
  const offerApplication = applications.find(a => a.stage === 'offer');

  // The primary goal is described entirely from the user's own state: the
  // role they selected, the goal they picked, and the work still open.
  const goalLabel = CAREER_GOAL_LABELS[profile.careerGoal] ?? 'Advance your career';
  const customGoal = profile.customGoalText?.trim() || '';
  const primaryGoalTitle = customGoal || `Become a ${targetRole.title}`;
  const primaryGoalDescription = customGoal
    ? `Your stated goal: "${customGoal}" — working toward a ${targetRole.title} role.`
    : `${goalLabel} — working toward a ${targetRole.title} role.`;

  // The next action is the first roadmap task the user has not finished.
  const openRoadmapTasks = roadmapPhases
    .flatMap(p => p.milestones.flatMap(m => m.tasks))
    .filter(t => t.status !== 'completed' && t.status !== 'skipped');
  const nextRoadmapTask = openRoadmapTasks[0];

  // The next real deadline the user has set, if any.
  const candidateDeadlines = [
    ...secondaryGoals
      .filter(g => g.status === 'active' && !!g.deadline)
      .map(g => g.deadline),
    ...openRoadmapTasks.map(t => t.deadline).filter((d): d is string => !!d)
  ];
  const startOfToday = new Date(new Date().toDateString()).getTime();
  const nextDeadline = candidateDeadlines
    .filter(d => !Number.isNaN(parseLocalDate(d)))
    .filter(d => parseLocalDate(d) >= startOfToday)
    .sort()[0];

  // Derive real dynamic journey stages:
  // 1. Direction: completed if user selected target role and career goal
  const isDirectionDone = Boolean(targetRole.title && profile.careerGoal);
  
  // 2. Skill Gaps: completed if Direction done AND skills recorded or gap analysis performed
  const isSkillsDone = isDirectionDone && (skills.length > 0 || analysis.criticalGaps.length > 0 || analysis.strengths.length > 0);
  
  // 3. Roadmap: completed if Skill Gaps done AND user has a roadmap mapped
  const isRoadmapDone = isSkillsDone && roadmapPhases.length > 0;
  
  // 4. Learning: completed if Roadmap done AND user has learning progress
  const completedRoadmapTasksCount = roadmapPhases
    .flatMap(p => p.milestones.flatMap(m => m.tasks))
    .filter(t => t.status === 'completed').length;
  const isLearningDone = isRoadmapDone && (learningItems.length > 0 || completedRoadmapTasksCount > 0);
  
  // 5. Projects: completed if Learning done AND user has projects
  const isProjectsDone = isLearningDone && projects.length > 0;
  
  // 6. Evidence: completed if Projects done AND user has verified evidence items
  const isEvidenceDone = isProjectsDone && evidenceItems.length > 0;
  
  // 7. CV: completed if Evidence done AND user has CV versions created or tailored
  const isCvDone = isEvidenceDone && cvVersions.length > 0;
  
  // 8. Opportunity: completed if CV done AND user has an offer or active applications/interviews
  const isOpportunityDone = isCvDone && (Boolean(offerApplication) || applications.length > 0);

  // Determine active stage: first incomplete stage in sequence
  let activeStageKey = 'direction';
  if (!isDirectionDone) activeStageKey = 'direction';
  else if (!isSkillsDone) activeStageKey = 'skills';
  else if (!isRoadmapDone) activeStageKey = 'roadmap';
  else if (!isLearningDone) activeStageKey = 'learning';
  else if (!isProjectsDone) activeStageKey = 'projects';
  else if (!isEvidenceDone) activeStageKey = 'evidence';
  else if (!isCvDone) activeStageKey = 'cv';
  else if (!isOpportunityDone) activeStageKey = 'opportunity';
  else activeStageKey = 'opportunity';

  const journeySteps = [
    { key: 'direction', label: 'Direction', desc: targetRole.title || 'Target role & goals', active: activeStageKey === 'direction', done: isDirectionDone },
    { key: 'skills', label: 'Skill Gaps', desc: `${analysis.criticalGaps.length} critical gaps`, active: activeStageKey === 'skills', done: isSkillsDone },
    { key: 'roadmap', label: 'Roadmap', desc: roadmapPhases.length > 0 ? `${roadmapPhases.length} Phases Active` : 'Generate roadmap', active: activeStageKey === 'roadmap', done: isRoadmapDone },
    { key: 'learning', label: 'Learning', desc: learningItems.length > 0 ? `${learningItems.length} Courses Active` : completedRoadmapTasksCount > 0 ? `${completedRoadmapTasksCount} Tasks Done` : 'Course recommendations', active: activeStageKey === 'learning', done: isLearningDone },
    { key: 'projects', label: 'Projects', desc: `${projects.length} Projects`, active: activeStageKey === 'projects', done: isProjectsDone },
    { key: 'evidence', label: 'Evidence', desc: `${evidenceItems.length} Artifacts`, active: activeStageKey === 'evidence', done: isEvidenceDone },
    { key: 'cv', label: 'CV', desc: cvVersions.length > 0 ? `${cvVersions.length} Versions` : 'Tailor CV', active: activeStageKey === 'cv', done: isCvDone },
    { key: 'opportunity', label: 'Opportunity', desc: offerApplication ? 'Offer Received' : nextInterview ? `Interview: ${nextInterviewLabel}` : applications.length > 0 ? `${applications.length} Apps (${interviewCount} Int)` : 'Job pipeline', active: activeStageKey === 'opportunity', done: isOpportunityDone },
  ];

  const handleSaveGoal = () => {
    if (!goalForm.title.trim()) return;
    addSecondaryGoal({
      title: goalForm.title.trim(),
      description: goalForm.description.trim(),
      priority: goalForm.priority,
      deadline: goalForm.deadline || '',
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
    <Reveal className="space-y-8">
      {/* Top Banner: Where Am I in My Journey? */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--accent-surface)] text-[var(--color-primary-text)] text-xs font-semibold">
              <Compass className="w-3.5 h-3.5" />
              <span>Career Journey Command</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              Where Am I in My Career Journey?
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl">
              You are currently transitioning from <strong className="text-[var(--text-primary)] capitalize">{profile.careerState.replace('_', ' ')}</strong> to a verified <strong className="text-[var(--color-primary-text)]">{targetRole.title}</strong>. Your current market match is at <strong className="text-[var(--color-success-strong)]">{analysis.matchPercentage}%</strong> with {interviewCount} active interview {interviewCount === 1 ? 'pipeline' : 'pipelines'}.
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
              className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span>View Active Roadmap</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 8-Step Visual Career Journey Map */}
        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Visual Career Journey Map
            </h3>
            <span className="text-xs font-mono font-bold text-[var(--color-primary-text)] bg-[var(--accent-surface)] px-2.5 py-0.5 rounded-full">
              {Math.round((journeySteps.filter(s => s.done).length / journeySteps.length) * 100)}% Complete
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {journeySteps.map((step, idx) => (
              <div 
                key={step.key}
                className={`p-3 rounded-xl border text-center transition-all ${
                  step.active 
                    ? 'bg-[var(--accent-surface)] border-[var(--accent-primary)] shadow-xs scale-102 ring-1 ring-[var(--accent-primary)]'
                    : step.done
                    ? 'bg-[var(--surface-main)] border-[var(--color-success-strong)]/40 text-[var(--text-primary)]'
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
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success-strong)]" />
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
            <AlertTriangle className="w-4 h-4 text-[var(--color-warning)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                What's Blocking You?
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Proactive diagnostic engine identifying constraints impeding your career progress.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-[var(--color-warning)] font-semibold px-2 py-0.5 rounded bg-[var(--color-warning)]/10">
            {careerBlockers.length} Active Blockers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {careerBlockers.map(blocker => (
            <div 
              key={blocker.id}
              className="p-4 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--color-warning)]/20 text-[var(--color-warning)] font-mono">
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
                className="self-start px-3 py-1.5 rounded-lg bg-[var(--surface-main)] hover:bg-[var(--accent-primary)] hover:text-[var(--color-on-primary)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--color-primary-text)] flex items-center gap-1.5 transition-colors shadow-2xs"
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
            <Target className="w-4 h-4 text-[var(--color-primary-text)]" />
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
            className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Secondary Goal</span>
          </button>
        </div>

        {/* Primary Goal Card */}
        <div className="p-5 rounded-xl border-2 border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]/20 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary-text)] font-mono">
                Primary Goal
              </span>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {primaryGoalTitle}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {primaryGoalDescription}
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--color-success-surface)] text-[var(--color-success-strong)] font-mono">
              Role Match ({analysis.matchPercentage}%)
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-[var(--color-progress-track)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-progress-strong)] rounded-full"
              style={{ width: `${analysis.matchPercentage}%` }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between text-xs text-[var(--text-secondary)] pt-1">
            {nextDeadline && (
              <span>Deadline: {formatGoalDate(nextDeadline)}</span>
            )}
            {nextRoadmapTask && (
              <span className="text-[var(--text-primary)] font-medium">Next Action: {nextRoadmapTask.title}</span>
            )}
          </div>
        </div>

        {/* Secondary Goals Grid */}
        <Stagger inView gap={0.06} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {secondaryGoals.map((goal) => (
            <StaggerItem 
              key={goal.id}
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)]/40 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md space-y-3"
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
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
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
                <div className="w-full h-1.5 rounded-full bg-[var(--color-progress-track)] overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-[var(--color-progress-strong)]"
                    style={{ width: `${goal.progressPercent}%` }}
                  />
                </div>
              </div>

              {goal.deadline && (
                <div className="text-[10px] text-[var(--text-muted)] font-mono">
                  Deadline: {goal.deadline}
                </div>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* Career Asset Scorecard */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--color-success-strong)]" />
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

        <Stagger inView gap={0.06} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {assetScorecard.map((asset, i) => (
            <StaggerItem 
              key={i}
              onClick={() => onNavigate(asset.view)}
              className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] hover:border-[var(--accent-primary)] cursor-pointer transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-[var(--text-primary)]">{asset.name}</h4>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  asset.status === 'Complete' 
                    ? 'bg-[var(--color-success-surface)] text-[var(--color-success-strong)]'
                    : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
                }`}>
                  {asset.status}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">{asset.desc}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* Career Milestones & Career Timeline Dual Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Personal Career Milestones */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-[var(--color-accent-strong)]" />
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Milestones ({milestones.length})
              </h2>
            </div>
            <button
              onClick={() => setAddMilestoneModalOpen(true)}
              className="p-1 rounded-md hover:bg-[var(--surface-secondary)] text-[var(--color-primary-text)] font-bold text-xs"
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
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success-strong)]" />
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
              <Clock className="w-4 h-4 text-[var(--color-primary-text)]" />
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
              return (
                <div key={ev.id} className="relative group">
                  {/* Dot */}
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-[var(--surface-main)] border-2 border-[var(--accent-primary)] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                  </div>

                  <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] group-hover:border-[var(--accent-primary)]/40 transition-colors space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono">
                      <span>{ev.type} • {ev.date}</span>
                      <span className="font-semibold text-[var(--color-primary-text)] capitalize">{ev.status}</span>
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
              <button onClick={handleSaveGoal} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--accent-secondary)] hover:shadow-sm transition-[background-color,box-shadow]">Save Goal</button>
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
              <button onClick={handleSaveMilestone} className="px-3.5 py-1.5 bg-[var(--accent-primary)] text-[var(--color-on-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--accent-secondary)] hover:shadow-sm transition-[background-color,box-shadow]">Record</button>
            </div>
          </div>
        </div>
      )}
    </Reveal>
  );
};
