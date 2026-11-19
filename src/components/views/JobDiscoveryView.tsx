/**
 * The job discovery dashboard.
 *
 * It answers the question the search screen cannot: what does the market
 * look like from where this candidate stands? How many openings the platform
 * can actually read, how much of that market fits this candidate, and — the
 * useful part — which skills employers keep asking for that the candidate's
 * own record does not show.
 *
 * Every figure carries its own calculation. A number the reader cannot check
 * is decoration, so each one says where it came from and how it was worked
 * out, and a figure that could not be computed is left out rather than shown
 * as zero.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Activity, BarChart3, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { apiRequest, ApiRequestError } from '../../lib/apiClient';
import { useCareer } from '../../context/CareerContext';
import { JOB_SOURCE_LABELS } from '../../../shared/jobs';
import { EmptyState } from '../ui/EmptyState';

interface CountedValue {
  value: string;
  count: number;
}

interface JobInsights {
  openingsRead: number;
  openingsMeasured: number;
  strongMatches: number;
  strongThreshold: number;
  bySource: CountedValue[];
  bySeniority: CountedValue[];
  byEmploymentType: CountedValue[];
  remoteShare: { remote: number; of: number; percent: number } | null;
  topMissingSkills: CountedValue[];
  topMatchedSkills: CountedValue[];
  biggestGaps: { jobId: string; title: string; company: string; missing: string[]; score: number }[];
}

interface JobInsightsResponse {
  insights: JobInsights;
  checkedAt: string;
  boardsRead: string[];
  boardsFailed: string[];
  candidate: {
    skillCount: number;
    experienceLevel: string | null;
    targetOpportunityType: string | null;
    educationLevel: string | null;
    location: string | null;
    targetRole: string | null;
  };
}

interface JobDiscoveryViewProps {
  onNavigate: (view: string) => void;
}

/** One figure, with the calculation that produced it. */
function Figure({
  label,
  value,
  calculation,
  icon,
}: {
  label: string;
  value: string;
  calculation: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {icon}
        {label}
      </p>
      <p className="text-2xl font-bold text-[var(--color-primary-text)]">{value}</p>
      <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">{calculation}</p>
    </div>
  );
}

/** A counted list, as bars. */
function Breakdown({ title, rows, t }: { title: string; rows: CountedValue[]; t: (key: string) => string }) {
  if (!rows.length) return null;
  const largest = Math.max(...rows.map((row) => row.count));

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-[var(--text-primary)]">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.value} className="flex items-center gap-2 text-[11px]">
            <span className="w-28 shrink-0 truncate text-[var(--text-secondary)]">
              {row.value === 'not stated' ? t('Not stated') : row.value}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
              <span
                className="block h-full rounded-full bg-[var(--accent-primary)]"
                style={{ width: `${Math.max(6, Math.round((row.count / largest) * 100))}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-end font-semibold text-[var(--text-primary)]">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const JobDiscoveryView: React.FC<JobDiscoveryViewProps> = ({ onNavigate }) => {
  const { t } = useCareer();
  const [data, setData] = useState<JobInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiRequest<JobInsightsResponse>('/api/jobs/insights'));
    } catch (caught) {
      setData(null);
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : t('The job market could not be read.')
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-[var(--text-secondary)]">{t('Reading the live job market…')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <EmptyState
          title={t('The job market could not be read')}
          description={error ?? t('The job market could not be read.')}
          actionLabel={t('Try again')}
          onAction={() => void load()}
        />
      </div>
    );
  }

  const { insights, boardsRead, boardsFailed, candidate } = data;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--color-primary-text)]">
          <BarChart3 className="h-5 w-5" />
          {t('Job discovery')}
        </h1>
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {t('Every figure below comes from the openings this platform really read, and states how it was worked out.')}
        </p>
        <p className="text-[11px] text-[var(--text-muted)]">
          {t('Boards read')}: {boardsRead.length ? boardsRead.join(', ') : t('None')}
          {boardsFailed.length > 0 ? ` · ${t('Boards that failed')}: ${boardsFailed.join(', ')}` : ''}
        </p>
      </header>

      {/* The figures. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t('Openings read')}
          value={String(insights.openingsRead)}
          calculation={t('How many openings the platform read from the boards above.')}
          icon={<Activity className="h-3.5 w-3.5" />}
        />
        <Figure
          label={t('Measured against your record')}
          value={String(insights.openingsMeasured)}
          calculation={t('How many of those could be compared with your own record.')}
          icon={<BarChart3 className="h-3.5 w-3.5" />}
        />
        <Figure
          label={t('Strong matches')}
          value={String(insights.strongMatches)}
          calculation={t('How many scored at or above {threshold} out of 100.').replace(
            '{threshold}',
            String(insights.strongThreshold)
          )}
          icon={<Sparkles className="h-3.5 w-3.5" />}
        />
        <Figure
          label={t('Remote share')}
          value={
            insights.remoteShare
              ? t('{percent}%').replace('{percent}', String(insights.remoteShare.percent))
              : t('Not stated')
          }
          calculation={
            insights.remoteShare
              ? t('{remote} of the {of} openings that said whether they are remote.').replace(
                  '{remote}',
                  String(insights.remoteShare.remote)
                ).replace('{of}', String(insights.remoteShare.of))
              : t('No opening said whether it is remote, so no share can be worked out.')
          }
          icon={<MapPin className="h-3.5 w-3.5" />}
        />
      </div>

      {/* The gap: what the market asks for that the candidate does not have. */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-[var(--color-primary-text)]">
          {t('What the market asks for that your record does not show')}
        </h2>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {t('Each skill is counted once per opening that asks for it, across the openings read.')}
        </p>

        {insights.topMissingSkills.length ? (
          <ul className="flex flex-wrap gap-2">
            {insights.topMissingSkills.map((entry) => (
              <li
                key={entry.value}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-1 text-[11px] font-semibold text-[var(--color-warning)]"
              >
                <TrendingUp className="h-3 w-3" />
                {entry.value}
                <span className="font-normal text-[var(--text-secondary)]">
                  {t('in {count} openings').replace('{count}', String(entry.count))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('No opening asked for a skill your record does not show.')}
          </p>
        )}

        {insights.topMissingSkills.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('skills')}
            className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)]"
          >
            {t('Work on these in the Skills Centre')}
          </button>
        )}
      </section>

      {/* The strengths. */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-[var(--color-primary-text)]">
          {t('What the market asks for that your record already shows')}
        </h2>
        {insights.topMatchedSkills.length ? (
          <ul className="flex flex-wrap gap-2">
            {insights.topMatchedSkills.map((entry) => (
              <li
                key={entry.value}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success-surface)] px-3 py-1 text-[11px] font-semibold text-[var(--color-success-strong)]"
              >
                {entry.value}
                <span className="font-normal text-[var(--text-secondary)]">
                  {t('in {count} openings').replace('{count}', String(entry.count))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            {t('No opening asked for a skill your record shows yet.')}
          </p>
        )}
      </section>

      {/* The breakdowns. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Breakdown
          title={t('Openings per board')}
          rows={insights.bySource.map((row) => ({
            ...row,
            value: JOB_SOURCE_LABELS[row.value as keyof typeof JOB_SOURCE_LABELS] ?? row.value,
          }))}
          t={t}
        />
        <Breakdown title={t('Openings per level')} rows={insights.bySeniority} t={t} />
        <Breakdown title={t('Openings per employment type')} rows={insights.byEmploymentType} t={t} />
      </div>

      {/* The biggest gaps. */}
      {insights.biggestGaps.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-[var(--color-primary-text)]">
            {t('The openings that ask for the most you do not have')}
          </h2>
          <ul className="space-y-2">
            {insights.biggestGaps.map((gap) => (
              <li
                key={gap.jobId}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3 text-[11px]"
              >
                <p className="font-semibold text-[var(--text-primary)]">
                  {gap.title} · {gap.company}
                </p>
                <p className="mt-0.5 text-[var(--text-secondary)]">
                  {t('Your fit: {score}%').replace('{score}', String(gap.score))} ·{' '}
                  {gap.missing.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What the figures were measured against. */}
      <footer className="border-t border-[var(--border-subtle)] pt-3 text-[11px] text-[var(--text-muted)]">
        {t('Measured against your record')}: {candidate.skillCount}{' '}
        {t('skills')}
        {candidate.experienceLevel ? ` · ${candidate.experienceLevel}` : ''}
        {candidate.targetRole ? ` · ${candidate.targetRole}` : ''}
        {candidate.location ? ` · ${candidate.location}` : ''}
      </footer>
    </div>
  );
};

export default JobDiscoveryView;
