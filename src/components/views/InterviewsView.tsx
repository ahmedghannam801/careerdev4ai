import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, CheckCircle2, AlertCircle, History, HelpCircle } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { INTERVIEW_CATEGORIES } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { getAccessToken } from '../../lib/supabase';
import { apiUrl } from '../../lib/native';
import { questionsForRole, QuestionItem } from '../../data/interviewBank';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';

export const InterviewsView: React.FC = () => {
  const { targetRole, interviewSessions, saveInterviewSession, t} = useCareer();
  const [selectedCategory, setSelectedCategory] = useRouteParam<'all' | 'star' | 'technical' | 'behavioral'>('category', INTERVIEW_CATEGORIES, 'all');

  // The practice material follows the user's actual target role: the
  // universal questions plus the role's own interview topics from the
  // catalogue.
  const questionBank = useMemo(() => questionsForRole(targetRole), [targetRole]);
  const [activeQuestion, setActiveQuestion] = useState<QuestionItem | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const filteredQuestions = questionBank.filter(q =>
    selectedCategory === 'all' ? true : q.category === selectedCategory
  );

  // Keep a question selected as the bank changes.
  useEffect(() => {
    if (!activeQuestion && filteredQuestions.length > 0) {
      setActiveQuestion(filteredQuestions[0]);
    }
  }, [filteredQuestions, activeQuestion]);

  const handleEvaluate = async () => {
    if (!userAnswer.trim() || isEvaluating || !activeQuestion) return;
    setIsEvaluating(true);
    setEvaluationError(null);
    setEvaluationResult(null);

    try {
      const token = await getAccessToken();
      const res = await fetch(apiUrl('/api/mock-interview'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          roleTitle: targetRole.title,
          interviewType: activeQuestion.category,
          question: activeQuestion.question,
          userAnswer: userAnswer.trim()
        })
      });

      if (res.ok) {
        const feedback = await res.json();
        setEvaluationResult(feedback);

        // Save session
        saveInterviewSession({
          roleTitle: targetRole.title,
          type: activeQuestion.category,
          question: activeQuestion.question,
          userAnswer: userAnswer.trim(),
          aiFeedback: feedback
        });
      } else {
        // The server refused or could not answer. The candidate is told
        // plainly that no feedback was produced — no score is invented.
        const body = await res.json().catch(() => null);
        setEvaluationError(
          body?.error ??
            t('The interviewer is unavailable right now. No feedback was generated — please try again shortly.')
        );
      }
    } catch (e) {
      console.error(e);
      // Honesty rule: a fabricated score and a fabricated model answer would
      // be indistinguishable from real feedback. The candidate is told that
      // nothing was evaluated, and their answer is kept.
      setEvaluationError(
        t('The interviewer is unreachable right now, so your answer was not evaluated. Your answer is still saved below — please try again shortly.')
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('INTERVIEW READINESS LAB')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            {t('STAR & Technical Mock Simulator')}
          </h1>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          {t('Target Role:')} <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>
        </div>
      </div>

      {/* Main Simulator & Question Bank Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 cols): Question Bank Directory */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(['all', 'star', 'technical', 'behavioral'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-colors ${
                  selectedCategory === cat
                    ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] shadow-xs'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t(cat.toUpperCase())}
              </button>
            ))}
          </div>

          <Stagger inView gap={0.06} className="space-y-3 max-h-[650px] overflow-y-auto pe-1">
            {filteredQuestions.map((q) => {
              const isSelected = activeQuestion?.id === q.id;

              return (
                <StaggerItem
                  key={q.id}
                  onClick={() => {
                    setActiveQuestion(q);
                    setUserAnswer('');
                    setEvaluationResult(null);
                    setEvaluationError(null);
                  }}
                  className={`p-4 rounded-xl border text-start cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                    isSelected
                      ? 'bg-[var(--accent-surface)]/50 border-[var(--accent-primary)] shadow-xs'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-1">
                    <span className="font-mono font-bold uppercase text-[var(--color-primary-text)]">{t(q.category)}</span>
                    <span>{t(q.roleTarget === 'all' ? 'Universal' : targetRole.title)}</span>
                  </div>
                  <h3 className="font-bold text-xs text-[var(--text-primary)] leading-snug">
                    {q.question}
                  </h3>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>

        {/* Right Column (7 cols): Active Mock Drill & AI Evaluation */}
        <div className="lg:col-span-7 space-y-6">
          {!activeQuestion ? (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              {t('Choose a question from the bank to begin a practice drill.')}
            </div>
          ) : (
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('Active Prompt')} · {t(activeQuestion.category.toUpperCase())}
              </span>
              <h2 className="text-base font-bold text-[var(--text-primary)] leading-relaxed">
                "{activeQuestion.question}"
              </h2>
            </div>

            {/* Recommended Framework Callout */}
            <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs space-y-1">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
                <span>{t('Recommended Framework & Strategy')}</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {activeQuestion.recommendedFramework}
              </p>
              <div className="pt-1.5 border-t border-[var(--border-subtle)]/70 text-[11px] text-[var(--text-muted)]">
                <strong>{t('Key Points to Hit:')}</strong> {activeQuestion.sampleKeyPoints.join(' · ')}
              </div>
            </div>

            {/* User Answer Textarea */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                {t('Draft your spoken or written response')}
              </label>
              <textarea
                rows={5}
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder={t('Situation: Set the context... Task: What was expected... Action: Specific steps you took... Result: Outcome and metrics...')}
                className="w-full p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            {/* Evaluate Button */}
            <div className="flex justify-end">
              <button
                onClick={handleEvaluate}
                disabled={!userAnswer.trim() || isEvaluating}
                className="px-5 py-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-2 transition-all shadow-xs disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isEvaluating ? 'animate-spin' : ''}`} />
                <span>{t(isEvaluating ? 'Evaluating with AI...' : 'Submit Response for AI Scoring')}</span>
              </button>
            </div>
          </div>
          )}

          {/* Honest failure notice: the answer was NOT evaluated, and no
              score or model answer was invented for it. */}
          {evaluationError && (
            <div className="p-4 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-strong)] space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <AlertCircle className="w-4 h-4 text-[var(--color-primary-text)]" />
                {t('No feedback was generated')}
              </div>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{evaluationError}</p>
            </div>
          )}

          {/* AI Evaluation Result Card */}
          {evaluationResult && (
            <Reveal delay={0.06} className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--accent-primary)]/40 space-y-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-text)]">{t('AI Mock Evaluation')}</span>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{t('Response Score & Coaching Feedback')}</div>
                </div>
                <div className="text-end">
                  <div className="text-3xl font-extrabold font-mono text-[var(--color-primary-text)]">
                    {evaluationResult.score} / 10
                  </div>
                </div>
              </div>

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 p-3 rounded-lg bg-[var(--color-success-surface)] border border-[var(--color-success-strong)]/20">
                  <div className="font-bold text-[var(--color-success-strong)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t('Strengths')}</span>
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {evaluationResult.strengths?.map((s: string, i: number) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-1.5 p-3 rounded-lg bg-[var(--color-warning)]/5 border border-[var(--color-warning)]/20">
                  <div className="font-bold text-[var(--color-warning)] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{t('Areas for Polish')}</span>
                  </div>
                  <ul className="space-y-1 text-[var(--text-secondary)]">
                    {evaluationResult.improvements?.map((imp: string, i: number) => (
                      <li key={i}>• {imp}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* STAR Breakdown */}
              {evaluationResult.starEvaluation && (
                <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs space-y-2">
                  <div className="font-bold text-[var(--text-primary)]">{t('STAR Framework Assessment')}</div>
                  <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--text-secondary)]">
                    <div><strong>{t('Situation:')}</strong> {evaluationResult.starEvaluation.situation}</div>
                    <div><strong>{t('Task:')}</strong> {evaluationResult.starEvaluation.task}</div>
                    <div><strong>{t('Action:')}</strong> {evaluationResult.starEvaluation.action}</div>
                    <div><strong>{t('Result:')}</strong> {evaluationResult.starEvaluation.result}</div>
                  </div>
                </div>
              )}

              {/* Suggested Answer */}
              {evaluationResult.suggestedAnswer && (
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-[var(--color-primary-text)]">{t('Executive Suggested Answer Model:')}</div>
                  <p className="text-[var(--text-secondary)] leading-relaxed italic bg-[var(--surface-secondary)]/40 p-3 rounded-lg border border-[var(--border-subtle)]">
                    "{evaluationResult.suggestedAnswer}"
                  </p>
                </div>
              )}
            </Reveal>
          )}

          {/* Past Sessions History */}
          {interviewSessions.length > 0 && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <History className="w-4 h-4 text-[var(--color-primary-text)]" />
                <span>{t('Recorded Mock Sessions')} ({interviewSessions.length})</span>
              </div>
              <div className="space-y-3">
                {interviewSessions.map((session) => (
                  <div key={session.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] line-clamp-1">{session.question}</span>
                      <span className="font-mono font-bold text-[var(--color-primary-text)] shrink-0 ms-2">
                        {t('Score:')} {session.aiFeedback?.score || 8}/10
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {session.roleTitle} · {session.createdAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
};
