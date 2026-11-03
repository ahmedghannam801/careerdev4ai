import React, { useEffect, useMemo, useState } from 'react';
import { Check, Sparkles, Target, BarChart3, BookOpen, FolderGit2, HeartHandshake, FileText, ArrowRight, Loader2, Search, Send, Bot, TrendingUp, Settings } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { CareerState, CareerGoal } from '../../types/career';
import { Reveal } from '../motion/Motion';
import { TargetRolePicker } from '../career/TargetRolePicker';
import { BuiltCvPanel } from '../cv/BuiltCvPanel';
import { fetchPersonalizedRoadmap, fetchVolunteerOpportunities, type VolunteerOpportunity } from '../../lib/personalizationApi';
import {
  computeSkillGaps,
  normalizeSkillName,
  summarizeSkillGaps,
  toRoleSkillRequirements,
} from '../../../shared/skillGap';

interface OnboardingViewProps {
  onComplete: () => void;
}

/** The steps of the guided setup, in order. */
const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: Sparkles },
  { id: 'direction', title: 'Your direction', icon: Target },
  { id: 'goal', title: 'Your goal', icon: BarChart3 },
  { id: 'role', title: 'Your target role', icon: Target },
  { id: 'assessment', title: 'Skill assessment', icon: BarChart3 },
  { id: 'gap', title: 'Your skill gap', icon: BarChart3 },
  { id: 'roadmap', title: 'Your roadmap', icon: BarChart3 },
  { id: 'learning', title: 'Learning', icon: BookOpen },
  { id: 'projects', title: 'Projects & volunteering', icon: FolderGit2 },
  { id: 'cv', title: 'Your CV', icon: FileText },
  { id: 'jobs', title: 'Find jobs', icon: Search },
  { id: 'applications', title: 'Applications and cover letters', icon: Send },
  { id: 'assistant', title: 'AI assistant', icon: Bot },
  { id: 'progress', title: 'Progress and next actions', icon: TrendingUp },
  { id: 'settings', title: 'Notifications, settings and help', icon: Settings },
] as const;

const PERSONAS = [
  { id: 'student', title: 'Student', desc: 'Focusing on fundamentals, first internships, coursework, and portfolio building.' },
  { id: 'fresh_graduate', title: 'Fresh Graduate', desc: 'Recent graduate bridging academic knowledge to industry expectations.' },
  { id: 'working_professional', title: 'Working Professional', desc: 'Currently employed and looking for promotion, higher impact, or specialization.' },
  { id: 'career_switcher', title: 'Career Switcher', desc: 'Transitioning from another domain with valuable transferable skills.' },
  { id: 'exploring', title: 'Exploring', desc: 'Unsure of your final direction and looking to compare viable career paths.' },
];

const GOALS = [
  { id: 'get_first_job', label: 'Land First Full-Time Job' },
  { id: 'get_internship', label: 'Secure a Summer Internship' },
  { id: 'get_promoted', label: 'Get Promoted to Mid/Senior' },
  { id: 'switch_career', label: 'Transition into Tech / New Field' },
  { id: 'become_specialist', label: 'Become a Deep Domain Specialist' },
  { id: 'become_manager', label: 'Move into Engineering / Product Management' },
  { id: 'build_portfolio', label: 'Build a Verifiable Portfolio' },
  { id: 'freelance', label: 'Build a Freelance Practice' },
  { id: 'explore_careers', label: 'Explore & Compare Roles' },
  { id: 'custom', label: 'Set a Custom Goal' },
];

const PRIORITY_CLASS: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-500',
  high: 'bg-orange-500/15 text-orange-500',
  medium: 'bg-amber-500/15 text-amber-600',
  low: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  sufficient: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
};

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const {
    profile,
    updateProfile,
    setCareerState,
    setCareerGoal,
    setPrimaryTargetRole,
    skills,
    updateSkillLevel,
    targetRole,
    learningRecommendations,
    projects,
    t,
  } = useCareer();

  const [step, setStep] = useState<number>(() => Math.min(profile.onboardingStep ?? 0, STEPS.length - 1));
  const [selectedPersona, setSelectedPersona] = useState<CareerState>(profile.careerState || 'working_professional');
  const [currentTitle, setCurrentTitle] = useState(profile.currentTitle || '');
  const [location, setLocation] = useState(profile.location || '');
  const [selectedGoal, setSelectedGoal] = useState<CareerGoal>(profile.careerGoal || 'get_promoted');
  const [customGoal, setCustomGoal] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(targetRole?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<{
    title: string;
    totalTasks: number;
    estimatedHours: number;
    readinessPct: number;
    phases: { title: string; description: string }[];
  } | null>(null);
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);

  // The step index is the single source of truth for the progress bar.
  const stepCount = STEPS.length;
  const current = STEPS[Math.min(step, stepCount - 1)];

  // The server is the source of truth for first-run progress. This makes the
  // flow resumable across reloads and devices; a reopened tour can start at
  // step zero by resetting this same persisted step.
  useEffect(() => {
    void updateProfile({
      onboardingStatus: 'started',
      onboardingStep: step,
    }).catch(() => {
      // The actual Continue action reports persistence errors. This best-effort
      // write keeps back-navigation and reloads resumable without trapping the
      // person on an informational step.
    });
  }, [step]);

  // The gap analysis, computed with the same engine the server uses.
  const gapAnalysis = useMemo(() => {
    if (!targetRole) return null;
    const requirements = toRoleSkillRequirements(targetRole);
    const gaps = computeSkillGaps(
      requirements,
      skills.map((skill) => ({ name: skill.name, level: skill.currentLevel })),
    );
    return {
      gaps,
      summary: summarizeSkillGaps(gaps, requirements),
      byName: new Map(gaps.map((gap) => [normalizeSkillName(gap.name), gap])),
    };
  }, [targetRole, skills]);

  // The roadmap preview is fetched once the role is chosen.
  useEffect(() => {
    if (step !== 6) return;
    let cancelled = false;
    fetchPersonalizedRoadmap()
      .then((response) => {
        if (cancelled || !response.plan) return;
        setPlanPreview({
          title: response.plan.title,
          totalTasks: response.plan.summary.totalTasks,
          estimatedHours: response.plan.summary.estimatedHours,
          readinessPct: response.plan.summary.readinessPct,
          phases: response.plan.phases.map((phase) => ({
            title: phase.title,
            description: phase.description ?? '',
          })),
        });
      })
      .catch(() => {
        // A missing preview is not a failure: the roadmap is regenerated on
        // the next visit to the Roadmap screen anyway.
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  // The volunteering catalogue, for the discovery step.
  useEffect(() => {
    if (step !== 8) return;
    let cancelled = false;
    fetchVolunteerOpportunities()
      .then((response) => {
        if (!cancelled) setOpportunities(response.opportunities ?? []);
      })
      .catch(() => {
        // The step still explains what volunteering is for without the list.
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const handleNext = async () => {
    if (isSaving) return;
    if (step === 2 && selectedGoal === 'custom' && !customGoal.trim()) {
      setSaveError('Please describe your custom goal before continuing.');
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      if (step === 1) {
        await setCareerState(selectedPersona);
        await updateProfile({ currentTitle, location });
        setStep(2);
      } else if (step === 2) {
        await setCareerGoal(
          selectedGoal,
          selectedGoal === 'custom' ? customGoal.trim() : ''
        );
        setStep(3);
      } else if (step === 3) {
        if (!selectedRoleId) {
          setSaveError('Choose the role you are targeting before continuing.');
          return;
        }
        const persisted = await setPrimaryTargetRole(selectedRoleId);
        if (!persisted) {
          throw new Error('The target role and roadmap were not persisted');
        }
        setStep(4);
      } else if (step < stepCount - 1) {
        setStep(step + 1);
      } else {
        await updateProfile({
          onboardingCompleted: true,
          onboardingStatus: 'completed',
          onboardingStep: stepCount - 1,
        });
        onComplete();
      }
    } catch (error) {
      console.error('Onboarding step could not be saved:', error);
      setSaveError('We could not save this step. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (!isSaving && step > 0) setStep(step - 1);
  };

  const handleSkip = async () => {
    if (isSaving) return;
    const confirmed = window.confirm(
      t('Skip the getting-started tour? You can restart it later from Settings.')
    );
    if (!confirmed) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateProfile({
        onboardingCompleted: true,
        onboardingStatus: 'skipped',
        onboardingStep: step,
      });
      onComplete();
    } catch (error) {
      console.error('Onboarding skip could not be saved:', error);
      setSaveError(t('We could not save this choice. Check your connection and try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] flex flex-col justify-between py-12 px-6">
      <div className="max-w-2xl w-full mx-auto space-y-8">
        {/* Step Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-medium text-[var(--color-primary-text)]">
              STEP {step + 1} OF {stepCount}
            </span>
            <span>{current.title}</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--color-progress-track)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-progress-strong)] transition-all duration-300"
              style={{ width: `${((step + 1) / stepCount) * 100}%` }}
            />
          </div>
        </div>

        {/* STEP 1: WELCOME */}
        {step === 0 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-3">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Let\'s build your career path')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                CareerDev4AI works from one thing: the career you pick. Everything else — your
                roadmap, the courses, the projects, the volunteering and your CV — is built from
                the role you choose and the skills you actually have.
              </p>
            </div>
            <ul className="space-y-2">
              {[
                'Pick the role you are aiming at',
                'Tell us what you can already do',
                'Get a roadmap built from your real gaps',
                'Find the courses, projects and volunteering that close them',
                'Assemble a CV from what you have actually done',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        {/* STEP 2: CAREER DIRECTION */}
        {step === 1 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Where are you right now?')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Select the career persona that best matches your current life stage, and tell us
                your current title and where you are based.
              </p>
            </div>

            <div className="space-y-3">
              {PERSONAS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedPersona(item.id as CareerState)}
                  className={`w-full p-4 rounded-xl border text-start transition-all flex items-start justify-between ${
                    selectedPersona === item.id
                      ? 'bg-[var(--accent-surface)]/60 border-[var(--accent-primary)] text-[var(--text-primary)] shadow-xs'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="space-y-1 pe-4">
                    <div className="font-semibold text-sm">{item.title}</div>
                    <div className="text-xs text-[var(--text-secondary)] leading-relaxed">{item.desc}</div>
                  </div>
                  {selectedPersona === item.id && (
                    <Check className="w-4 h-4 text-[var(--color-primary-text)]" />
                  )}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">{t('Current title')}</span>
                <input
                  value={currentTitle}
                  onChange={(event) => setCurrentTitle(event.target.value)}
                  placeholder={t('e.g. Support Specialist')}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">{t('Location')}</span>
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder={t('e.g. Manchester, UK')}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
            </div>
          </Reveal>
        )}

        {/* STEP 3: GOAL */}
        {step === 2 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('What are you working towards?')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {t('This shapes the advice the assistant gives you.')}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GOALS.map((goal) => (
                <button
                  key={goal.id}
                  onClick={() => setSelectedGoal(goal.id as CareerGoal)}
                  className={`p-3.5 rounded-xl border text-start text-sm transition-all flex items-center justify-between gap-2 ${
                    selectedGoal === goal.id
                      ? 'bg-[var(--accent-surface)]/60 border-[var(--accent-primary)] font-medium text-[var(--text-primary)]'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <span>{goal.label}</span>
                  {selectedGoal === goal.id && (
                    <Check className="w-3.5 h-3.5 shrink-0 text-[var(--color-primary-text)]" />
                  )}
                </button>
              ))}
            </div>
            {selectedGoal === 'custom' && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--text-secondary)]">{t('Your goal')}</span>
                <input
                  value={customGoal}
                  onChange={(event) => setCustomGoal(event.target.value)}
                  placeholder={t('Describe what you are aiming for')}
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>
            )}
          </Reveal>
        )}

        {/* STEP 4: TARGET ROLE */}
        {step === 3 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Pick the role you are aiming at')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Choose a field, then a specialisation. This is the role everything else is built
                around.
              </p>
            </div>
            <TargetRolePicker
              selectedRoleId={selectedRoleId}
              onSelect={(role) => setSelectedRoleId(role.id)}
            />
          </Reveal>
        )}

        {/* STEP 5: SKILL ASSESSMENT */}
        {step === 4 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('What can you already do?')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Rate yourself on the skills {targetRole?.title ?? 'this role'} asks for. Be
                honest: a low rating here is what puts the right work at the top of your roadmap.
              </p>
            </div>
            <div className="space-y-3">
              {(targetRole?.requiredSkills ?? []).map((required) => {
                const key = normalizeSkillName(required.name);
                const rated = skills.find(
                  (skill) => normalizeSkillName(skill.name) === key
                );
                const level = rated?.currentLevel ?? 1;
                return (
                  <div
                    key={required.name}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {required.name}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">
                        {level}/5 · target {required.minLevel}/5
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={level}
                      onChange={(event) => {
                        const next = Number(event.target.value);
                        if (rated) updateSkillLevel(rated.id, next);
                      }}
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                    {rated ? null : (
                      <p className="text-[10px] text-[var(--text-muted)]">
                        {t('Add this skill in the Skills Center to rate it.')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Reveal>
        )}

        {/* STEP 6: THE SKILL GAP */}
        {step === 5 && gapAnalysis && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Here is exactly where you stand')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                You meet {gapAnalysis.summary.readinessPct}% of what {targetRole?.title} asks for.
                These are the gaps, most urgent first.
              </p>
            </div>
            <div className="space-y-2">
              {gapAnalysis.gaps
                .filter((gap) => gap.gap > 0)
                .map((gap) => (
                  <div
                    key={gap.name}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {gap.name}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                            PRIORITY_CLASS[gap.priority] ?? PRIORITY_CLASS.low
                          }`}
                        >
                          {t(gap.priority)}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {gap.currentLevel}/5 now → {gap.requiredLevel}/5 needed
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {gapAnalysis.summary.open === 0 && (
              <p className="text-sm text-[var(--text-secondary)]">
                You already meet every requirement for this role. Your roadmap will focus on
                applying and evidencing it.
              </p>
            )}
          </Reveal>
        )}

        {/* STEP 7: THE ROADMAP */}
        {step === 6 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Your roadmap is ready')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Built from your role and your gaps, not from a template. Every step names the skill
                it closes and what has to come first.
              </p>
            </div>
            {planPreview ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {[
                    { label: 'Steps', value: String(planPreview.totalTasks) },
                    { label: 'Hours', value: String(planPreview.estimatedHours) },
                    { label: 'Ready', value: `${planPreview.readinessPct}%` },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="p-2 sm:p-3 min-w-0 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] text-center"
                    >
                      <div className="text-lg font-bold font-mono text-[var(--color-primary-text)]">
                        {stat.value}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{stat.label}</div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {planPreview.phases.map((phase, index) => (
                    <div
                      key={phase.title}
                      className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-1"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-primary-text)] font-bold">
                        PHASE {index + 1}
                      </div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {phase.title}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)]">{phase.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 text-sm text-[var(--text-secondary)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('Building your roadmap…')}
              </div>
            )}
          </Reveal>
        )}

        {/* STEP 8: LEARNING */}
        {step === 7 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Courses picked for your gaps')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Every recommendation is scored against the skills you are missing. Open the Learning
                Hub for the full list and to track what you finish.
              </p>
            </div>
            <div className="space-y-2">
              {learningRecommendations.slice(0, 4).map((rec) => (
                <div
                  key={rec.course.id}
                  className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-1"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {rec.course.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--accent-primary)]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-primary-text)]">
                      {Math.round(rec.score)}%
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {rec.course.provider} · {rec.reason}
                  </div>
                </div>
              ))}
              {learningRecommendations.length === 0 && (
                <p className="text-sm text-[var(--text-secondary)]">
                  {t('Rate your skills and we will match real courses to the gaps.')}
                </p>
              )}
            </div>
          </Reveal>
        )}

        {/* STEP 9: PROJECTS AND VOLUNTEERING */}
        {step === 8 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Prove it with work')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                A project and a volunteering stint are worth more on a CV than another
                certificate. Both are tracked here, and both feed your CV.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2">
                <FolderGit2 className="h-4 w-4 text-[var(--color-primary-text)]" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">{t('Projects')}</div>
                <div className="text-xs text-[var(--text-secondary)]">
                  You have {projects.length} project{projects.length === 1 ? '' : 's'} recorded.
                  {targetRole
                    ? ` The Projects screen suggests the ones that match ${targetRole.title}.`
                    : ''}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-2">
                <HeartHandshake className="h-4 w-4 text-[var(--color-primary-text)]" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {t('Volunteering')}
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {opportunities.length > 0
                    ? `${opportunities.length} real organisations you can apply to, matched to your gaps.`
                    : 'Real organisations you can apply to, matched to your gaps.'}
                </div>
              </div>
            </div>
            {opportunities.length > 0 && (
              <div className="space-y-2">
                {opportunities.slice(0, 3).map((opportunity) => (
                  <div
                    key={opportunity.id}
                    className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] space-y-1"
                  >
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {opportunity.title}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {opportunity.organization}
                      {opportunity.relevanceReason ? ` · ${opportunity.relevanceReason}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Reveal>
        )}

        {/* STEP 10: THE CV */}
        {step === 9 && (
          <Reveal onMount delay={0.04} className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t('Your CV, from your own data')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Assembled from the experience, skills, projects, volunteering and courses you have
                entered. Nothing is invented to fill a gap.
              </p>
            </div>
            <BuiltCvPanel />
          </Reveal>
        )}

        {step >= 10 && (
          <Reveal onMount delay={0.04} className="space-y-5">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                {t(current.title)}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {t([
                  'Browse the Jobs area for opportunities that fit your target role. Save roles you want to return to and compare them against your skills and CV.',
                  'Track each application in Applications, and create a cover letter for a specific role. Keep the job description with the application so you can revisit your preparation.',
                  'Use the AI assistant from the Copilot button when you want help planning, understanding a skill gap, or preparing career materials. Review its suggestions before using them.',
                  'Your Dashboard and Progress views help you see completed roadmap tasks, current priorities, and practical next actions. Update progress as you build evidence.',
                  'Notifications keep important account updates visible. Settings is where you can manage preferences and reopen this tour using “Show me around again”.',
                ][step - 10])}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-4 text-xs text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{t('Where to go:')}</span>{' '}
              {t([
                'Open Jobs from the main navigation.',
                'Open Applications from the main navigation; cover letters are available in the application workflow.',
                'Use the Copilot button in the app shell.',
                'Start at Dashboard, then open Roadmap or Progress for the detailed view.',
                'Open Notifications or Settings from the app navigation.',
              ][step - 10])}
            </div>
          </Reveal>
        )}

        {saveError && (
          <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/8 px-3.5 py-2.5 text-xs text-[var(--color-danger)]">
            {saveError}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="max-w-2xl w-full mx-auto flex items-center justify-between gap-3 pt-8">
        <button
          onClick={handleBack}
          disabled={isSaving || step === 0}
          className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] disabled:opacity-40"
        >
          {t('Back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSkip()}
            disabled={isSaving}
            className="rounded-lg px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] disabled:opacity-50"
          >
            {t('Skip tour')}
          </button>
          <button
            onClick={handleNext}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold disabled:opacity-50"
          >
            {isSaving ? t('Saving…') : step === stepCount - 1 ? t('Finish setup') : t('Continue')}
            <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
};
