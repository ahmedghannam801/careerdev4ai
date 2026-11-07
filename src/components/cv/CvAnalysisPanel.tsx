/**
 * The measured analysis, as one component.
 *
 * The CV Analyzer was a page of its own with its own upload, its own run and
 * its own history. The studio had a measured analysis of its own, and a
 * button that navigated away to the analyzer to do the same work twice in
 * two places.
 *
 * This is the one implementation both of them use. It chooses a CV — the
 * studio's document, a file, or a version the candidate has already saved —
 * measures it, streams the stages as they happen, shows the report, and
 * lists the measurements that have been taken before.
 *
 * The measurement itself is deterministic: it is counted from the document,
 * not described by a model, so the same CV always produces the same score
 * and the score never depends on a provider being available. The model's own
 * ATS score is a different number from a different system, and it is shown
 * as a separate system and never merged into the measured one.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CircleDot,
  FileText,
  History,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Upload,
  X,
} from 'lucide-react';
import type { CVProfile } from '../../types/career';
import type { CvAnalysisReport, CvAnalysisStageEvent } from '../../../shared/cvAnalysis';
import { CV_ANALYSIS_STAGES } from '../../../shared/cvAnalysis';
import {
  fetchMeasurementHistory,
  requestMeasuredAnalysis,
  streamMeasuredAnalysis,
  type MeasurementRecord,
} from '../../lib/cvAnalysisApi';
import { useCareer } from '../../context/CareerContext';
import { CvMeasurementReport } from './CvMeasuredAnalysis';

type StageState = 'pending' | 'active' | 'completed' | 'failed';
type Phase = 'upload' | 'analysing' | 'results';

/** What is being measured. */
interface Subject {
  cvVersionId?: string;
  cv?: unknown;
}

interface CvAnalysisPanelProps {
  /** The document to measure. The studio's document is used when it is absent. */
  cv?: CVProfile;
  /** A stored version to measure instead of the document. */
  cvVersionId?: string;
  /** The advertisement to measure against, when the candidate pasted one. */
  jobDescription?: string;
  /**
   * Whether the panel offers the upload and the saved-CV picker.
   *
   * The studio measures the document the candidate is already working on,
   * so it does not need them. The analyzer page does.
   */
  showUpload?: boolean;
  /** Called when a measurement finishes. */
  onMeasured?: (report: CvAnalysisReport) => void;
}

const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CvAnalysisPanel: React.FC<CvAnalysisPanelProps> = ({
  cv,
  cvVersionId,
  jobDescription: providedJobDescription,
  showUpload = false,
  onMeasured,
}) => {
  const { t, targetRole, cvVersions, uploadCvFile } = useCareer();
  const [stageStates, setStageStates] = useState<Record<string, StageState>>({});
  const [report, setReport] = useState<CvAnalysisReport | null>(null);
  const [history, setHistory] = useState<MeasurementRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [jobDescription, setJobDescription] = useState(providedJobDescription ?? '');
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetStages = useCallback(() => {
    const initial: Record<string, StageState> = {};
    for (const stage of CV_ANALYSIS_STAGES) initial[stage.id] = 'pending';
    setStageStates(initial);
  }, []);

  const onStage = useCallback((event: CvAnalysisStageEvent) => {
    setStageStates((previous) => ({ ...previous, [event.stage]: event.status }));
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await fetchMeasurementHistory(null));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  /** Measures a subject, streaming the stages when the connection allows. */
  const measure = useCallback(
    async (target: Subject) => {
      resetStages();
      setError(null);
      setPhase('analysing');
      setIsRunning(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const request = {
        cvVersionId: target.cvVersionId ?? null,
        cv: target.cvVersionId ? undefined : target.cv,
        targetRoleTitle: targetRole.title,
        jobDescription: jobDescription.trim() || null,
      };

      try {
        const measured = await streamMeasuredAnalysis(request, onStage, controller.signal);
        setReport(measured.analysis);
        onMeasured?.(measured.analysis);
        await refreshHistory();
        setPhase('results');
      } catch (failure) {
        if (controller.signal.aborted) {
          setPhase('upload');
          return;
        }
        // The measurement does not depend on the stream. When the connection
        // fails the same measurement is asked for plainly, so the candidate
        // still gets the real result.
        try {
          const measured = await requestMeasuredAnalysis(request);
          setReport(measured.analysis);
          onMeasured?.(measured.analysis);
          await refreshHistory();
          setPhase('results');
        } catch {
          setError(
            failure instanceof Error
              ? failure.message
              : t('The CV could not be measured right now.')
          );
          setPhase('upload');
        }
      } finally {
        abortRef.current = null;
        setIsRunning(false);
      }
    },
    [jobDescription, onMeasured, onStage, refreshHistory, resetStages, t, targetRole.title]
  );

  /** Uploads the chosen file, then measures the version it produced. */
  const analyseUploadedFile = useCallback(async () => {
    if (!file) return;
    setError(null);
    setPhase('analysing');

    const uploaded = await uploadCvFile(file);
    if (!uploaded.success) {
      setError(uploaded.error ?? t('This CV could not be read. Please try another file.'));
      setPhase('upload');
      return;
    }
    if (uploaded.atsAnalysis?.overallScore !== undefined) {
      setAtsScore(uploaded.atsAnalysis.overallScore);
    }
    // The stored version is measured when the upload produced one, so the run
    // joins the CV's history. Otherwise the document itself is measured.
    if (uploaded.cvVersionId) {
      const next = { cvVersionId: uploaded.cvVersionId };
      setSubject(next);
      await measure(next);
    } else if (uploaded.cv) {
      const next = { cv: uploaded.cv };
      setSubject(next);
      await measure(next);
    } else {
      setError(t('The CV was uploaded but could not be measured.'));
      setPhase('upload');
    }
  }, [file, measure, t, uploadCvFile]);

  const analyseSavedCv = useCallback(async () => {
    if (!versionId) return;
    const saved = cvVersions.find((entry) => entry.id === versionId);
    if (saved?.atsAnalysis?.overallScore !== undefined) {
      setAtsScore(saved.atsAnalysis.overallScore);
    }
    const next = { cvVersionId: versionId };
    setSubject(next);
    await measure(next);
  }, [cvVersions, measure, versionId]);

  /** Measures the document the studio is working on. */
  const measureCurrentCv = useCallback(async () => {
    if (!cv) return;
    const next = { cv };
    setSubject(next);
    await measure(next);
  }, [cv, measure]);

  const acceptFile = useCallback((candidate: File | null) => {
    if (!candidate) return;
    const name = candidate.name.toLowerCase();
    const allowed =
      ACCEPTED_TYPES.includes(candidate.type) ||
      ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension));
    if (!allowed) return;
    setFile(candidate);
    setVersionId(null);
    // A new file is a new subject: the last measurement is not about it.
    setSubject(null);
    setError(null);
  }, []);

  const completedStages = useMemo(
    () => Object.values(stageStates).filter((state) => state === 'completed').length,
    [stageStates]
  );

  const activeStage = CV_ANALYSIS_STAGES.find((stage) => stageStates[stage.id] === 'active');

  const steps: { id: Phase; label: string }[] = [
    { id: 'upload', label: t('Choose your CV') },
    { id: 'analysing', label: t('Analysis') },
    { id: 'results', label: t('Results') },
  ];
  const stageIndex = steps.findIndex((step) => step.id === phase);

  return (
    <div className="space-y-5" data-testid="cv-analysis-panel">
      {/* The three stages the candidate goes through. */}
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${
                index === stageIndex
                  ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                  : index < stageIndex
                    ? 'text-[var(--color-success-strong)]'
                    : 'text-[var(--text-muted)]'
              }`}
            >
              {index < stageIndex ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <CircleDot className="w-3.5 h-3.5" />
              )}
              {step.label}
            </span>
            {index < steps.length - 1 && (
              <span className="text-[var(--text-muted)]" aria-hidden="true">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 p-4 rounded-xl bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/30 text-sm text-[var(--text-primary)]"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-[var(--color-danger)]" />
          <span>{error}</span>
        </div>
      )}

      {/* The upload, when the panel offers it. */}
      {showUpload && phase === 'upload' && (
        <section className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              acceptFile(event.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-[var(--color-primary-text)] bg-[var(--accent-surface)]'
                : 'border-[var(--color-border-strong)] bg-[var(--surface-secondary)]/40'
            }`}
          >
            <div className="w-14 h-14 rounded-xl bg-[var(--accent-surface)] flex items-center justify-center">
              <Upload className="w-6 h-6 text-[var(--color-primary-text)]" />
            </div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('Drag your CV here')}</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              {t('or click anywhere to choose a PDF file')}
            </p>
            <p className="text-xs text-[var(--text-muted)]">{t('PDF or Word (.docx)')}</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
          </div>

          {file && (
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 shrink-0 text-[var(--color-primary-text)]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{file.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{fileSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={t('Remove the file')}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="analyzer-jd" className="text-xs font-semibold text-[var(--text-primary)]">
              {t('A job advertisement (optional)')}
            </label>
            <textarea
              id="analyzer-jd"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              rows={4}
              placeholder={t('Paste the advertisement you are applying to, and the score will be measured against it.')}
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('Without an advertisement there is no market claim: the score stays about your CV.')}
            </p>
          </div>

          {cvVersions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {t('Or analyse a CV you already have')}
              </p>
              <div className="flex flex-wrap gap-2">
                {cvVersions.slice(0, 6).map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setVersionId(version.id);
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      versionId === version.id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {version.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => (versionId ? void analyseSavedCv() : void analyseUploadedFile())}
              disabled={!file && !versionId}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-4 py-2.5 text-xs font-semibold text-[var(--color-on-primary)] transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {t('Analyze my CV')}
            </button>
          </div>
        </section>
      )}

      {/* The measurement itself. */}
      <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Measure this CV')}</h3>
            <p className="text-xs text-[var(--text-secondary)]">
              {t(
                'The score is counted from your own document, so it does not depend on a model being available.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
              >
                <Square className="w-3 h-3" />
                {t('Cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => (subject ? void measure(subject) : void measureCurrentCv())}
                disabled={!cv && !subject && !versionId}
                className="px-3.5 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                {t('Measure now')}
              </button>
            )}
          </div>
        </div>

        {/* The stages. Each one is reported after the work it names has
            really been done, so the list is the measurement and not a
            decoration of it. */}
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {CV_ANALYSIS_STAGES.map((stage) => {
            const state = stageStates[stage.id] ?? 'pending';
            return (
              <li
                key={stage.id}
                className={`p-2.5 rounded-xl border text-[11px] flex items-start gap-2 transition-colors ${
                  state === 'completed'
                    ? 'border-[var(--color-success)]/25 bg-[var(--color-success)]/8'
                    : state === 'active'
                      ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]'
                      : state === 'failed'
                        ? 'border-[var(--color-danger)]/25 bg-[var(--color-danger)]/8'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40'
                }`}
              >
                <span className="shrink-0 mt-0.5">
                  {state === 'completed' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success)]" />
                  ) : state === 'active' ? (
                    <Loader2 className="w-3.5 h-3.5 text-[var(--color-primary-text)] animate-spin" />
                  ) : (
                    <span className="w-3.5 h-3.5 rounded-full border border-[var(--border-subtle)] block" />
                  )}
                </span>
                <span className="space-y-0.5">
                  <span className="block font-semibold text-[var(--text-primary)]">{t(stage.label)}</span>
                  {state === 'active' && (
                    <span className="block text-[var(--text-muted)]">{t(stage.description)}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        {isRunning && (
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('Stage')} {completedStages + (activeStage ? 1 : 0)} {t('of')}{' '}
            {CV_ANALYSIS_STAGES.length}
            {activeStage ? ` · ${t(activeStage.label)}` : ''}
          </p>
        )}

        {/* The results header. The model's own ATS score is a different
            number from a different system, so it is shown apart from the
            measured one and never merged into it. */}
        {phase === 'results' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center gap-3">
              {report && (
                <span className="text-xs text-[var(--text-secondary)]">
                  {t('Measured score')}:{' '}
                  <span className="font-mono font-bold text-[var(--color-primary-text)]">
                    {report.overallScore}
                  </span>
                </span>
              )}
              {atsScore !== null && (
                <span className="px-2 py-1 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[11px] font-semibold text-[var(--text-secondary)]">
                  {t('AI ATS score')}: <span className="font-mono">{atsScore}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (subject) void measure(subject);
              }}
              disabled={!subject}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-3.5 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('Re-analyze')}
            </button>
          </div>
        )}
      </div>

      {report && <CvMeasurementReport report={report} />}

      {history.length > 0 && (
        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[var(--color-primary-text)]" />
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {t('Earlier measurements')}
            </h3>
          </div>
          <ul className="space-y-1.5">
            {history.slice(0, 8).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-[11px]"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--text-primary)] truncate">
                    {entry.targetRoleTitle || t('your saved CV')}
                  </span>
                  <span className="block text-[var(--text-muted)]">{entry.createdAt}</span>
                </span>
                <span className="font-mono tabular-nums font-bold text-[var(--color-primary-text)] shrink-0">
                  {entry.overallScore}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
