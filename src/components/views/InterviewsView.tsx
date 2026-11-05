import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  History,
  HelpCircle,
  MessageSquare,
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

export const InterviewsView: React.FC = () => {
  const {
    t,
    targetRole,
    profile,
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
            roleTitle: targetRole.title,
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
            roleTitle: targetRole.title,
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

  const behavioralCount = plan?.filter((question) => question.stage === 'behavioral').length ?? 8;
  const technicalCount = plan?.filter((question) => question.stage === 'technical').length ?? 7;

  return (
    <Reveal className="space-y-8">
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
        <div className="text-xs text-[var(--text-muted)]">
          {t('Target Role:')}{' '}
          <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>
        </div>
      </div>

      {/* Start screen */}
      {!plan && (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] lg:col-span-2">
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
                    {targetRole.title} {t('Interview Prep')}
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
                    {technicalCount} {t('questions')} · {targetRole.title}
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

          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6">
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <History className="h-4 w-4 shrink-0 text-[var(--color-primary-text)]" />
              {t('Recorded Mock Sessions')} ({interviewSessions.length})
            </div>
            {interviewSessions.length === 0 ? (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                {t('No recorded sessions yet. Your first answer will appear here.')}
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
            <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>.
          </p>
          <button
            type="button"
            onClick={() => setShowTransition(false)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] hover:opacity-90"
          >
            {t('Start Technical Interview')}
            <ArrowRight className="h-4 w-4 shrink-0" />
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
                  {t(isEvaluating ? 'Evaluating with AI...' : 'Submit Answer')}
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
                  <ArrowRight className="h-4 w-4 shrink-0" />
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
