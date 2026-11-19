/**
 * Two or more vacancies, side by side.
 *
 * The comparison shows what differs: the score each posting was given, the
 * skills the candidate meets and the ones they do not, the skills every
 * posting asks for, and the factor each posting leads on. It does not decide
 * which posting is better — that is the candidate's judgement, and the panel
 * exists to make it possible rather than to make it.
 *
 * The layout is one column on a narrow screen and one column per posting on a
 * wide one. Every side property is logical, so the panel reads the same way
 * in Arabic as it does in English.
 */

import React from 'react';
import { Check, Minus, Scale } from 'lucide-react';
import type { JobComparison } from '../../lib/jobsApi';

interface JobComparisonPanelProps {
  comparison: JobComparison;
  /** Translates a source string. */
  t: (key: string) => string;
}

/** The labels of the factors, in the interface's own words. */
const FACTOR_LABELS: Record<string, string> = {
  requiredSkills: 'Required skills',
  preferredSkills: 'Preferred skills',
  experience: 'Experience / seniority',
  education: 'Education',
  location: 'Location / work type',
};

export const JobComparisonPanel: React.FC<JobComparisonPanelProps> = ({ comparison, t }) => {
  const { entries, commonRequirements, uniqueRequirements, leadsOn } = comparison;

  if (entries.length < 2) return null;

  return (
    <section
      aria-label={t('Compare vacancies')}
      className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5"
    >
      <header className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-[var(--color-primary-text)]" />
        <h3 className="text-sm font-bold text-[var(--color-primary-text)]">
          {t('Compare vacancies')}
        </h3>
      </header>

      {/* One column per posting on a wide screen, stacked on a narrow one. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {entries.map((entry) => {
          const leads = leadsOn[entry.job.id] ?? [];
          const unique = uniqueRequirements[entry.job.id] ?? [];

          return (
            <article
              key={entry.job.id}
              className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-4"
            >
              <header className="space-y-1">
                <h4 className="text-sm font-bold text-[var(--text-primary)]">{entry.job.title}</h4>
                <p className="text-xs text-[var(--text-secondary)]">{entry.job.company}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {entry.job.location ?? t('Location not given')}
                  {entry.job.isRemote ? ` · ${t('Remote')}` : ''}
                </p>
              </header>

              <p className="text-sm font-bold text-[var(--color-primary-text)]">
                {t('Your fit: {score}%').replace('{score}', String(entry.match.score))}
              </p>

              {/* The skills the candidate meets, and the ones they do not. */}
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('You meet')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.met.length ? (
                      entry.met.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-success-strong)]"
                        >
                          <Check className="h-3 w-3" />
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">{t('None')}</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {t('Still needed')}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {entry.missing.length ? (
                      entry.missing.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-primary)]"
                        >
                          <Minus className="h-3 w-3" />
                          {skill}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-[var(--text-muted)]">{t('None')}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* What only this posting asks for. */}
              {unique.length > 0 && (
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {t('Only this one asks for')}: {unique.join(', ')}
                </p>
              )}

              {/* The factor this posting leads on. */}
              <p className="text-[11px] text-[var(--text-secondary)]">
                {leads.length
                  ? `${t('Strongest on')}: ${leads
                      .map((factor) => t(FACTOR_LABELS[factor] ?? factor))
                      .join(', ')}`
                  : t('No factor stands out on this posting.')}
              </p>
            </article>
          );
        })}
      </div>

      {/* The skills every posting asks for. */}
      {commonRequirements.length > 0 && (
        <footer className="space-y-1 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-[11px] font-semibold text-[var(--text-primary)]">
            {t('Every posting here asks for')}: {commonRequirements.join(', ')}
          </p>
        </footer>
      )}
    </section>
  );
};

export default JobComparisonPanel;
