/**
 * The job description panel in the CV studio.
 *
 * This is the entry point of the "write a CV for this job" flow. The candidate
 * pastes the advertisement, the server reads it and compares it with their own
 * record, and the result is applied to their CV — but only when they say so.
 *
 * The panel is built around three promises the rest of the product keeps.
 *
 * It never shows a score the platform cannot justify. The score is computed
 * from the candidate's real records, and the matched and missing requirements
 * are listed so the number can be checked.
 *
 * It never writes to the candidate's CV without being asked. The generated
 * content is shown first, and applying it is an explicit action.
 *
 * It never breaks the studio. If the model is unavailable the advertisement is
 * still read and the score is still produced; if the CV cannot be written the
 * candidate's document is left exactly as it was and the failure is said
 * plainly.
 */

import React, { useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  analyzeJobDescription,
  generateJobDescriptionCv,
} from '../../lib/jobDescriptionApi';
import {
  applyAtsCvToDocument,
  type AtsCvContent,
  type AtsMatchReport,
  type JobDescriptionAnalysis,
} from '../../../shared/jobDescription';

/** The minimum a paste must contain before it is worth analysing. */
const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Everything the panel holds.
 *
 * The state lives in the CV studio view rather than in this panel, so the
 * pasted advertisement and the analysis survive a trip to the editor tab —
 * which is exactly the trip a candidate makes when they want to see the
 * result on their CV.
 */
export interface JobDescriptionPanelState {
  jobDescription: string;
  analysis: JobDescriptionAnalysis | null;
  match: AtsMatchReport | null;
  generated: AtsCvContent | null;
  isAnalyzing: boolean;
  isGenerating: boolean;
  error: string | null;
  applied: boolean;
}

export interface JobDescriptionPanelProps {
  state: JobDescriptionPanelState;
  setState: React.Dispatch<React.SetStateAction<JobDescriptionPanelState>>;
}

/** The seven things a job description is read for, in the order they are shown. */
const ANALYSIS_SECTIONS: Array<{
  key: keyof Omit<JobDescriptionAnalysis, 'jobTitle'>;
  label: string;
}> = [
  { key: 'requiredSkills', label: 'Required Skills' },
  { key: 'technicalSkills', label: 'Technical Skills & Tools' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'experienceRequirements', label: 'Experience Requirements' },
  { key: 'qualifications', label: 'Qualifications' },
];

export const JobDescriptionPanel: React.FC<JobDescriptionPanelProps> = ({ state, setState }) => {
  const { t, settings, activeCV, updateCV } = useCareer();
  const language = settings.language === 'ar' ? 'ar' : 'en';

  const {
    jobDescription,
    analysis,
    match,
    generated,
    isAnalyzing,
    isGenerating,
    error,
    applied,
  } = state;

  const canAnalyze = jobDescription.trim().length >= MIN_DESCRIPTION_LENGTH;

  /** The requirements the candidate's record supports, and the ones it does not. */
  const matched = useMemo(() => match?.matched ?? [], [match]);
  const missing = useMemo(() => match?.missing ?? [], [match]);

  const handleAnalyze = async () => {
    if (!canAnalyze || isAnalyzing || isGenerating) return;
    setState((previous) => ({ ...previous, error: null, applied: false, isAnalyzing: true }));
    try {
      const result = await analyzeJobDescription({ jobDescription, language });
      setState((previous) => ({
        ...previous,
        analysis: result.analysis,
        match: result.match,
        generated: null,
        isAnalyzing: false,
      }));
    } catch (analyzeError) {
      setState((previous) => ({
        ...previous,
        isAnalyzing: false,
        error:
          analyzeError instanceof Error
            ? analyzeError.message
            : t('The job description could not be analysed right now.'),
      }));
    }
  };

  const handleGenerate = async () => {
    if (!canAnalyze || isGenerating || isAnalyzing) return;
    setState((previous) => ({ ...previous, error: null, applied: false, isGenerating: true }));
    try {
      const result = await generateJobDescriptionCv({
        jobDescription,
        language,
        // The candidate's current document goes with the request so the CV is
        // improved rather than replaced.
        cv: {
          title: activeCV.title,
          summary: activeCV.summary,
          skillsList: activeCV.skillsList,
          experiences: activeCV.experiences.map((entry) => ({
            id: entry.id,
            bullets: entry.bullets,
          })),
          projects: activeCV.projects.map((entry) => ({
            id: entry.id,
            bullets: entry.bullets,
            description: entry.description,
          })),
        },
      });
      setState((previous) => ({
        ...previous,
        analysis: result.analysis,
        match: result.match,
        generated: result.cv,
        isGenerating: false,
      }));
    } catch (generateError) {
      setState((previous) => ({
        ...previous,
        isGenerating: false,
        error:
          generateError instanceof Error
            ? generateError.message
            : t('The CV for this job description could not be written.'),
      }));
    }
  };

  /**
   * Writes the generated content onto the candidate's document.
   *
   * The shared function is what guarantees the promises: only the wording the
   * generator produced is replaced, a skill the candidate does not have is
   * never written, and everything else in the document survives.
   */
  const handleApply = () => {
    if (!generated) return;
    const next = applyAtsCvToDocument(activeCV, generated);
    updateCV({
      title: next.title,
      summary: next.summary,
      skillsList: next.skillsList,
      experiences: next.experiences,
      projects: next.projects,
    });
    setState((previous) => ({ ...previous, applied: true }));
  };

  return (
    <div className="space-y-6">
      {/* The input box. */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[var(--color-primary-text)]" />
            {t('Job Description')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {t(
              'Paste the job description you are applying for. It is compared against your own records, and a CV is written for that specific job.'
            )}
          </p>
        </div>

        <textarea
          value={jobDescription}
          onChange={(event) =>
            setState((previous) => ({ ...previous, jobDescription: event.target.value }))
          }
          rows={9}
          placeholder={t(
            'Paste the full job description here — the title, the requirements, the tools and the responsibilities…'
          )}
          className="w-full px-3 py-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--accent-primary)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAnalyze}
            disabled={!canAnalyze || isAnalyzing || isGenerating}
            className="px-3.5 py-2 rounded-lg bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-[var(--color-primary-text)] border border-[var(--border-subtle)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{isAnalyzing ? t('Analysing the job description…') : t('Analyse this job description')}</span>
          </button>

          <button
            onClick={handleGenerate}
            disabled={!canAnalyze || isGenerating || isAnalyzing}
            className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            <span>{isGenerating ? t('Writing your CV…') : t('Write my CV for this job')}</span>
          </button>

          {!canAnalyze && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {t('Paste at least a full sentence to continue.')}
            </span>
          )}
        </div>

        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {t(
            'Nothing is written to your CV until you choose to apply it, and nothing is invented: a requirement your records do not support is reported as missing instead.'
          )}
        </p>
      </div>

      {/* A failure is shown where it happened, with the server\'s own reason. */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 flex items-start gap-3"
        >
          <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed flex-1">{error}</p>
        </div>
      )}

      {/* The score and the requirements. */}
      {match && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-text)]">
                {t('ATS Match For This Job')}
              </span>
              <h2 className="text-xl font-bold text-[var(--text-primary)] mt-0.5">
                {analysis?.jobTitle ?? t('Your CV against this job description')}
              </h2>
            </div>
            <div className="text-end">
              <div className="text-3xl font-extrabold font-mono tabular-nums text-[var(--color-primary-text)]">
                {match.score} / 100
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                {t('Benchmark Passing Score: 75')}
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {match.explanation}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-[var(--border-subtle)]">
            {Object.entries(match.breakdown).map(([key, value]) => (
              <div
                key={key}
                className="p-3 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)]"
              >
                <div className="text-[11px] text-[var(--text-secondary)] capitalize">
                  {key.replace(/([A-Z])/g, ' $1')}
                </div>
                <div className="text-lg font-bold font-mono tabular-nums text-[var(--text-primary)] mt-0.5">
                  {value}%
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] space-y-2">
              <div className="text-xs font-bold text-[var(--color-success-strong)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('Your Record Covers')} ({matched.length})</span>
              </div>
              <ul className="space-y-1.5 pt-1">
                {matched.length === 0 && (
                  <li className="text-[11px] text-[var(--text-muted)]">
                    {t('None of the requirements are confirmed by your records yet.')}
                  </li>
                )}
                {matched.map((item, index) => (
                  <li key={`${item.requirement}-${index}`} className="text-xs text-[var(--text-primary)]">
                    <span className="font-medium">{item.requirement}</span>
                    {item.evidence && (
                      <span className="text-[11px] text-[var(--text-muted)]"> — {item.evidence}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl bg-[var(--surface-secondary)]/30 border border-[var(--border-subtle)] space-y-2">
              <div className="text-xs font-bold text-[var(--color-warning)] flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>{t('Not In Your Record Yet')} ({missing.length})</span>
              </div>
              <ul className="space-y-1.5 pt-1">
                {missing.length === 0 && (
                  <li className="text-[11px] text-[var(--text-muted)]">
                    {t('Your records already cover everything this job asks for.')}
                  </li>
                )}
                {missing.map((item, index) => (
                  <li
                    key={`${item.requirement}-${index}`}
                    className="text-xs text-[var(--text-warning)] font-medium"
                  >
                    + {item.requirement}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* What the advertisement asked for, read out. */}
      {analysis && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xs">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--color-primary-text)]" />
            {t('What This Job Asks For')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ANALYSIS_SECTIONS.map((section) => {
              const items = analysis[section.key];
              if (!items || items.length === 0) return null;
              return (
                <div key={section.key} className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                    {t(section.label)}
                  </div>
                  <ul className="space-y-1">
                    {items.map((item, index) => (
                      <li
                        key={`${section.key}-${index}`}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* The CV that was written, before it is applied. */}
      {generated && (
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-[var(--color-primary-text)]" />
              {t('Your CV For This Job')}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleApply}
                className="px-3.5 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold transition-colors"
              >
                {t('Apply to my CV')}
              </button>
              <button
                onClick={() => setState((previous) => ({ ...previous, generated: null }))}
                className="px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] transition-colors"
              >
                {t('Discard')}
              </button>
            </div>
          </div>

          {applied && (
            <div className="p-3 rounded-lg border border-[var(--color-success)]/25 bg-[var(--color-success)]/10 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success-strong)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {t(
                  'Applied to your CV. Open the editor tab to change any of it — every word is still yours.'
                )}
              </p>
            </div>
          )}

          {generated.removedClaims.length > 0 && (
            <div className="p-3 rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-[var(--color-warning)] shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                {t('Some lines were removed because they mentioned things that are not in your records:')}{' '}
                <span className="font-semibold">{generated.removedClaims.join(', ')}</span>
              </p>
            </div>
          )}

          <div className="space-y-4">
            {generated.headline && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Headline')}
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{generated.headline}</p>
              </div>
            )}

            {generated.summary && (
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Summary')}
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {generated.summary}
                </p>
              </div>
            )}

            {generated.experiences.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Rewritten Experience Bullets')}
                </div>
                {generated.experiences.map((entry) => (
                  <ul key={entry.id} className="space-y-1">
                    {entry.bullets.map((bullet, index) => (
                      <li
                        key={`${entry.id}-${index}`}
                        className="text-xs text-[var(--text-secondary)] leading-relaxed"
                      >
                        • {bullet}
                      </li>
                    ))}
                  </ul>
                ))}
              </div>
            )}

            {generated.projects.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Rewritten Project Bullets')}
                </div>
                {generated.projects.map((entry) => (
                  <div key={entry.id} className="space-y-1">
                    {entry.description && (
                      <p className="text-xs text-[var(--text-primary)] font-medium">
                        {entry.description}
                      </p>
                    )}
                    <ul className="space-y-1">
                      {entry.bullets.map((bullet, index) => (
                        <li
                          key={`${entry.id}-${index}`}
                          className="text-xs text-[var(--text-secondary)] leading-relaxed"
                        >
                          • {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {generated.skills.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase">
                  {t('Skills In The Job\'s Order')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {generated.skills.map((skill, index) => (
                    <span
                      key={`${skill}-${index}`}
                      className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
