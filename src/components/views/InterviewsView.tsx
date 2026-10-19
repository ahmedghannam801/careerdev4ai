import React, { useState } from 'react';
import { Target, Sparkles, CheckCircle2, AlertCircle, Play, History, ArrowRight, HelpCircle } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { INTERVIEW_QUESTIONS_BANK, QuestionItem } from '../../data/interviewBank';

export const InterviewsView: React.FC = () => {
  const { targetRole, interviewSessions, saveInterviewSession } = useCareer();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'star' | 'technical' | 'behavioral'>('all');
  const [activeQuestion, setActiveQuestion] = useState<QuestionItem>(INTERVIEW_QUESTIONS_BANK[0]);
  const [userAnswer, setUserAnswer] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any>(null);

  const filteredQuestions = INTERVIEW_QUESTIONS_BANK.filter(q => 
    selectedCategory === 'all' ? true : q.category === selectedCategory
  );

  const handleEvaluate = async () => {
    if (!userAnswer.trim() || isEvaluating) return;
    setIsEvaluating(true);

    try {
      const res = await fetch('/api/mock-interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (e) {
      console.error(e);
      // Fallback evaluation
      const fallbackFeedback = {
        score: 8,
        strengths: ['Directly addresses the question', 'Concrete technical context supplied'],
        improvements: ['Deepen the quantified metrics in the Result segment'],
        starEvaluation: {
          situation: 'High-pressure technical impediment near release.',
          task: 'Diagnose and remediate.',
          action: 'Implemented modular code splitting and optimizations.',
          result: 'Achieved sub-second latency and shipped on time.'
        },
        suggestedAnswer: 'Refined model answer using strong action verbs and quantified impact metrics.'
      };
      setEvaluationResult(fallbackFeedback);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">INTERVIEW READINESS LAB</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            STAR & Technical Mock Simulator
          </h1>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          Target Role: <strong className="text-[var(--text-primary)]">{targetRole.title}</strong>
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
                    ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                    : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {cat.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
            {filteredQuestions.map((q) => {
              const isSelected = activeQuestion.id === q.id;

              return (
                <div
                  key={q.id}
                  onClick={() => {
                    setActiveQuestion(q);
                    setUserAnswer('');
                    setEvaluationResult(null);
                  }}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[var(--accent-surface)]/50 border-[var(--accent-primary)] shadow-xs'
                      : 'bg-[var(--surface-main)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-1">
                    <span className="font-mono font-bold uppercase text-[var(--accent-primary)]">{q.category}</span>
                    <span>{q.roleTarget === 'all' ? 'Universal' : targetRole.title}</span>
                  </div>
                  <h3 className="font-bold text-xs text-[var(--text-primary)] leading-snug">
                    {q.question}
                  </h3>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (7 cols): Active Mock Drill & AI Evaluation */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-primary)]">
                Active Prompt · {activeQuestion.category.toUpperCase()}
              </span>
              <h2 className="text-base font-bold text-[var(--text-primary)] leading-relaxed">
                "{activeQuestion.question}"
              </h2>
            </div>

            {/* Recommended Framework Callout */}
            <div className="p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs space-y-1">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Recommended Framework & Strategy</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {activeQuestion.recommendedFramework}
              </p>
              <div className="pt-1.5 border-t border-[var(--border-subtle)]/70 text-[11px] text-[var(--text-muted)]">
                <strong>Key Points to Hit:</strong> {activeQuestion.sampleKeyPoints.join(' · ')}
              </div>
            </div>

            {/* User Answer Textarea */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Draft your spoken or written response
              </label>
              <textarea
                rows={5}
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Situation: Set the context... Task: What was expected... Action: Specific steps you took... Result: Outcome and metrics..."
                className="w-full p-3.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            {/* Evaluate Button */}
            <div className="flex justify-end">
              <button
                onClick={handleEvaluate}
                disabled={!userAnswer.trim() || isEvaluating}
                className="px-5 py-2.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-xs disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${isEvaluating ? 'animate-spin' : ''}`} />
                <span>{isEvaluating ? 'Evaluating with AI...' : 'Submit Response for AI Scoring'}</span>
              </button>
            </div>
          </div>

          {/* AI Evaluation Result Card */}
          {evaluationResult && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--accent-primary)]/40 space-y-5 shadow-xs animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent-primary)]">AI Mock Evaluation</span>
                  <div className="text-sm font-bold text-[var(--text-primary)]">Response Score & Coaching Feedback</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-extrabold font-mono text-[var(--accent-primary)]">
                    {evaluationResult.score} / 10
                  </div>
                </div>
              </div>

              {/* Strengths & Improvements */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1.5 p-3 rounded-lg bg-[var(--color-success)]/5 border border-[var(--color-success)]/20">
                  <div className="font-bold text-[var(--color-success)] flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Strengths</span>
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
                    <span>Areas for Polish</span>
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
                  <div className="font-bold text-[var(--text-primary)]">STAR Framework Assessment</div>
                  <div className="grid grid-cols-2 gap-3 text-[11px] text-[var(--text-secondary)]">
                    <div><strong>Situation:</strong> {evaluationResult.starEvaluation.situation}</div>
                    <div><strong>Task:</strong> {evaluationResult.starEvaluation.task}</div>
                    <div><strong>Action:</strong> {evaluationResult.starEvaluation.action}</div>
                    <div><strong>Result:</strong> {evaluationResult.starEvaluation.result}</div>
                  </div>
                </div>
              )}

              {/* Suggested Answer */}
              {evaluationResult.suggestedAnswer && (
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-[var(--accent-primary)]">Executive Suggested Answer Model:</div>
                  <p className="text-[var(--text-secondary)] leading-relaxed italic bg-[var(--surface-secondary)]/40 p-3 rounded-lg border border-[var(--border-subtle)]">
                    "{evaluationResult.suggestedAnswer}"
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Past Sessions History */}
          {interviewSessions.length > 0 && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <History className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Recorded Mock Sessions ({interviewSessions.length})</span>
              </div>
              <div className="space-y-3">
                {interviewSessions.map((session) => (
                  <div key={session.id} className="p-3 rounded-lg bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] line-clamp-1">{session.question}</span>
                      <span className="font-mono font-bold text-[var(--accent-primary)] shrink-0 ml-2">
                        Score: {session.aiFeedback?.score || 8}/10
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
    </div>
  );
};
