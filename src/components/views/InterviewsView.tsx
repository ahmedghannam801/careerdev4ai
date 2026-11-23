import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  History,
  HelpCircle,
  MessageSquare,
  Mic,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useAIProcessing } from '../../lib/useAIProcessing';
import { getAccessToken } from '../../lib/supabase';
import { apiUrl } from '../../lib/native';
import {
  buildInterviewPlan,
  type InterviewPlanQuestion,
} from '../../data/interviewBank';
import { Reveal } from '../motion/Motion';
import { CareerImage } from '../ui/CareerImage';
import { LiveInterviewPanel } from '../interviews/LiveInterviewPanel';
import { useLiveInterviewHistory } from '../../lib/useLiveInterviewHistory';
import { BarChart, ChartCard, type ChartDatum } from '../charts';
import { computeInterviewReadiness } from '../../../shared/interviewReadiness';
import { cvReadinessFromVersions, roleReadinessFromSkills } from '../../../shared/careerMetrics';

interface InterviewFeedback {
  score?: number;
  strengths?: string[];
  improvements?: string[];
  starEvaluation?: {
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
  };
  suggestedAnswer?: string;
}

interface AnsweredQuestion {
  question: string;
  stage: 'behavioral' | 'technical';
  score: number | null;
}

/** The labels of the stored interview types. */
const LIVE_TYPE_LABELS: Record<string, string> = {
  hr: 'HR',
  technical: 'Technical',
  role: 'Role-based',
  behavioral: 'Behavioral',
  mixed: 'Mixed',
};

/** The labels of the languages a stored interview was held in. */
const LIVE_LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ar: 'Arabic',
  'ar-eg': 'Egyptian Arabic',
};

/** A duration in seconds as `m:ss`. */
function formatDuration(seconds: number | null): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** A stored ISO timestamp as a local date, or null when it cannot be read. */
function formatInterviewDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export const InterviewsView: React.FC = () => {
  const {
    t,
    targetRole,
    profile,
    skills,
    cvVersions,
    interviewSessions,
    saveInterviewSession,
    projects,
    volunteerExperiences,
    learningItems,
    learningCatalog,
    ownedSkills,
    aiPreferences,
  } = useCareer();

  const [plan, setPlan] = useState<InterviewPlanQuestion[] | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const { run: runAIProcessing, isRunning: isEvaluating, modal: aiProcessingModal } = useAIProcessing();
  const [showTransition, setShowTransition] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [answered, setAnswered] = useState<AnsweredQuestion[]>([]);
  // Set when the feedback was produced but the session could not be written to
  // the candidate's history, so the record is never implied to exist.
  const [sessionSaveError, setSessionSaveError] = useState<string | null>(null);

  // The live voice interviews the candidate has already completed. The list is
  // read from the same table the Progress Dashboard counts, through a shared
  // cache, so the two pages cannot disagree and neither pays for a second
  // request.
  const liveHistory = useLiveInterviewHistory();

  /**
   * The five dimensions of the report, averaged over every scored interview.
   *
   * One interview's report shows its own five numbers; this shows the pattern
   * across all of them, which is the only way to see which dimension the
   * candidate keeps scoring low. The average is of the reports that exist: an
   * interview that was not scored is not a zero in it.
   */
  const dimensionAverages: ChartDatum[] = useMemo(() => {
    const scored = liveHistory.sessions
      .map((session) => session.evaluation)
      .filter((evaluation): evaluation is NonNullable<typeof evaluation> => Boolean(evaluation));
    if (scored.length === 0) return [];

    const dimensions: Array<{ key: keyof (typeof scored)[number]; label: string }> = [
      { key: 'communication', label: 'Communication' },
      { key: 'technicalKnowledge', label: 'Technical knowledge' },
      { key: 'answerQuality', label: 'Answer quality' },
      { key: 'problemSolving', label: 'Problem solving' },
      { key: 'languageFluency', label: 'Language fluency' },
    ];

    return dimensions.map((dimension) => {
      const total = scored.reduce((sum, evaluation) => {
        const value = Number(evaluation[dimension.key]);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
      const average = Math.round((total / scored.length) * 10) / 10;
      return {
        key: dimension.key,
        label: t(dimension.label),
        value: average,
        hint: `${t(dimension.label)}: ${average} / 10 · ${t('average of')} ${scored.length} ${t('interviews')}`,
      };
    });
  }, [liveHistory.sessions, t]);

  const completedTraining = useMemo(() => {
    const courseById = new Map(learningCatalog.map((course) => [course.id, course]));
    return learningItems
      .filter((item) => item.status === 'completed')
      .map((item) => courseById.get(item.courseId))
      .filter((course): course is NonNullable<typeof course> => Boolean(course))
      .map((course) => ({ title: course.title, provider: course.provider }));
  }, [learningCatalog, learningItems]);

  const buildPlan = () =>
    buildInterviewPlan({
      role: targetRole,
      experiences: profile.experiences.map((entry) => ({
        role: entry.role,
        company: entry.company,
        achievements: entry.achievements,
        skillsUsed: entry.skillsUsed,
      })),
      projects: projects.map((entry) => ({
        title: entry.title,
        description: entry.description,
        skills: entry.skills,
      })),
      volunteering: volunteerExperiences.map((entry) => ({
        organization: entry.organization,
        role: entry.role,
        responsibilities: entry.responsibilities,
        achievements: entry.achievements,
        skills: entry.skills,
      })),
      completedTraining,
      ownedSkills: ownedSkills.map((skill) => skill.name),
    });

  const startInterview = () => {
    const nextPlan = buildPlan();
    setPlan(nextPlan);
    setQuestionIndex(0);
    setAnswer('');
    setFeedback(null);
    setShowTransition(false);
    setCompleted(false);
    setAnswered([]);
  };

  const currentQuestion = plan?.[questionIndex] ?? null;

  const resetForQuestion = (nextIndex: number) => {
    setQuestionIndex(nextIndex);
    setAnswer('');
    setFeedback(null);
  };

  const handleEvaluate = () => {
    if (!currentQuestion || !answer.trim() || isEvaluating) return;
    const question = currentQuestion;
    const userAnswer = answer.trim();

    void runAIProcessing({
      title: t('Evaluating your interview answer'),
      stage: t('Reviewing your answer and preparing feedback…'),
      run: async (signal, setPhase) => {
        const token = await getAccessToken();
        const res = await fetch(apiUrl('/api/mock-interview'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            roleTitle: targetRole?.title ?? '',
            interviewType: question.category,
            question: question.question,
            userAnswer,
            language: aiPreferences.preferredLanguage,
          }),
          signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.error ??
            t('The interviewer is unavailable right now. No feedback was generated — please try again shortly.')
          );
        }
        const result = (await res.json()) as InterviewFeedback;

        // The session is written to the candidate's record from here on. The
        // write cannot be abandoned halfway, so the request stops being
        // cancellable and the interface says so.
        setPhase(t('Saving the interview session…'), false);
        let saved = true;
        try {
          await saveInterviewSession({
            roleTitle: targetRole?.title ?? '',
            type: question.category,
            question: question.question,
            userAnswer,
            aiFeedback: {
              score: typeof result.score === 'number' ? result.score : 0,
              strengths: result.strengths ?? [],
              improvements: result.improvements ?? [],
              starEvaluation: result.starEvaluation
                ? {
                  situation: result.starEvaluation.situation ?? '',
                  task: result.starEvaluation.task ?? '',
                  action: result.starEvaluation.action ?? '',
                  result: result.starEvaluation.result ?? '',
                }
                : undefined,
              suggestedAnswer: result.suggestedAnswer ?? '',
            },
          });
        } catch {
          // The feedback itself is real, so it is still shown. What failed is
          // the save, and the candidate is told that it did.
          saved = false;
        }
        return { result, saved };
      },
      onSuccess: ({ result, saved }) => {
        setFeedback(result);
        setSessionSaveError(saved ? null : t('The feedback is shown, but this session could not be saved to your history.'));
        setAnswered((prev) => [
          ...prev,
          {
            question: question.question,
            stage: question.stage,
            score: typeof result.score === 'number' ? result.score : null,
          },
        ]);
      },
    });
  };

  const handleNext = () => {
    if (!plan || !currentQuestion) return;
    const next = plan[currentQuestion.index + 1];
    if (!next) {
      setCompleted(true);
      return;
    }
    resetForQuestion(next.index);
    if (next.stage !== currentQuestion.stage) {
      setShowTransition(true);
    }
  };

  const averageScore = useMemo(() => {
    const scored = answered.filter(
      (entry): entry is AnsweredQuestion & { score: number } => entry.score !== null
    );
    if (scored.length === 0) return null;
    return (
      scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length
    ).toFixed(1);
  }, [answered]);

  /**
   * The readiness figure, from the shared module.
   *
   * It used to be computed here as "the average rubric score, times ten" —
   * so a candidate who had practised one mock interview and scored 9/10 was
   * told they were 90% ready, and a candidate who had never practised was
   * told 0%. Readiness now weighs practice and performance together, and
   * reports "not measured yet" rather than a zero it cannot justify.
   *
   * The Progress page reads the same module, so the two pages cannot
   * disagree about the same number.
   */
  const readiness = useMemo(
    () =>
      computeInterviewReadiness(
        interviewSessions.map((session) => ({
          score: session.aiFeedback?.score ?? null,
          roleTitle: session.roleTitle ?? null,
        })),
        roleReadinessFromSkills(skills, cvReadinessFromVersions(cvVersions, targetRole?.title))
      ),
    [interviewSessions, skills, cvVersions, targetRole?.title]
  );

  const interviewReadinessPct = readiness.readinessPct ?? 0;

  const behavioralCount = plan?.filter((question) => question.stage === 'behavioral').length ?? 8;
  const technicalCount = plan?.filter((question) => question.stage === 'technical').length ?? 7;

  return (
    <Reveal className="space-y-8">
      {/*
        The live voice interview.

        It sits above the written mock interview because it is the fuller
        experience: the interviewer speaks, the candidate answers out loud,
        and the transcript is written from what was actually said.
      */}
      <LiveInterviewPanel
        roleTitle={targetRole?.title ?? ''}
        onCompleted={() => {
          // A finished conversation is a stored one, so the history is read
          // again rather than guessed at.
          void liveHistory.refresh();
        }}
      />

      {/*
        THE PATTERN ACROSS INTERVIEWS.

        A single report says how one answer went. This says which of the five
        dimensions the candidate keeps scoring low, which is what a practice
        plan can act on. It is drawn only from reports that exist.
      */}
      <ChartCard
        title={t('Where your interview scores stand')}
        description={t(
          'The average of each report dimension across every scored interview.'
        )}
        empty={dimensionAverages.length === 0}
        emptyMessage={t(
          'Complete a scored interview and its five dimensions appear here, averaged with every other scored interview.'
        )}
        footnote={t('Each dimension is scored out of ten by the interviewer.')}
        testId="interview-dimensions-chart"
      >
        <BarChart
          data={dimensionAverages}
          max={10}
          formatValue={(value) => `${value} / 10`}
          ariaLabel={t('Where your interview scores stand')}
        />
      </ChartCard>

      {/*
        THE VOICE INTERVIEW HISTORY.

        Every completed conversation is here, in the order the server returned
        it. A row opens to the transcript that was kept and the report written
        from it. Nothing is stored but the words — the audio was never kept, so
        there is none to play back.
      */}
      <section
        aria-labelledby="voice-interview-history"
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5"
        data-live-interview-history
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2
              id="voice-interview-history"
              className="flex items-center gap-2 text-base font-bold text-[var(--text-primary)]"
            >
              <Mic className="h-4 w-4 text-[var(--color-primary-text)]" />
              {t('Voice interview history')}
              <span className="font-mono text-xs font-semibold text-[var(--text-muted)]">
                ({liveHistory.sessions.length})
              </span>
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {t('Transcripts only — no audio was recorded.')}
            </p>
          </div>
        </div>

        {liveHistory.isLoading && liveHistory.sessions.length === 0 ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            {[0, 1].map((key) => (
              <div
                key={key}
                className="h-14 animate-pulse rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50"
              />
            ))}
          </div>
        ) : liveHistory.error ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-surface)]/40 p-3">
            <p className="text-[11px] text-[var(--color-danger)]">{t(liveHistory.error)}</p>
            <button
              type="button"
              onClick={() => void liveHistory.refresh()}
              className="rounded-lg border border-[var(--color-danger)]/40 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-danger)]"
            >
              {t('Try again')}
            </button>
          </div>
        ) : liveHistory.sessions.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-xs text-[var(--text-secondary)]">
            {t('No voice interview has been completed yet. Start one above and its transcript and report will appear here.')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {liveHistory.sessions.map((session) => {
              const score = session.evaluation?.score;
              const date = formatInterviewDate(session.completedAt ?? session.createdAt);
              const duration = formatDuration(session.durationSeconds);
              const typeLabel = LIVE_TYPE_LABELS[session.interviewType] ?? session.interviewType;
              const languageLabel = LIVE_LANGUAGE_LABELS[session.language] ?? session.language;
              const evaluation = session.evaluation;

              return (
                <details
                  key={session.id}
                  className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[var(--text-primary)]">
                        {t(typeLabel)}
                        {session.targetRole ? ` · ${session.targetRole}` : ''}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {date ? <span>{date}</span> : null}
                        <span>· {t(languageLabel)}</span>
                        {duration ? <span>· {duration}</span> : null}
                        <span>
                          · {session.transcript.length} {t('turns')}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {typeof score === 'number' ? (
                        <span className="rounded bg-[var(--accent-surface)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--color-primary-text)]">
                          {score}/10
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {t('No report')}
                        </span>
                      )}
                      <ChevronDown
                        aria-hidden="true"
                        className="h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      />
                    </div>
                  </summary>

                  <div className="space-y-3 border-t border-[var(--border-subtle)] p-3">
                    {evaluation ? (
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: t('Communication'), value: evaluation.communication },
                          { label: t('Technical knowledge'), value: evaluation.technicalKnowledge },
                          { label: t('Answer quality'), value: evaluation.answerQuality },
                          { label: t('Problem solving'), value: evaluation.problemSolving },
                          { label: t('Language fluency'), value: evaluation.languageFluency },
                        ].map((dimension) => (
                          <span
                            key={dimension.label}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                          >
                            {dimension.label}{' '}
                            <strong className="font-mono text-[var(--text-primary)]">
                              {dimension.value}/10
                            </strong>
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {session.transcript.length > 0 ? (
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          {t('Transcript')}
                        </div>
                        <ol className="mt-1.5 max-h-64 space-y-1.5 overflow-y-auto pe-1">
                          {session.transcript.map((turn, index) => {
                            const interviewer = turn.speaker === 'interviewer';
                            return (
                              <li
                                key={`${session.id}-turn-${index}`}
                                className={`rounded-lg border p-2 text-[11px] leading-relaxed ${
                                  interviewer
                                    ? 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-primary)]'
                                    : 'border-[var(--accent-primary)]/30 bg-[var(--accent-surface)]/40 text-[var(--text-primary)]'
                                }`}
                              >
                                <div className="mb-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                  {interviewer ? t('Interviewer') : t('You')}
                                </div>
                                {turn.text}
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ) : null}

                    {evaluation &&
                    (evaluation.strengths.length > 0 ||
                      evaluation.improvements.length > 0 ||
                      evaluation.trainingPlan.length > 0) ? (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          { title: t('Strengths'), items: evaluation.strengths },
                          { title: t('Areas to improve'), items: evaluation.improvements },
                          { title: t('Recommended training plan'), items: evaluation.trainingPlan },
                        ]
                          .filter((group) => group.items.length > 0)
                          .map((group) => (
                            <div key={group.title} className="rounded-lg border border-[var(--border-subtle)] p-2">
                              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                                {group.title}
                              </div>
                              <ul className="mt-1 list-disc space-y-0.5 ps-3.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                                {group.items.map((item, index) => (
                                  <li key={`${group.title}-${index}`}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border-subtle)] pb-2 md:flex-row md:items-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            {t('INTERVIEW READINESS LAB')}
          </div>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Adaptive Mock Interview')}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t(
              'One question at a time, adapted to your CV: behavioural and personal first, then technical questions for your target role.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-1.5">
            <span className="text-[var(--text-muted)]">{t('Interview Readiness')}: </span>
            <strong className="font-mono text-[var(--color-primary-text)]">{interviewReadinessPct}%</strong>
          </div>
          <div className="text-[var(--text-muted)]">
            {t('Target Role:')}{' '}
            <strong className="text-[var(--text-primary)]">{targetRole?.title ?? t('Not set')}</strong>
          </div>
        </div>
      </div>

      {/* Start screen */}
      {!plan && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div data-tour="interview-simulator" className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] lg:col-span-2">
            <div className="relative h-44 w-full overflow-hidden border-b border-[var(--border-subtle)] sm:h-52">
              <CareerImage
                src="/images/features/interview-prep.webp"
                alt="Interview preparation session"
                size="md"
                aspectRatio="21/9"
                rounded="rounded-none"
                className="h-full w-full object-cover"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface-main)] via-[var(--surface-main)]/35 to-transparent" />
                <div className="absolute bottom-3 start-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                    <BrainCircuit className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
                    {targetRole?.title ?? ''} {t('Interview Prep')}
                  </span>
                </div>
              </CareerImage>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-primary-text)]">
                <BrainCircuit className="h-4 w-4 shrink-0" />
                {t('Your interview plan')}
              </div>
              <h2 className="mt-2 text-lg font-bold text-[var(--text-primary)]">
                {t('15 questions, two stages')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {t(
                  'The first stage is behavioural and personal. It is built from your real experience, projects, volunteering, training and skills. The second stage is technical and follows your primary target role.'
                )}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    {t('Behavioural & personal')}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {behavioralCount} {t('questions')} · {t('adapted to your CV')}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                    <Target className="h-3.5 w-3.5 shrink-0" />
                    {t('Technical')}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                    {technicalCount} {t('questions')} · {targetRole?.title ?? ''}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={startInterview}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-90"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                {t('Start Mock Interview')}
              </button>
            </div>
          </div>

          <div data-tour="ai-mentor-panel" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6">
            <div className="flex items-center justify-between gap-2 text-sm font-bold text-[var(--text-primary)]">
              <span className="inline-flex items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
                {t('Recorded Mock Sessions')} ({interviewSessions.length})
              </span>
              <span className="text-xs font-mono text-[var(--color-primary-text)]">
                {interviewReadinessPct}%
              </span>
            </div>
            {interviewSessions.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {t('Interview readiness is 0% until you complete your first scored mock interview session.')}
              </p>
            ) : (
              <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pe-1">
                {interviewSessions.slice(0, 8).map((session) => (
                  <div
                    key={session.id}
                    className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 p-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 font-semibold text-[var(--text-primary)]">
                        {session.question}
                      </span>
                      {typeof session.aiFeedback?.score === 'number' && (
                        <span className="shrink-0 font-mono font-bold text-[var(--color-primary-text)]">
                          {session.aiFeedback.score}/10
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                      {session.roleTitle} · {session.createdAt}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Completion screen */}
      {plan && completed && (
        <section className="rounded-2xl border border-[var(--color-success-strong)]/30 bg-[var(--surface-main)] p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-success-strong)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t('Interview complete')}
          </div>
          <h2 className="mt-2 text-xl font-bold text-[var(--text-primary)]">
            {t('You completed all 15 questions.')}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {t('Answered')}: {answered.length} / {plan.length}
            {averageScore !== null && (
              <>
                {' · '}
                {t('Average score')}: {averageScore}/10
              </>
            )}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {t('Behavioural')}
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {answered.filter((entry) => entry.stage === 'behavioral').length}{' '}
                {t('answered')}
              </p>
            </div>
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                {t('Technical')}
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
                {answered.filter((entry) => entry.stage === 'technical').length} {t('answered')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={startInterview}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4 shrink-0" />
            {t('Practice Again')}
          </button>
        </section>
      )}

      {/* Transition screen */}
      {plan && !completed && showTransition && currentQuestion && (
        <section className="rounded-2xl border border-[var(--accent-primary)]/40 bg-gradient-to-br from-[var(--accent-surface)] via-[var(--surface-main)] to-[var(--surface-main)] p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-primary)]/15">
            <CheckCircle2 className="h-6 w-6 text-[var(--color-primary-text)]" />
          </div>
          <h2 className="mt-3 text-xl font-bold text-[var(--text-primary)]">
            {t('Behavioral Interview Complete')}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-[var(--text-secondary)]">
            {t(
              "Great. Now let's move to the Technical interview. The next questions are specific to"
            )}{' '}
            <strong className="text-[var(--text-primary)]">{targetRole?.title ?? ''}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setShowTransition(false)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-90"
          >
            {t('Start Technical Interview')}
            <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
          </button>
        </section>
      )}

      {/* Question screen */}
      {plan && !completed && !showTransition && currentQuestion && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-on-primary)]">
                  {t('Question')} {currentQuestion.index + 1} {t('of')} {plan.length}
                </span>
                <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                  {currentQuestion.stage === 'behavioral'
                    ? t('Behavioural & personal')
                    : t('Technical')}
                </span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {answered.length} {t('answered')}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-progress-track)]">
              <div
                className="h-full rounded-full bg-[var(--color-progress-strong)] transition-all"
                style={{ width: `${((currentQuestion.index + 1) / plan.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-xs">
            <h2 className="text-base font-bold leading-relaxed text-[var(--text-primary)]">
              {currentQuestion.question}
            </h2>
            {currentQuestion.personalization && (
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {t('Adapted from')}: {currentQuestion.personalization}
              </p>
            )}

            <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <HelpCircle className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary-text)]" />
                {t('Recommended Framework & Strategy')}
              </div>
              <p className="mt-1 leading-relaxed text-[var(--text-secondary)]">
                {currentQuestion.recommendedFramework}
              </p>
              <div className="mt-2 border-t border-[var(--border-subtle)]/70 pt-2 text-[11px] text-[var(--text-muted)]">
                <strong>{t('Key Points to Hit:')}</strong>{' '}
                {currentQuestion.sampleKeyPoints.join(' · ')}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                {t('Your answer')}
              </label>
              <textarea
                rows={6}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                disabled={Boolean(feedback)}
                placeholder={t(
                  'Situation: Set the context... Task: What was expected... Action: Specific steps you took... Result: Outcome and metrics...'
                )}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3.5 text-xs leading-relaxed text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-70"
              />
            </div>

            {!feedback && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => void handleEvaluate()}
                  disabled={!answer.trim() || isEvaluating}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] shadow-xs transition-all hover:bg-[var(--accent-secondary)] disabled:opacity-50"
                >
                  <Sparkles
                    className={`h-4 w-4 shrink-0 ${isEvaluating ? 'animate-spin' : ''}`}
                  />
                  {isEvaluating
                    ? t('Evaluating with AI...')
                    : t('Submit Answer')}
                </button>
              </div>
            )}
          </div>

          {feedback && (
            <Reveal
              delay={0.06}
              className="space-y-5 rounded-2xl border border-[var(--accent-primary)]/40 bg-[var(--surface-main)] p-6 shadow-xs"
            >
              {sessionSaveError && (
                <p
                  role="alert"
                  className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-xs text-[var(--text-secondary)]"
                >
                  {sessionSaveError}
                </p>
              )}
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-text)]">
                    {t('AI Mock Evaluation')}
                  </span>
                  <div className="text-sm font-bold text-[var(--text-primary)]">
                    {t('Response Score & Coaching Feedback')}
                  </div>
                </div>
                <div className="text-end">
                  <div className="font-mono text-3xl font-extrabold text-[var(--color-primary-text)]">
                    {feedback.score ?? '—'} / 10
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
                <div className="space-y-1.5 rounded-lg border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--color-success-strong)]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('Strengths')}</span>
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {(feedback.strengths ?? []).map((item, index) => (
                      <li key={`strength-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5 rounded-lg border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5 p-3">
                  <div className="flex items-center gap-1.5 font-bold text-[var(--color-warning)]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{t('Areas for Polish')}</span>
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {(feedback.improvements ?? []).map((item, index) => (
                      <li key={`improvement-${index}`}>• {item}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {feedback.starEvaluation && (
                <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 p-3.5 text-xs">
                  <div className="font-bold text-[var(--text-primary)]">
                    {t('STAR Framework Assessment')}
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-[11px] text-[var(--text-secondary)] sm:grid-cols-2">
                    <div>
                      <strong>{t('Situation:')}</strong>{' '}
                      {feedback.starEvaluation.situation}
                    </div>
                    <div>
                      <strong>{t('Task:')}</strong> {feedback.starEvaluation.task}
                    </div>
                    <div>
                      <strong>{t('Action:')}</strong> {feedback.starEvaluation.action}
                    </div>
                    <div>
                      <strong>{t('Result:')}</strong> {feedback.starEvaluation.result}
                    </div>
                  </div>
                </div>
              )}

              {feedback.suggestedAnswer && (
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-[var(--color-primary-text)]">
                    {t('Executive Suggested Answer Model:')}
                  </div>
                  <p className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 italic leading-relaxed text-[var(--text-secondary)]">
                    "{feedback.suggestedAnswer}"
                  </p>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-5 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                >
                  {currentQuestion.index + 1 >= plan.length
                    ? t('Finish Interview')
                    : t('Next Question')}
                  <ArrowRight className="h-4 w-4 shrink-0 rtl:rotate-180" />
                </button>
              </div>
            </Reveal>
          )}
        </section>
      )}
      {aiProcessingModal}
    </Reveal>
  );
};
