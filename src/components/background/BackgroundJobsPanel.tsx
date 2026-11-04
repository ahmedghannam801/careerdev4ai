// The list of background jobs.
//
// It shows what the platform is doing for this candidate right now, what it
// finished, and what failed — and it is the same list after a refresh,
// because the state is read back from the server rather than kept in the
// browser.
//
// A failed job offers a retry. The retry is a separate, explicit action: the
// panel never restarts anything on its own.
//
// The panel also says what the background-job service can actually do. A job
// that runs on a development worker is not the same thing as a job that runs
// on Trigger.dev's Production runtime, and the candidate is told which one is
// in play rather than being left to assume the best.
import { AlertTriangle, CheckCircle2, Clock, Loader2, RotateCw, XCircle } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  JOB_KIND_LABELS,
  type BackgroundJob,
  type BackgroundJobAvailability,
  type BackgroundJobStatus,
} from '../../lib/backgroundJobs';
import { useBackgroundJobs } from '../../lib/useBackgroundJobs';

/** The chip that says where a job is. */
function StatusChip({ status, label }: { status: BackgroundJobStatus; label: string }) {
  const styles: Record<BackgroundJobStatus, string> = {
    queued: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
    processing: 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]',
    completed: 'bg-[var(--success-surface)] text-[var(--success-strong)]',
    failed: 'bg-[var(--danger-surface)] text-[var(--color-danger)]',
    cancelled: 'bg-[var(--surface-secondary)] text-[var(--text-muted)]',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${styles[status]}`}>{label}</span>
  );
}

/** The icon that goes with a status. */
function StatusIcon({ status }: { status: BackgroundJobStatus }) {
  if (status === 'processing') {
    return <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-text)]" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className="w-4 h-4 text-[var(--success-strong)]" />;
  }
  if (status === 'failed') {
    return <XCircle className="w-4 h-4 text-[var(--color-danger)]" />;
  }
  return <Clock className="w-4 h-4 text-[var(--text-muted)]" />;
}

/**
 * The note that explains what the service can do.
 *
 * Each state gets its own sentence rather than a generic warning, because
 * the candidate needs to know whether the work will happen at all.
 */
function availabilityNote(
  availability: BackgroundJobAvailability,
  t: (source: string) => string,
): { tone: 'info' | 'warning' | 'danger'; text: string } {
  if (availability.status === 'unavailable') {
    return {
      tone: 'danger',
      text: t(
        'Background processing is not available right now, so no new background work can start. A job that is already running is unaffected.',
      ),
    };
  }
  if (availability.status === 'unconfigured') {
    return {
      tone: 'danger',
      text: t('Background processing is not available on this server, so no background work can be started.'),
    };
  }
  if (availability.status === 'degraded') {
    return {
      tone: 'warning',
      text: t(
        'Background processing is running in a development environment. The work is carried out by a development worker rather than by the Trigger.dev Production runtime.',
      ),
    };
  }
  if (availability.status === 'unknown') {
    return {
      tone: 'warning',
      text: t('The state of background processing could not be checked just now.'),
    };
  }
  return { tone: 'info', text: t('Background processing is running on the Trigger.dev Production runtime.') };
}

export interface BackgroundJobsPanelProps {
  /** Called when the candidate asks to start a job of their own. */
  onStart?: () => void;
  /** The label of the button that starts a job. */
  startLabel?: string;
  className?: string;
}

/**
 * The panel.
 *
 * It renders nothing at all when there is nothing to show and no way to start
 * something, so a screen that has no background work does not grow an empty
 * box.
 */
export function BackgroundJobsPanel({
  onStart,
  startLabel,
  className = '',
}: BackgroundJobsPanelProps) {
  const { t } = useCareer();
  const { jobs, availability, loading, error, busy, retry } = useBackgroundJobs();

  const visible = jobs.slice(0, 8);
  const note = availability ? availabilityNote(availability, t) : null;
  const serviceUnavailable = availability?.status === 'unavailable';
  const serviceUnconfigured = availability?.status === 'unconfigured';

  if (loading && visible.length === 0 && !onStart && !note) return null;
  if (visible.length === 0 && !onStart && !note) return null;

  const statusLabel = (status: BackgroundJobStatus): string => {
    if (status === 'queued') return t('Queued');
    if (status === 'processing') return t('In progress');
    if (status === 'completed') return t('Completed');
    if (status === 'failed') return t('Failed');
    return t('Stopped');
  };

  const startDisabled = busy || serviceUnavailable || serviceUnconfigured;

  return (
    <section
      className={`rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4 ${className}`}
      aria-label={t('Background jobs')}
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('Background jobs')}</h3>
        {onStart && startLabel ? (
          <button
            type="button"
            onClick={onStart}
            disabled={startDisabled}
            title={startDisabled ? note?.text : undefined}
            className="text-xs px-2 py-1 rounded bg-[var(--color-primary-text)] text-[var(--surface-main)] disabled:opacity-60"
          >
            {startLabel}
          </button>
        ) : null}
      </header>

      {note && note.tone !== 'info' ? (
        <p
          className={`text-xs mb-2 flex items-start gap-1.5 ${
            note.tone === 'danger' ? 'text-[var(--color-danger)]' : 'text-[var(--text-muted)]'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {note.text}
            {availability?.environment === 'development' ? (
              <span className="block mt-0.5">
                {t('Environment')}: {t('Development')}
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      {error ? (
        <p className="text-xs text-[var(--color-danger)] flex items-center gap-1.5 mb-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">{t('Nothing is running in the background.')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((job) => (
            <li
              key={job.id}
              className="flex items-start gap-2 p-2 rounded bg-[var(--surface-secondary)]"
            >
              <span className="mt-0.5">
                <StatusIcon status={job.status} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-[var(--text-primary)]">
                    {JOB_KIND_LABELS[job.kind]}
                  </span>
                  <StatusChip status={job.status} label={statusLabel(job.status)} />
                  {job.attempt > 1 ? (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {t('Attempt')} {job.attempt}
                    </span>
                  ) : null}
                </div>

                {job.stage ? (
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{job.stage}</p>
                ) : null}

                {job.waitingForRunner ? (
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {t('Waiting for a runner to pick this up.')}
                  </p>
                ) : null}

                {job.status === 'failed' && job.errorMessage ? (
                  <p className="text-[11px] text-[var(--color-danger)] mt-0.5">{job.errorMessage}</p>
                ) : null}

                {job.status === 'failed' || job.status === 'cancelled' ? (
                  <button
                    type="button"
                    onClick={() => void retry(job.id)}
                    disabled={busy}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--color-primary-text)] disabled:opacity-60"
                  >
                    <RotateCw className="w-3 h-3" />
                    {t('Retry')}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A job row on its own, for a screen that already has a list of its own. */
export function BackgroundJobRow({ job }: { job: BackgroundJob }) {
  const { t } = useCareer();
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <StatusIcon status={job.status} />
      <span className="text-[var(--text-primary)]">{JOB_KIND_LABELS[job.kind]}</span>
      {job.stage ? <span>{job.stage}</span> : null}
      {job.waitingForRunner ? <span>{t('Waiting for a runner to pick this up.')}</span> : null}
      {job.status === 'failed' && job.errorMessage ? (
        <span className="text-[var(--color-danger)]">{job.errorMessage}</span>
      ) : null}
      {!job.stage && job.status === 'queued' ? <span>{t('Queued')}</span> : null}
    </div>
  );
}
