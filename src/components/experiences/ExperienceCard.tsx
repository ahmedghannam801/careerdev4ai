import React, { useMemo, useState } from 'react';
import {
  Award,
  BookmarkPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  Link2,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  EXPERIENCE_CERTIFICATE_LABELS,
  EXPERIENCE_DIFFICULTY_LABELS,
  EXPERIENCE_STATUS_LABELS,
  normalizeCertificateUrl,
  providerForSimulationUrl,
  type CareerExperience,
  type ExperienceCertificate,
  type ExperienceProgress,
} from '../../../shared/careerExperience';
import type { ExperienceMatch, ExperienceMatchReason } from '../../../shared/experienceMatching';
import { getCareerDomainLabel } from '../../../shared/careerDomains';

interface ExperienceCardProps {
  experience: CareerExperience;
  progress?: ExperienceProgress;
  certificate?: ExperienceCertificate;
  match?: ExperienceMatch;
  isBusy: boolean;
  onSave: () => Promise<void> | void;
  onStart: () => Promise<void> | void;
  onComplete: () => Promise<void> | void;
  onReset: () => Promise<void> | void;
  onSubmitCertificate: (url: string) => Promise<void>;
  onRemoveCertificate: () => Promise<void>;
}

const REASON_KEYS: Record<ExperienceMatchReason['code'], string> = {
  target_domain: 'Matches your target domain',
  target_role: 'Built for your target role',
  skill_gap: 'Practises a skill gap',
  roadmap: 'Appears in your roadmap',
  learning: 'Builds on learning you completed',
  level: 'Fits your experience level',
  explore: 'A place to explore a different domain',
};

/** Renders one recommendation reason, naming the skills it fired on. */
export function experienceReasonText(
  reason: ExperienceMatchReason,
  t: (key: string) => string
): string {
  const label = t(REASON_KEYS[reason.code]);
  if (!reason.skills?.length) return label;
  return `${label}: ${reason.skills.slice(0, 2).join(', ')}`;
}

export const ExperienceCard: React.FC<ExperienceCardProps> = ({
  experience,
  progress,
  certificate,
  match,
  isBusy,
  onSave,
  onStart,
  onComplete,
  onReset,
  onSubmitCertificate,
  onRemoveCertificate,
}) => {
  const { t, settings } = useCareer();
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [certificateUrl, setCertificateUrl] = useState('');
  const [certificateError, setCertificateError] = useState<string | null>(null);

  const officialProvider = useMemo(
    () => providerForSimulationUrl(experience.url),
    [experience.url]
  );

  const status = progress?.status ?? 'not_started';
  const completed = status === 'completed';
  const inProgress = status === 'in_progress';
  const saved = Boolean(progress?.saved) && status === 'not_started';

  const difficultyLabel = t(EXPERIENCE_DIFFICULTY_LABELS[experience.difficulty].en);
  const statusLabel = t(EXPERIENCE_STATUS_LABELS[status].en);
  const domains = experience.domainIds
    .slice(0, 2)
    .map((domainId) => t(getCareerDomainLabel(domainId)));

  const completedOn = progress?.completedAt
    ? new Date(progress.completedAt).toLocaleDateString(
        settings.language === 'ar' ? 'ar' : 'en',
        { dateStyle: 'medium' }
      )
    : null;

  const submitCertificate = async () => {
    const validation = normalizeCertificateUrl(certificateUrl);
    if (!validation.ok) {
      setCertificateError(t(validation.error ?? 'Enter a secure HTTPS link to the certificate.'));
      return;
    }
    setCertificateError(null);
    try {
      await onSubmitCertificate(validation.value as string);
      setCertificateOpen(false);
      setCertificateUrl('');
    } catch (error) {
      setCertificateError(
        error instanceof Error
          ? error.message
          : t('The certificate link could not be saved.')
      );
    }
  };

  const removeCertificate = async () => {
    setCertificateError(null);
    try {
      await onRemoveCertificate();
    } catch (error) {
      setCertificateError(
        error instanceof Error
          ? error.message
          : t('The certificate link could not be removed.')
      );
    }
  };

  return (
    <article className="flex h-full flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 transition-colors hover:border-[var(--border-strong)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          <Sparkles className="h-3 w-3 text-[var(--color-primary-text)]" />
          {t(experience.provider)}
        </span>
        <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
          {difficultyLabel}
        </span>
        <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
          {t(experience.category)}
        </span>
        {status !== 'not_started' && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              completed
                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                : 'bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
            }`}
          >
            {completed ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <PlayCircle className="h-3 w-3" />
            )}
            {statusLabel}
          </span>
        )}
        {saved && (
          <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)]">
            {t('Saved')}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug text-[var(--text-primary)]">
        {experience.title}
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
        {experience.description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {experience.durationLabel ?? `${experience.durationHours ?? '—'}h`}
        </span>
        {domains.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {domains.join(' · ')}
          </span>
        )}
      </div>

      {experience.skills.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {t('Skills practised')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {experience.skills.slice(0, 4).map((skill) => (
              <span
                key={skill.name}
                className="rounded-md bg-[var(--surface-secondary)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)]"
              >
                {skill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {match && match.reasons.some((reason) => reason.code !== 'explore') && (
        <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/60 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <Sparkles className="h-3 w-3" />
            {t('Why this is recommended')}
          </p>
          <ul className="mt-1.5 space-y-1">
            {match.reasons
              .filter((reason) => reason.code !== 'explore')
              .slice(0, 3)
              .map((reason) => (
                <li
                  key={reason.code}
                  className="text-[11px] leading-relaxed text-[var(--text-secondary)]"
                >
                  {experienceReasonText(reason, t)}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-4">
        {completed && (
          <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Award className="h-3.5 w-3.5 text-[var(--color-primary-text)]" />
                {t('Certificate link')}
              </p>
              {certificate && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  {t(EXPERIENCE_CERTIFICATE_LABELS[certificate.status].en)}
                </span>
              )}
            </div>

            {certificate ? (
              <div className="mt-2 space-y-2">
                <a
                  href={certificate.certificateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 break-all text-[11px] font-medium text-[var(--color-primary-text)] hover:underline"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  {t('View certificate')}
                </a>
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {t(
                    'This link is stored as self-reported. Forage and Aionvia have not verified it.'
                  )}
                </p>
                {certificate.status === 'self_reported' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setCertificateOpen((open) => !open)}
                      disabled={isBusy}
                      className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
                    >
                      {t('Edit link')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeCertificate()}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      {t('Remove')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              !certificateOpen && (
                <button
                  type="button"
                  onClick={() => setCertificateOpen(true)}
                  disabled={isBusy}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
                >
                  <Link2 className="h-3 w-3" />
                  {t('Add certificate link')}
                </button>
              )
            )}

            {certificateOpen && certificate?.status !== 'verified' && (
              <div className="mt-2">
                <label
                  htmlFor={`certificate-${experience.id}`}
                  className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]"
                >
                  {t('Certificate link (HTTPS)')}
                </label>
                <input
                  id={`certificate-${experience.id}`}
                  type="url"
                  inputMode="url"
                  value={certificateUrl}
                  onChange={(event) => setCertificateUrl(event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
                {certificateError && (
                  <p className="mt-1 text-[10px] text-red-600 dark:text-red-400" role="alert">
                    {certificateError}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void submitCertificate()}
                    disabled={isBusy || !certificateUrl.trim()}
                    className="rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--color-on-primary)] hover:bg-[var(--accent-secondary)] disabled:opacity-50"
                  >
                    {t('Save certificate link')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCertificateOpen(false);
                      setCertificateError(null);
                    }}
                    className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]"
                  >
                    {t('Cancel')}
                  </button>
                </div>
              </div>
            )}

            {completedOn && (
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                {t('Completed on')} {completedOn}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {officialProvider ? (
            <a
              href={experience.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('Open on Forage')}
            </a>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">
              {t('The official link is unavailable.')}
            </span>
          )}

          {!progress && (
            <>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                {t('Save')}
              </button>
              <button
                type="button"
                onClick={() => void onStart()}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {t('Start')}
              </button>
            </>
          )}

          {saved && (
            <>
              <button
                type="button"
                onClick={() => void onStart()}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                {t('Start')}
              </button>
              <button
                type="button"
                onClick={() => void onReset()}
                disabled={isBusy}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                {t('Remove')}
              </button>
            </>
          )}

          {inProgress && (
            <>
              <button
                type="button"
                onClick={() => void onComplete()}
                disabled={isBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15 disabled:opacity-50 dark:text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('Mark complete')}
              </button>
              <button
                type="button"
                onClick={() => void onReset()}
                disabled={isBusy}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
              >
                {t('Remove')}
              </button>
            </>
          )}

          {completed && (
            <button
              type="button"
              onClick={() => void onReset()}
              disabled={isBusy}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('Reset progress')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

export default ExperienceCard;
