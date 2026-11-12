import React from 'react';
import { ArrowRight, Clock } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import { getActionIcon } from './activityIcons';
import { activityBadge } from '../../../shared/activityStatus';

/**
 * The dashboard's Recent Activity panel.
 *
 * It shows the user's own recorded activity — nothing is generated and
 * nothing is estimated. Every row comes from the same PostgreSQL activity
 * ledger the full Activity Center reads, so the two can never disagree.
 *
 * The panel is deliberately a summary: the most recent handful of events,
 * each one a link to the place it happened. The full history lives on its
 * own route, which the panel links to.
 */

interface RecentActivityPanelProps {
  /** Where a row navigates to when it is activated. */
  onNavigate: (view: string) => void;
  /** How many rows to show. */
  limit?: number;
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({
  onNavigate,
  limit = 5,
}) => {
  const { activities, t } = useCareer();

  const recent = activities.slice(0, limit);

  return (
    <section
      aria-labelledby="dashboard-recent-activity"
      className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            <Clock className="h-3 w-3" />
            {t('Recent activity')}
          </div>
          <h2 id="dashboard-recent-activity" className="mt-0.5 text-base font-bold text-[var(--text-primary)]">
            {t('What you have actually done')}
          </h2>
        </div>
        {activities.length > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('activity')}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--color-primary-text)] transition-colors hover:underline"
          >
            <span>{t('See all activity')}</span>
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </button>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center text-xs leading-relaxed text-[var(--text-secondary)]">
          {t(
            'Nothing is recorded yet. Complete a roadmap task, submit an application or finish a mock interview and it will appear here.'
          )}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
          {recent.map((item) => {
            const Icon = getActionIcon(item.actionType);
            const badge = activityBadge(item.actionType);
            const body = (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-surface)] text-[var(--color-primary-text)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[var(--text-primary)]">{item.title}</span>
                    <span
                      title={t(badge.description)}
                      className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-secondary)]"
                    >
                      {t(badge.label)}
                    </span>
                    {item.relatedObject && (
                      <span className="rounded bg-[var(--surface-secondary)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                        {item.relatedObject}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">
                    {item.subtitle}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
                  {item.timestamp}
                </span>
              </>
            );

            return (
              <li key={item.id}>
                {item.linkView ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(item.linkView!)}
                    className="flex w-full items-center gap-3 py-2.5 text-start transition-colors hover:bg-[var(--surface-secondary)]/50"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RecentActivityPanel;
