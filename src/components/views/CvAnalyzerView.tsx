import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import {
  CV_ANALYSIS_STAGES,
  type CvAnalysisReport,
  type CvAnalysisStageEvent,
} from '../../../shared/cvAnalysis.ts';
import {
  fetchMeasurementHistory,
  requestMeasuredAnalysis,
  streamMeasuredAnalysis,
  type MeasurementRecord,
} from '../../lib/cvAnalysisApi.ts';
import { CvMeasurementReport } from '../cv/CvMeasuredAnalysis';

type Phase = 'upload' | 'analysing' | 'results';

type StageState = 'pending' | 'active' | 'completed' | 'failed';

const ACCEPTED_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx'];

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The ring that shows the measured score. */
const ScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 132 }) => {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-primary-text)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size / 3.4}
        fontWeight={700}
        fill="var(--color-primary-text)"
      >
        {score}
      </text>
      <text x="50%" y="68%" textAnchor="middle" fontSize={12} fill="var(--color-text-muted)">
        / 100
      </text>
    </svg>
  );
};

/** The ring that shows how far the measurement has really got. */
const StageRing: React.FC<{ done: number; total: number; size?: number }> = ({
  done,
  total,
  size = 132,
}) => {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (total > 0 ? done / total : 0) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-primary-text)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size / 3.6}
        fontWeight={700}
        fill="var(--color-text-primary)"
      >
        {done}
      </text>
      <text x="50%" y="66%" textAnchor="middle" fontSize={12} fill="var(--color-text-muted)">
        / {total}
      </text>
    </svg>
  );
};

/**
 * The CV Analyzer.
 *
 * Three stages, in order: the CV is chosen, the CV is measured, and the
 * measurement is read. The measurement is counted from the candidate's own
 * document — the stage list on the second screen is the list the measurement
 * really went through, not a animation played back.
 */
export const CvAnalyzerView: React.FC<{ onNavigate?: (view: string) => void }> = ({
  onNavigate,
}) => {
  const { t, cvVersions, uploadCvFile, isUploadingCv, targetRole } = useCareer();

  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [stageStates, setStageStates] = useState<Record<string, StageState>>({});
  const [report, setReport] = useState<CvAnalysisReport | null>(null);
  /**
   * What was measured last. A re-analysis measures the same thing again: it
   * never uploads the file a second time, so no duplicate CV is created.
   */
  const [subject, setSubject] = useState<{ cvVersionId?: string; cv?: unknown } | null>(null);
  const [atsScore, setAtsScore] = useState<number | null>(null);
  const [history, setHistory] = useState<MeasurementRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetStages = useCallback(() => {
    const next: Record<string, StageState> = {};
    for (const stage of CV_ANALYSIS_STAGES) next[stage.id] = 'pending';
    setStageStates(next);
  }, []);

  useEffect(() => {
    resetStages();
  }, [resetStages]);

  const completedStages = useMemo(
    () => Object.values(stageStates).filter((state) => state === 'completed').length,
    [stageStates]
  );

  const onStage = useCallback((event: CvAnalysisStageEvent) => {
    setStageStates((previous) => ({ ...previous, [event.stage]: event.status }));
  }, []);

  /** Reads the measurement, streaming the stages when the connection allows. */
  const measure = useCallback(
    async (target: { cvVersionId?: string; cv?: unknown }) => {
      resetStages();
      setError(null);
      setPhase('analysing');

      const controller = new AbortController();
      abortRef.current = controller;

      const request = {
        ...target,
        targetRoleTitle: targetRole.title,
        jobDescription: jobDescription.trim() || null,
      };

      try {
        const measured = await streamMeasuredAnalysis(request, onStage, controller.signal);
        setReport(measured.analysis);
        setPhase('results');
      } catch (failure) {
        if (controller.signal.aborted) {
          setError(null);
          setPhase('upload');
          return;
        }
        // The measurement itself does not depend on the stream. When the
        // connection fails, the same measurement is asked for plainly, and the
        // candidate still gets the real result.
        try {
          const measured = await requestMeasuredAnalysis(request);
          setReport(measured.analysis);
          setPhase('results');
        } catch {
          setError(
            failure instanceof Error
              ? failure.message
              : 'The CV could not be measured right now.'
          );
          setPhase('upload');
        }
      } finally {
        abortRef.current = null;
      }
    },
    [jobDescription, onStage, resetStages, targetRole.title]
  );

  /** Uploads the chosen file, then measures the version it produced. */
  const analyseUploadedFile = useCallback(async () => {
    if (!file) return;
    setError(null);
    setPhase('analysing');

    const uploaded = await uploadCvFile(file);
    if (!uploaded.success) {
      setError(uploaded.error ?? 'This CV could not be read. Please try another file.');
      setPhase('upload');
      return;
    }
    if (uploaded.atsAnalysis?.overallScore !== undefined) {
      setAtsScore(uploaded.atsAnalysis.overallScore);
    }
    // The stored version is measured when the upload produced one, so the run
    // joins the CV's history. Otherwise the document itself is measured.
    if (uploaded.cvVersionId) {
      const subject = { cvVersionId: uploaded.cvVersionId };
      setSubject(subject);
      await measure(subject);
    } else if (uploaded.cv) {
      const subject = { cv: uploaded.cv };
      setSubject(subject);
      await measure(subject);
    } else {
      setError('The CV was uploaded but could not be measured.');
      setPhase('upload');
    }
  }, [file, measure, uploadCvFile]);

  const analyseSavedCv = useCallback(async () => {
    if (!versionId) return;
    const saved = cvVersions.find((entry) => entry.id === versionId);
    if (saved?.atsAnalysis?.overallScore !== undefined) {
      setAtsScore(saved.atsAnalysis.overallScore);
    }
    const subject = { cvVersionId: versionId };
    setSubject(subject);
    await measure(subject);
  }, [cvVersions, measure, versionId]);

  const refreshHistory = useCallback(async (cvId?: string | null) => {
    try {
      setHistory(await fetchMeasurementHistory(cvId ?? null));
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    if (phase === 'results') void refreshHistory();
  }, [phase, refreshHistory]);

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

  const steps: { id: Phase; label: string }[] = [
    { id: 'upload', label: t('Upload your CV') },
    { id: 'analysing', label: t('Analysis') },
    { id: 'results', label: t('Results') },
  ];

  const stageIndex = steps.findIndex((step) => step.id === phase);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-[var(--text-primary)]">{t('CV Analyzer')}</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {t('Evidence-backed score for the Egyptian market')}
          </p>
        </div>
        {phase === 'results' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('documents')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
            >
              <FileText className="w-3.5 h-3.5" />
              {t('My CVs')} ({cvVersions.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('upload');
                setReport(null);
                setFile(null);
                setVersionId(null);
                setSubject(null);
                setAtsScore(null);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
            >
              <Upload className="w-3.5 h-3.5" />
              {t('New CV')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate?.('jobs')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3.5 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-secondary)]"
            >
              {t('Find Jobs')}
            </button>
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

      {/* The three stages */}
      <ol className="flex items-center gap-2 text-xs">
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
            {index < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
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

      {/* STAGE 1 — the CV is chosen */}
      {phase === 'upload' && (
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="analyzer-role"
                className="text-xs font-semibold text-[var(--text-primary)]"
              >
                {t('Your Profession / Job Title')}
              </label>
              <input
                id="analyzer-role"
                value={targetRole.title}
                readOnly
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
              />
              <p className="text-[11px] text-[var(--text-muted)]">
                {t('We score your CV against the right Egyptian-market criteria for your profession.')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="analyzer-field"
                className="text-xs font-semibold text-[var(--text-primary)]"
              >
                {t('Job Type / Field You Want')}
              </label>
              <input
                id="analyzer-field"
                value={targetRole.category ?? ''}
                readOnly
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-3.5 py-2.5 text-sm text-[var(--text-primary)]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="analyzer-jd"
              className="text-xs font-semibold text-[var(--text-primary)]"
            >
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
              <p className="text-xs font-semibold text-[var(--text-primary)]">{t('Or analyse a CV you already have')}</p>
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
                        ? 'border-[var(--color-primary-text)] bg-[var(--accent-surface)] text-[var(--color-primary-text)] font-semibold'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                    }`}
                  >
                    {version.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                // A file that was already uploaded is measured again, not
                // uploaded again: a second upload would create a second CV.
                if (subject?.cvVersionId) void measure(subject);
                else if (versionId) void analyseSavedCv();
                else void analyseUploadedFile();
              }}
              disabled={(!file && !versionId && !subject) || isUploadingCv}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 py-2.5 text-sm font-semibold text-[var(--color-on-primary)] transition-colors disabled:opacity-50"
            >
              {isUploadingCv ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {t('Analyse my CV')}
            </button>
            {file && versionId === null && (
              <span className="text-xs text-[var(--text-muted)]">{t('This file will be added to your CVs.')}</span>
            )}
          </div>
        </section>
      )}

      {/* STAGE 2 — the CV is measured */}
      {phase === 'analysing' && (
        <section className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-6">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <StageRing done={completedStages} total={CV_ANALYSIS_STAGES.length} />
            <div className="text-center sm:text-start space-y-1">
              <h2 className="text-xl font-bold text-[var(--text-primary)]">
                {t('Analysing Your CV')}
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
                {t('Every step below is the measurement itself, not a timer.')}
              </p>
            </div>
          </div>

          <ol className="space-y-2">
            {CV_ANALYSIS_STAGES.map((stage) => {
              const state = stageStates[stage.id] ?? 'pending';
              return (
                <li
                  key={stage.id}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                    state === 'completed'
                      ? 'bg-[var(--color-success-surface)]/60 border-[var(--color-success-strong)]/25'
                      : state === 'active'
                        ? 'bg-[var(--accent-surface)] border-[var(--color-primary-text)]/40'
                        : state === 'failed'
                          ? 'bg-[var(--color-danger)]/10 border-[var(--color-danger)]/30'
                          : 'bg-[var(--surface-secondary)]/40 border-[var(--border-subtle)]'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {state === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-[var(--color-success-strong)]" />
                    ) : state === 'active' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-text)]" />
                    ) : state === 'failed' ? (
                      <AlertCircle className="w-4 h-4 text-[var(--color-danger)]" />
                    ) : (
                      <CircleDot className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[var(--text-primary)]">
                      {t(stage.label)}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {t(stage.description)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)]"
            >
              <X className="w-3.5 h-3.5" />
              {t('Cancel')}
            </button>
          </div>
        </section>
      )}

      {/* STAGE 3 — the measurement is read */}
      {phase === 'results' && report && (
        <section className="space-y-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreRing score={report.overallScore} />
              <div className="space-y-2 text-center sm:text-start">
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                  {t(
                    report.band === 'excellent'
                      ? 'Excellent'
                      : report.band === 'good'
                        ? 'Good'
                        : 'Needs improvement'
                  )}
                </h2>
                <p className="text-sm font-semibold text-[var(--color-primary-text)]">
                  {report.targetRoleTitle}
                </p>
                <p className="text-sm text-[var(--text-secondary)] max-w-xl">{report.summary}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('Measured on')} {new Date(report.generatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* The measured analysis */}
          <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)]">
            <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">
              {t('What was measured')}
            </h3>
            <CvMeasurementReport report={report} />
          </div>

          {/* The model's ATS score, a separate system, clearly labelled */}
          {atsScore !== null && (
            <div className="p-6 rounded-2xl bg-[var(--color-ai-surface)] border border-[var(--color-ai-border)]">
              <h3 className="text-sm font-bold text-[var(--color-ai-text)] flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {t('AI ATS score')}
              </h3>
              <p className="text-xs text-[var(--color-ai-text)]/80 mt-1">
                {t(
                  'A separate system: the model reads the CV and writes its suggestions. It is not the measured score above.'
                )}
              </p>
              <p className="text-3xl font-extrabold font-mono tabular-nums text-[var(--color-ai-text)] mt-3">
                {atsScore}
                <span className="text-sm font-semibold"> / 100</span>
              </p>
            </div>
          )}

          {/* The history: a re-analysis never replaces the earlier one */}
          {history.length > 0 && (
            <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <History className="w-4 h-4" />
                {t('Earlier measurements')}
              </h3>
              <ul className="space-y-2">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--surface-secondary)]/50 border border-[var(--border-subtle)] text-xs"
                  >
                    <span className="text-[var(--text-secondary)]">
                      {new Date(entry.createdAt).toLocaleString()}
                      {entry.targetRoleTitle ? ` · ${entry.targetRoleTitle}` : ''}
                    </span>
                    <span className="font-mono font-semibold text-[var(--text-primary)]">
                      {entry.overallScore}/100
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
