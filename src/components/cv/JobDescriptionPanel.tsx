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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  Sparkles,
  Wand2,
  Save,
  Download,
  Mail,
  Copy,
  RotateCcw,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { AIProcessingModal, type AIProcessingStatus } from '../ai/AIProcessingModal';
import { saveApplicationPackage, updateApplicationPackage, listApplicationPackages, type ApplicationPackageDTO } from '../../lib/applicationPackagesApi';
import {
  analyzeJobDescription,
  extractJobDescriptionFile,
  generateJobDescriptionCv,
} from '../../lib/jobDescriptionApi';
import {
  applyAtsCvToDocument,
  MIN_JOB_DESCRIPTION_TEXT_LENGTH,
  type AtsCvContent,
  type AtsMatchReport,
  type JobDescriptionAnalysis,
  type JobDescriptionListField,
} from '../../../shared/jobDescription';

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
  company: string;
  analysis: JobDescriptionAnalysis | null;
  match: AtsMatchReport | null;
  generated: AtsCvContent | null;
  isAnalyzing: boolean;
  isGenerating: boolean;
  error: string | null;
  applied: boolean;
  /** The saved application package that owns this analysis, if any. */
  packageId: string | null;
}

export interface JobDescriptionPanelProps {
  state: JobDescriptionPanelState;
  setState: React.Dispatch<React.SetStateAction<JobDescriptionPanelState>>;
}

/** The list-valued things a job description is read for, in the order they are shown. */
const ANALYSIS_SECTIONS: Array<{
  key: JobDescriptionListField;
  label: string;
}> = [
  { key: 'requiredSkills', label: 'Required Skills' },
  { key: 'preferredSkills', label: 'Preferred Skills' },
  { key: 'technicalSkills', label: 'Technical Skills & Tools' },
  { key: 'softSkills', label: 'Soft Skills' },
  { key: 'keywords', label: 'Keywords' },
  { key: 'atsTerms', label: 'ATS Terms' },
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'experienceRequirements', label: 'Experience Requirements' },
  { key: 'educationRequirements', label: 'Education Requirements' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'qualifications', label: 'Qualifications' },
];

export const JobDescriptionPanel: React.FC<JobDescriptionPanelProps> = ({ state, setState }) => {
  const { t, aiPreferences, activeCV, updateCV, saveCVVersion, saveCoverLetter, generateAiCoverLetter, coverLetters } = useCareer();
  // The AI response language is a separate, explicit setting. It is not the
  // interface language: a candidate reading the app in Arabic may still want
  // an English job analysis.
  const language = aiPreferences.preferredLanguage;
  const [savedPackages, setSavedPackages] = useState<ApplicationPackageDTO[]>([]);
  const [coverLetterDraft, setCoverLetterDraft] = useState('');
  const [coverLetterId, setCoverLetterId] = useState<string | null>(null);
  const [coverLetterHighlights, setCoverLetterHighlights] = useState<string[]>([]);
  const [coverLetterSaving, setCoverLetterSaving] = useState(false);
  const [coverLetterCopied, setCoverLetterCopied] = useState(false);
  const [coverLetterError, setCoverLetterError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void listApplicationPackages()
      .then((packages) => {
        if (!cancelled) setSavedPackages(packages.slice(0, 12));
      })
      .catch(() => {
        // The editor remains usable when the history endpoint is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [processing, setProcessing] = useState<{
    operation: 'analyze' | 'generate' | 'cover-letter' | 'extract';
    status: AIProcessingStatus;
    error: string | null;
    /** False once the result is being saved, because a save cannot be stopped. */
    canCancel?: boolean;
  } | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<number | null>(null);
  const requestTimedOutRef = useRef(false);
  const requestCancelledRef = useRef(false);
  // True from the moment the answer is written to the database. A write that
  // has started cannot be abandoned halfway, so the interface stops offering
  // to cancel instead of pretending the save stopped.
  const savePhaseRef = useRef(false);
  const retryUploadFileRef = useRef<File | null>(null);

  const {
    jobDescription,
    analysis,
    match,
    generated,
    isAnalyzing,
    isGenerating,
    error,
    applied,
    packageId,
  } = state;

  const canAnalyze = jobDescription.trim().length >= MIN_JOB_DESCRIPTION_TEXT_LENGTH;

  /** The requirements the candidate's record supports, and the ones it does not. */
  const matched = useMemo(() => match?.matched ?? [], [match]);
  const missing = useMemo(() => match?.missing ?? [], [match]);

  const beginRequest = (operation: 'analyze' | 'generate' | 'cover-letter' | 'extract') => {
    const controller = new AbortController();
    requestControllerRef.current = controller;
    requestTimedOutRef.current = false;
    requestCancelledRef.current = false;
    requestTimeoutRef.current = window.setTimeout(() => {
      requestTimedOutRef.current = true;
      controller.abort();
    }, 90_000);
    setProcessing({ operation, status: 'processing', error: null });
    return controller;
  };

  const clearRequest = () => {
    if (requestTimeoutRef.current !== null) {
      window.clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
    requestControllerRef.current = null;
  };

  const handleAnalyze = async () => {
    if (!canAnalyze || isAnalyzing || isGenerating) return;
    const controller = beginRequest('analyze');
    setState((previous) => ({ ...previous, error: null, applied: false, isAnalyzing: true }));
    try {
      const result = await analyzeJobDescription({ jobDescription, language }, { signal: controller.signal });
      // The candidate may have stopped waiting while the answer was in flight.
      // A discarded answer is never written to the database.
      if (controller.signal.aborted || requestCancelledRef.current) return;
      savePhaseRef.current = true;
      setProcessing((previous) => previous ? { ...previous, stage: t('Saving the analysis…'), canCancel: false } : previous);
      let savedPackageId: string | null = null;
      let packageWarning = false;
      try {
        const savedPackage = await saveApplicationPackage({
          jobTitle: result.analysis.jobTitle,
          company: state.company.trim() || null,
          jobDescription,
          analysis: result.analysis,
          matchAnalysis: result.match,
          matchScore: result.match.score,
          language,
          sourceCvId: null,
          tailoredCvVersionId: null,
          coverLetterId: null,
        });
        savedPackageId = savedPackage.id;
        setSavedPackages((previous) => [savedPackage, ...previous.filter((item) => item.id !== savedPackage.id)].slice(0, 12));
      } catch {
        // The analysis remains useful even when persistence is temporarily
        // unavailable; make that limitation visible instead of discarding it.
        packageWarning = true;
      }
      setState((previous) => ({
        ...previous,
        analysis: result.analysis,
        match: result.match,
        generated: null,
        isAnalyzing: false,
        packageId: savedPackageId,
        error: packageWarning ? t('Analysis is ready, but could not be saved for later.') : null,
      }));
      setProcessing({ operation: 'analyze', status: 'success', error: null });
    } catch (analyzeError) {
      setState((previous) => ({
        ...previous,
        isAnalyzing: false,
        error: requestTimedOutRef.current
          ? t('The analysis took too long. Please try again.')
          : requestCancelledRef.current
            ? null
            : t('The job description could not be analysed right now. Please try again.'),
      }));
      if (requestCancelledRef.current) {
        setProcessing(null);
      } else {
        setProcessing({
          operation: 'analyze',
          status: 'error',
          error: requestTimedOutRef.current
            ? t('The analysis timed out. Check your connection and try again.')
            : t('The analysis could not be completed. Please try again.'),
        });
      }
      if (!(analyzeError instanceof DOMException && analyzeError.name === 'AbortError')) {
        console.warn('Job description analysis failed.');
      }
    } finally {
      savePhaseRef.current = false;
      clearRequest();
    }
  };

  const handleGenerate = async () => {
    if (!canAnalyze || isGenerating || isAnalyzing) return;
    const controller = beginRequest('generate');
    setState((previous) => ({ ...previous, error: null, applied: false, isGenerating: true }));
    try {
      const result = await generateJobDescriptionCv(
        {
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
        },
        { signal: controller.signal }
      );
      let savedPackageId = packageId;
      let persistenceWarning = false;
      // A discarded answer is never written to the database.
      if (controller.signal.aborted || requestCancelledRef.current) return;
      savePhaseRef.current = true;
      setProcessing((previous) => previous ? { ...previous, stage: t('Saving the tailored CV…'), canCancel: false } : previous);
      try {
        // Keep the candidate's original document as an immutable snapshot
        // before any later Apply action can change the active projection.
        const sourceVersion = await saveCVVersion('Original before tailoring', activeCV);
        if (!sourceVersion.cvId) throw new Error('The source CV version has no owning CV.');
        const tailoredDocument = applyAtsCvToDocument(activeCV, result.cv);
        const tailoredVersion = await saveCVVersion(
          `Tailored CV — ${result.analysis.jobTitle || 'job application'}`,
          tailoredDocument
        );
        if (savedPackageId) {
          await updateApplicationPackage(savedPackageId, {
            jobTitle: result.analysis.jobTitle,
            company: state.company.trim() || null,
            sourceCvId: sourceVersion.cvId,
            tailoredCvVersionId: tailoredVersion.id,
            analysis: result.analysis,
            matchAnalysis: result.match,
            matchScore: result.match.score,
          });
        } else {
          const savedPackage = await saveApplicationPackage({
            jobTitle: result.analysis.jobTitle,
            company: state.company.trim() || null,
            jobDescription,
            analysis: result.analysis,
            matchAnalysis: result.match,
            matchScore: result.match.score,
            language,
            sourceCvId: sourceVersion.cvId,
            tailoredCvVersionId: tailoredVersion.id,
            coverLetterId: null,
          });
          savedPackageId = savedPackage.id;
          setSavedPackages((previous) => [savedPackage, ...previous.filter((item) => item.id !== savedPackage.id)].slice(0, 12));
        }
      } catch {
        // Generation is still a valid draft, but persistence is an explicit
        // promise, so say when the package or snapshots could not be saved.
        persistenceWarning = true;
      }
      setState((previous) => ({
        ...previous,
        analysis: result.analysis,
        match: result.match,
        generated: result.cv,
        isGenerating: false,
        packageId: savedPackageId,
        error: persistenceWarning ? t('The tailored CV is ready, but its saved application package could not be completed.') : null,
      }));
      setProcessing({ operation: 'generate', status: 'success', error: null });
    } catch (generateError) {
      setState((previous) => ({
        ...previous,
        isGenerating: false,
        error: requestTimedOutRef.current
          ? t('CV generation took too long. Please try again.')
          : requestCancelledRef.current
            ? null
            : t('The CV for this job description could not be written. Please try again.'),
      }));
      if (requestCancelledRef.current) {
        setProcessing(null);
      } else {
        setProcessing({
          operation: 'generate',
          status: 'error',
          error: requestTimedOutRef.current
            ? t('CV generation timed out. Check your connection and try again.')
            : t('The tailored CV could not be generated. Please try again.'),
        });
      }
      if (!(generateError instanceof DOMException && generateError.name === 'AbortError')) {
        console.warn('Tailored CV generation failed.');
      }
    } finally {
      savePhaseRef.current = false;
      clearRequest();
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!state.company.trim() || !analysis?.jobTitle) return;
    const controller = beginRequest('cover-letter');
    setCoverLetterError(null);
    try {
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
      });
      const result = await Promise.race([
        generateAiCoverLetter(state.company.trim(), analysis.jobTitle, jobDescription, undefined, controller.signal),
        aborted,
      ]);
      if (!result.coverLetter.trim()) throw new Error('The AI service returned an empty cover letter.');
      setCoverLetterDraft(result.coverLetter);
      setCoverLetterHighlights(result.keyHighlights ?? []);
      setCoverLetterId(null);
      setProcessing({ operation: 'cover-letter', status: 'success', error: null });
    } catch {
      if (requestCancelledRef.current) {
        setProcessing(null);
      } else {
        const message = requestTimedOutRef.current
          ? t('Cover letter generation timed out. Check your connection and try again.')
          : t('The cover letter could not be generated. Please try again.');
        setCoverLetterError(message);
        setProcessing({ operation: 'cover-letter', status: 'error', error: message });
      }
    } finally {
      clearRequest();
    }
  };

  const handleSaveCoverLetter = async () => {
    if (!coverLetterDraft.trim() || !analysis?.jobTitle) return;
    setCoverLetterSaving(true);
    setCoverLetterError(null);
    try {
      const id = await saveCoverLetter({
        id: coverLetterId ?? undefined,
        title: `${state.company.trim() || t('Application')} — ${analysis.jobTitle}`,
        company: state.company.trim(),
        role: analysis.jobTitle,
        jobDescription,
        content: coverLetterDraft,
        keyHighlights: coverLetterHighlights,
      });
      setCoverLetterId(id);
      if (packageId) {
        await updateApplicationPackage(packageId, {
          jobTitle: analysis.jobTitle,
          company: state.company.trim() || null,
          coverLetterId: id,
        });
      }
      setCoverLetterError(null);
    } catch {
      setCoverLetterError(t('The cover letter could not be saved. Please try again.'));
    } finally {
      setCoverLetterSaving(false);
    }
  };

  const handleExportCoverLetter = () => {
    if (!coverLetterDraft.trim()) return;
    const blob = new Blob([coverLetterDraft], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `cover-letter-${(state.company || analysis?.jobTitle || 'application').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Copies the letter exactly as it is shown.
   *
   * The clipboard API is only available in a secure context, so a fallback
   * selects the text through a temporary textarea. A failed copy reports
   * itself instead of claiming success: the button label is the only feedback
   * and it must be true.
   */
  const handleCopyCoverLetter = async () => {
    const text = coverLetterDraft;
    if (!text.trim()) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(area);
        if (!copied) throw new Error('Copy failed');
      }
      setCoverLetterCopied(true);
      window.setTimeout(() => setCoverLetterCopied(false), 2000);
    } catch {
      setCoverLetterError(t('The letter could not be copied. Select it and copy it manually.'));
    }
  };

  const handleJobDescriptionFile = async (file: File) => {
    if (requestControllerRef.current || isAnalyzing || isGenerating) return;
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    const supported = ['.txt', '.pdf', '.docx'].includes(extension);
    if (!supported) {
      setState((previous) => ({ ...previous, error: t('Choose a TXT, PDF or DOCX file.') }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setState((previous) => ({ ...previous, error: t('Job description files must be 5 MB or smaller.') }));
      return;
    }
    if (jobDescription.trim() && !window.confirm(t('Replace the current job description with the text extracted from this file?'))) {
      return;
    }

    const controller = beginRequest('extract');
    retryUploadFileRef.current = file;
    setState((previous) => ({ ...previous, error: null }));
    try {
      const result = await extractJobDescriptionFile(file, { signal: controller.signal });
      if (requestCancelledRef.current) return;
      setState((previous) => ({
        ...previous,
        jobDescription: result.text,
        analysis: null,
        match: null,
        generated: null,
        isAnalyzing: false,
        isGenerating: false,
        error: null,
        applied: false,
        packageId: null,
      }));
      retryUploadFileRef.current = null;
      setProcessing({ operation: 'extract', status: 'success', error: null });
    } catch {
      if (requestCancelledRef.current) {
        setProcessing(null);
      } else {
        const message = t('The job description file could not be extracted. Check the file type and try again.');
        setState((previous) => ({ ...previous, error: message }));
        setProcessing({ operation: 'extract', status: 'error', error: message });
      }
    } finally {
      clearRequest();
    }
  };

  const handleLoadPackage = (saved: ApplicationPackageDTO) => {
    const savedAnalysis = saved.analysis && typeof saved.analysis === 'object'
      ? (saved.analysis as JobDescriptionAnalysis)
      : null;
    const savedMatch = saved.matchAnalysis && typeof saved.matchAnalysis === 'object'
      ? (saved.matchAnalysis as AtsMatchReport)
      : null;
    const savedLetter = saved.coverLetterId
      ? coverLetters.find((letter) => letter.id === saved.coverLetterId)
      : undefined;
    setCoverLetterId(savedLetter?.id ?? null);
    setCoverLetterDraft(savedLetter?.content ?? '');
    setCoverLetterHighlights(savedLetter?.keyHighlights ?? []);
    setCoverLetterError(null);
    setState((previous) => ({
      ...previous,
      jobDescription: saved.jobDescription,
      company: saved.company ?? '',
      analysis: savedAnalysis,
      match: savedMatch,
      generated: null,
      isAnalyzing: false,
      isGenerating: false,
      error: null,
      applied: false,
      packageId: saved.id,
    }));
  };

  const handleCancel = () => {
    // A result that is already being written to the database cannot be
    // abandoned halfway. The interface says so instead of claiming that
    // nothing was saved while the save continues.
    if (savePhaseRef.current) {
      setProcessing((previous) => previous
        ? { ...previous, stage: t('Saving the result…'), canCancel: false }
        : previous);
      return;
    }
    requestCancelledRef.current = true;
    requestControllerRef.current?.abort();
    clearRequest();
    setState((previous) => ({ ...previous, isAnalyzing: false, isGenerating: false }));
    setProcessing(null);
  };

  const handleCloseProcessing = () => setProcessing(null);


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
      {savedPackages.length > 0 && (
        <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 shadow-xs" aria-labelledby="saved-application-packages">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 id="saved-application-packages" className="text-sm font-bold text-[var(--text-primary)]">{t('Saved job applications')}</h3>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{t('Return to a saved job description, analysis and match report.')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedPackages.map((saved) => (
              <button
                key={saved.id}
                type="button"
                onClick={() => handleLoadPackage(saved)}
                className={`rounded-lg border px-3 py-2 text-start text-xs transition-colors ${packageId === saved.id ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]' : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'}`}
              >
                <span className="block font-semibold">{saved.jobTitle || t('Saved application')}</span>
                <span className="mt-0.5 block text-[10px] opacity-75">{saved.company || new Date(saved.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}

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

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">{t('Company (optional)')}</span>
          <input
            type="text"
            value={state.company}
            onChange={(event) => setState((previous) => ({ ...previous, company: event.target.value }))}
            maxLength={160}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]">
          <FileText className="h-3.5 w-3.5" />
          {t('Upload job description (TXT, PDF or DOCX)')}
          <input
            type="file"
            accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            disabled={!!processing || isAnalyzing || isGenerating}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleJobDescriptionFile(file);
            }}
          />
        </label>

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

          {/* The facts that sit around the requirements. A field the
              advertisement did not state is shown as not stated: the panel
              never fills one in to look complete. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Company', value: analysis.company },
              { label: 'Seniority', value: analysis.seniority },
              { label: 'Location', value: analysis.location },
              { label: 'Work arrangement', value: analysis.workArrangement },
            ].map((fact) => (
              <div
                key={fact.label}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
              >
                <div className="text-[11px] font-semibold uppercase text-[var(--text-muted)]">
                  {t(fact.label)}
                </div>
                <div
                  className={`mt-0.5 text-xs ${
                    fact.value
                      ? 'font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)]'
                  }`}
                >
                  {fact.value ? fact.value : t('Not specified')}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {ANALYSIS_SECTIONS.map((section) => {
              const items = analysis[section.key] ?? [];
              if (items.length === 0) return null;
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
      {analysis && (
        <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-6 shadow-xs" aria-labelledby="application-cover-letter">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[var(--color-primary-text)]" />
            <h3 id="application-cover-letter" className="text-sm font-bold text-[var(--text-primary)]">{t('Cover Letter')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleGenerateCoverLetter()}
              disabled={!state.company.trim() || !analysis.jobTitle || !!processing || coverLetterSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {coverLetterDraft ? t('Regenerate cover letter') : t('Generate cover letter')}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveCoverLetter()}
              disabled={!coverLetterDraft.trim() || coverLetterSaving}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-50"
            ><Save className="h-3.5 w-3.5" />{coverLetterSaving ? t('Saving…') : coverLetterId ? t('Save changes') : t('Save cover letter')}</button>
            <button
              type="button"
              onClick={() => void handleCopyCoverLetter()}
              disabled={!coverLetterDraft.trim()}
              aria-live="polite"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-50"
            ><Copy className="h-3.5 w-3.5" />{coverLetterCopied ? t('Copied') : t('Copy')}</button>
            <button
              type="button"
              onClick={handleExportCoverLetter}
              disabled={!coverLetterDraft.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-50"
            ><Download className="h-3.5 w-3.5" />{t('Export as text')}</button>
          </div>
          {!state.company.trim() && <p className="text-[11px] text-[var(--text-muted)]">{t('Enter a company name to generate a tailored cover letter.')}</p>}
          {coverLetterDraft && (
            <textarea
              aria-label={t('Edit cover letter')}
              value={coverLetterDraft}
              onChange={(event) => { setCoverLetterDraft(event.target.value); setCoverLetterId(null); }}
              rows={12}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2.5 text-xs leading-relaxed text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          )}
          {coverLetterHighlights.length > 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">{t('Key points')}: {coverLetterHighlights.join(' · ')}</p>
          )}
          {coverLetterError && <p role="alert" className="text-xs text-[var(--color-warning)]">{coverLetterError}</p>}
        </section>
      )}

      {processing && (
        <AIProcessingModal
          open
          status={processing.status}
          title={t(processing.operation === 'analyze' ? 'Analysing job requirements' : processing.operation === 'generate' ? 'Creating a tailored CV' : processing.operation === 'cover-letter' ? 'Writing your cover letter' : 'Extracting job description text')}
          stage={t(processing.operation === 'analyze' ? 'Reading the job description and comparing it with your profile…' : processing.operation === 'generate' ? 'Drafting CV content from your existing records…' : processing.operation === 'cover-letter' ? 'Preparing a letter from your profile and this job description…' : 'Extracting text from the selected file…')}
          message={processing.status === 'success'
            ? t(processing.operation === 'analyze' ? 'The requirements and match report are ready.' : processing.operation === 'generate' ? 'Your tailored CV draft is ready to review.' : processing.operation === 'cover-letter' ? 'Your cover letter draft is ready to edit.' : 'Job description text is ready to review.')
            : undefined}
          error={processing.error}
          canCancel={processing.canCancel !== false}
          onCancel={handleCancel}
          onClose={handleCloseProcessing}
          onRetry={() => {
            setProcessing(null);
            if (processing.operation === 'analyze') void handleAnalyze();
            else if (processing.operation === 'generate') void handleGenerate();
            else if (processing.operation === 'cover-letter') void handleGenerateCoverLetter();
            else if (retryUploadFileRef.current) void handleJobDescriptionFile(retryUploadFileRef.current);
          }}
        />
      )}
    </div>
  );
};
