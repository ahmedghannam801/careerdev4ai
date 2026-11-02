/**
 * The traffic panel of the Admin Center.
 *
 * It shows what the Google Analytics property recorded: how many people
 * arrived, where they came from, what they read, what they used and how far
 * they got through the product.
 *
 * The panel reads the property through the server, which holds the Google
 * authorisation. The browser never sees a credential. When the property is not
 * connected on this deployment, the panel says so and explains what to add,
 * rather than showing a page of zeroes that look like a broken product.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Globe2,
  Laptop,
  Loader2,
  MousePointerClick,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';
import {
  fetchTrafficReport,
  type TrafficReport,
} from '../../lib/adminApi';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

/** A number, with a caption that says what the number is. */
function Metric({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  hint?: string;
}) {
  return (
    <div className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
        <Icon className="h-4 w-4 text-[var(--color-primary-text)]" />
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
        {value.toLocaleString()}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

/** A horizontal bar that shows a share of a total. */
function ShareBar({ share }: { share: number }) {
  const percent = Math.max(0, Math.min(100, Math.round(share * 100)));
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-secondary)]">
      <div
        className="h-full rounded-full bg-[var(--accent-primary)]"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** The section of a panel. */
function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className={`${CARD} p-4`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Icon className="h-4 w-4 text-[var(--color-primary-text)]" />
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The message shown when the property is not connected. */
function NotConnected({ message }: { message?: string }) {
  const { t } = useCareer();
  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent-strong)]" />
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Google Analytics is not connected')}
          </h3>
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            {message ??
              t(
                'The measurement works on the browser side, but the property is not readable from the server yet.'
              )}
          </p>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('To connect it')}
            </p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-xs text-[var(--text-secondary)]">
              <li>
                <code className="font-mono text-[11px]">GA4_PROPERTY_ID</code> — {t('the numeric property id')}
              </li>
              <li>
                <code className="font-mono text-[11px]">GA4_CLIENT_ID</code> — {t('the OAuth client id')}
              </li>
              <li>
                <code className="font-mono text-[11px]">GA4_CLIENT_SECRET</code> —{' '}
                {t('the OAuth client secret')}
              </li>
              <li>
                <code className="font-mono text-[11px]">GA4_REFRESH_TOKEN</code> — {t('the refresh token')}
              </li>
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
              {t(
                'The authorisation must include the analytics read-only scope, and the account that granted it needs "Read & analyze" access to the property in Google Analytics. The credentials stay on the server and are never sent to the browser.'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The traffic panel. */
export const TrafficAnalyticsPanel: React.FC = () => {
  const { t } = useCareer();
  const [report, setReport] = useState<TrafficReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await fetchTrafficReport());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'The traffic report could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sessionTotal = useMemo(
    () => (report?.sources ?? []).reduce((sum, source) => sum + source.sessions, 0),
    [report]
  );

  if (loading && !report) {
    return (
      <div className={`${CARD} flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-secondary)]`}>
        <Loader2 className="h-4 w-4 animate-spin" /> {t('Reading the analytics property…')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
        {error}
      </div>
    );
  }

  if (!report) return null;

  if (!report.connected) {
    return <NotConnected message={report.message} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--text-muted)]">
          {t('Last measured')}:{' '}
          {new Date(report.measuredAt).toLocaleString()}
          {report.propertyId ? ` · ${report.propertyId}` : ''}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label={t('Visitors today')} value={report.today.activeUsers} icon={Users} />
        <Metric label={t('Visitors this week')} value={report.last7Days.activeUsers} icon={Users} />
        <Metric label={t('Visitors this month')} value={report.last30Days.activeUsers} icon={Users} />
        <Metric label={t('Total users')} value={report.totals.totalUsers} icon={Activity} />
        <Metric label={t('Sessions this month')} value={report.last30Days.sessions} icon={TrendingUp} />
        <Metric label={t('Page views this month')} value={report.last30Days.pageViews} icon={TrendingUp} />
        <Metric label={t('New users')} value={report.totals.newUsers} icon={Users} />
        <Metric label={t('Returning users')} value={report.totals.returningUsers} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('Traffic sources')} icon={TrendingUp}>
          {report.sources.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No data for this period')}</p>
          ) : (
            <ul className="space-y-3">
              {report.sources.map((source) => (
                <li key={`${source.source}-${source.channel}`}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-[var(--text-primary)]">{source.source}</span>
                    <span className="text-[var(--text-muted)]">
                      {source.sessions.toLocaleString()} {t('sessions')} ·{' '}
                      {source.users.toLocaleString()} {t('users')}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--text-muted)]">{source.channel}</div>
                  <ShareBar
                    share={sessionTotal > 0 ? source.sessions / sessionTotal : 0}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('Top pages')} icon={TrendingUp}>
          {report.topPages.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No data for this period')}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-1 font-semibold">{t('Page')}</th>
                  <th className="py-1 text-end font-semibold">{t('Views')}</th>
                  <th className="py-1 text-end font-semibold">{t('Users')}</th>
                </tr>
              </thead>
              <tbody>
                {report.topPages.map((page) => (
                  <tr key={page.path} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 pe-2">
                      <span className="block truncate font-mono text-[11px] text-[var(--text-primary)]">
                        {page.path}
                      </span>
                      {page.title ? (
                        <span className="block truncate text-[10px] text-[var(--text-muted)]">
                          {page.title}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-end tabular-nums text-[var(--text-secondary)]">
                      {page.views.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-end tabular-nums text-[var(--text-secondary)]">
                      {page.users.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('Devices')} icon={Laptop}>
          {report.devices.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No data for this period')}</p>
          ) : (
            <ul className="space-y-3">
              {report.devices.map((device) => (
                <li key={device.device}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium capitalize text-[var(--text-primary)]">
                      {device.device}
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {device.sessions.toLocaleString()} {t('sessions')}
                    </span>
                  </div>
                  <ShareBar
                    share={
                      report.last30Days.sessions > 0
                        ? device.sessions / report.last30Days.sessions
                        : 0
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('Geography')} icon={Globe2}>
          {report.countries.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">{t('No data for this period')}</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="py-1 font-semibold">{t('Country')}</th>
                  <th className="py-1 text-end font-semibold">{t('Users')}</th>
                  <th className="py-1 text-end font-semibold">{t('Sessions')}</th>
                </tr>
              </thead>
              <tbody>
                {report.countries.map((country) => (
                  <tr key={country.country} className="border-t border-[var(--border-subtle)]">
                    <td className="py-1.5 text-[var(--text-primary)]">{country.country}</td>
                    <td className="py-1.5 text-end tabular-nums text-[var(--text-secondary)]">
                      {country.users.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-end tabular-nums text-[var(--text-secondary)]">
                      {country.sessions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>

      <Section title={t('Conversion funnel')} icon={MousePointerClick}>
        {report.funnel.every((step) => step.count === 0) ? (
          <p className="text-xs text-[var(--text-muted)]">{t('No data for this period')}</p>
        ) : (
          <ul className="space-y-2.5">
            {report.funnel.map((step) => (
              <li key={step.event}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-[var(--text-primary)]">{step.step}</span>
                  <span className="text-[var(--text-muted)]">
                    {step.count.toLocaleString()} {t('events')} · {step.users.toLocaleString()}{' '}
                    {t('users')}
                  </span>
                </div>
                <ShareBar share={step.rate} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
