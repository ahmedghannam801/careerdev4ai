/**
 * The administrator email screen.
 *
 * Every number on this panel is a count of rows the platform actually wrote:
 * `email_queue` for the state of a message and `email_events` for what the
 * provider reported. A delivery that the provider has not confirmed is not
 * counted as delivered, and a bounce is never hidden.
 *
 * The panel can also compose an announcement with an email half. It uses the
 * existing announcement engine: targeting, preview, publishing, the inbox
 * ledger and scheduling are the same code the Announcements tab uses. The email
 * is queued from that ledger, so the two cannot disagree about who received it.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MailCheck,
  MailX,
  Megaphone,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  createAnnouncement,
  createAdminEmailDomain,
  fetchAdminEmailLogs,
  fetchAdminEmailOverview,
  previewAdminEmail,
  previewAnnouncement,
  processAdminEmailQueue,
  publishAnnouncement,
  queueAdminDigests,
  releaseBlockedAdminEmails,
  retryAdminEmail,
  scheduleAnnouncement,
  sendAdminEmailTest,
  fetchAdminEmailStatus,
  verifyAdminEmailDomain,
  type AdminEmailCampaign,
  type AdminEmailLog,
  type AdminEmailOverview,
  type AdminEmailStatus,
  type AdminEmailStatusName,
} from '../../lib/adminApi';
import type { AnnouncementCategory, AnnouncementPriority } from '../../../shared/admin';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';
const INPUT =
  'w-full min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/40';
const LABEL = 'block text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)] mb-1.5';

const STATUS_TONES: Record<string, string> = {
  delivered: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  sent: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  processing: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  failed: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  dead_letter: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  blocked: 'border-slate-500/30 bg-slate-500/10 text-[var(--text-muted)]',
  suppressed: 'border-slate-500/30 bg-slate-500/10 text-[var(--text-muted)]',
  bounced: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  complained: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize ${
        STATUS_TONES[status] ?? STATUS_TONES.pending
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone?: string;
}) {
  return (
    <div className={`${CARD} p-3 sm:p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${tone ?? 'text-[var(--color-primary-text)]'}`} />
      </div>
      <div className="mt-1.5 text-xl font-bold tabular-nums text-[var(--text-primary)] sm:text-2xl">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function formatWhen(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const EmailManagementPanel: React.FC = () => {
  const { t } = useCareer();
  const [overview, setOverview] = useState<AdminEmailOverview | null>(null);
  const [legacyStatus, setLegacyStatus] = useState<AdminEmailStatus | null>(null);
  const [logs, setLogs] = useState<AdminEmailLog[]>([]);
  const [statusFilter, setStatusFilter] = useState<AdminEmailStatusName | ''>('');
  const [logSearch, setLogSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showDns, setShowDns] = useState(false);
  const [domainName, setDomainName] = useState('');

  // Campaign composer
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [campaignCategory, setCampaignCategory] = useState<AnnouncementCategory>('general');
  const [campaignPriority, setCampaignPriority] = useState<AnnouncementPriority>('normal');
  const [audienceType, setAudienceType] = useState<'all' | 'target_role'>('all');
  const [audienceValues, setAudienceValues] = useState('');
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [audiencePreview, setAudiencePreview] = useState<{ count: number; summary: string } | null>(null);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string } | null>(null);
  const [composerBusy, setComposerBusy] = useState<string | null>(null);

  const readOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, status] = await Promise.all([
        fetchAdminEmailOverview(),
        fetchAdminEmailStatus().catch(() => null),
      ]);
      setOverview(next);
      setLegacyStatus(status);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t('The email overview could not be loaded.'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  const readLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      setLogs(
        await fetchAdminEmailLogs({
          status: statusFilter || undefined,
          search: logSearch.trim() || undefined,
          limit: 40,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The email log could not be loaded.'));
    } finally {
      setLoadingLogs(false);
    }
  }, [statusFilter, logSearch, t]);

  useEffect(() => {
    void readOverview();
  }, [readOverview]);

  useEffect(() => {
    void readLogs();
  }, [readLogs]);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4000);
  };

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The action failed.'));
    } finally {
      setBusy(null);
    }
  };

  const config = overview?.config;
  const counts = overview?.counts;
  const deliveryReady = Boolean(config?.productionReady);
  const domain = config?.domains?.[0] ?? null;
  const domainRecords = useMemo(
    () => (domain?.records ?? []).filter((record) => record.record && record.value),
    [domain],
  );


  const previewAudience = async () => {
    setComposerBusy('audience');
    setError(null);
    try {
      setAudiencePreview(
        await previewAnnouncement({
          audienceType,
          audienceValues:
            audienceType === 'all'
              ? []
              : audienceValues
                  .split(',')
                  .map((value) => value.trim())
                  .filter(Boolean),
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The audience could not be previewed.'));
    } finally {
      setComposerBusy(null);
    }
  };

  const previewEmail = async () => {
    setComposerBusy('preview');
    setError(null);
    try {
      const rendered = await previewAdminEmail({
        template: 'announcement',
        payload: {
          title: campaignTitle || 'Aionvia update',
          message: campaignBody || 'Your message preview appears here.',
          ctaText: ctaText || 'Open Aionvia',
          ctaUrl: ctaUrl || 'https://aionvia.pages.dev',
        },
      });
      setEmailPreview(rendered);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The preview could not be rendered.'));
    } finally {
      setComposerBusy(null);
    }
  };

  const sendCampaign = async () => {
    if (!campaignTitle.trim() || !campaignBody.trim()) {
      setError(t('A title and a message are required.'));
      return;
    }
    setComposerBusy('send');
    setError(null);
    try {
      const announcement = await createAnnouncement({
        title: campaignTitle.trim(),
        body: campaignBody.trim(),
        category: campaignCategory,
        priority: campaignPriority,
        audienceType,
        audienceValues:
          audienceType === 'all'
            ? []
            : audienceValues
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
        audienceRules: [],
        ctaText: ctaText.trim() || null,
        ctaUrl: ctaUrl.trim() || null,
        linkView: 'dashboard',
        emailEnabled: true,
      });

      if (scheduleAt) {
        await scheduleAnnouncement(announcement.id, new Date(scheduleAt).toISOString());
        flash(t('The campaign is scheduled. Email will be queued when it publishes.'));
      } else {
        await publishAnnouncement(announcement.id);
        flash(t('The campaign was published and its email was queued.'));
      }

      setCampaignTitle('');
      setCampaignBody('');
      setCtaText('');
      setCtaUrl('');
      setScheduleAt('');
      setAudiencePreview(null);
      setEmailPreview(null);
      await Promise.all([readOverview(), readLogs()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('The campaign could not be sent.'));
    } finally {
      setComposerBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {notice}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-3 text-xs text-[var(--color-danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Delivery readiness */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                deliveryReady ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              {deliveryReady ? <MailCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Sending domain')}
                </h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    deliveryReady
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  {deliveryReady ? t('Verified') : t('Not ready for all users')}
                </span>
              </div>
              <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
                {config?.sender ?? legacyStatus?.sender ?? t('Reading configuration…')}
              </p>
              <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-[var(--text-muted)]">
                {config?.reason ??
                  t('The sender domain is verified. Messages can be delivered to any recipient.')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run('test', async () => {
                await sendAdminEmailTest();
                flash(t('A test message was accepted by the provider.'));
              })}
              disabled={Boolean(busy) || !legacyStatus?.apiKeyConfigured}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] disabled:opacity-50"
            >
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {t('Send test')}
            </button>
            <button
              type="button"
              onClick={() => void readOverview()}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] font-semibold text-[var(--text-secondary)]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('Refresh')}
            </button>
          </div>
        </div>

        {!deliveryReady && (
          <div className="border-t border-[var(--border-subtle)] p-4">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1">
                <label className={LABEL} htmlFor="email-domain">
                  {t('Add a sending domain')}
                </label>
                <input
                  id="email-domain"
                  value={domainName}
                  onChange={(event) => setDomainName(event.target.value)}
                  placeholder="aionvia.app"
                  className={INPUT}
                  inputMode="url"
                  autoComplete="off"
                />
              </div>
              <button
                type="button"
                onClick={() => void run('domain', async () => {
                  if (!domainName.trim()) throw new Error(t('Enter a domain first.'));
                  await createAdminEmailDomain(domainName.trim());
                  setDomainName('');
                  setShowDns(true);
                  flash(t('The domain was added. Publish the DNS records, then verify.'));
                  await readOverview();
                })}
                disabled={Boolean(busy)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
              >
                {busy === 'domain' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                {t('Add domain')}
              </button>
              {domain && (
                <button
                  type="button"
                  onClick={() => void run('verify', async () => {
                    const result = await verifyAdminEmailDomain(domain.id);
                    flash(
                      result.domain.status === 'verified'
                        ? t('The domain is verified. Email is now production-ready.')
                        : t('Resend has not verified the domain yet. Check the DNS records.'),
                    );
                    await readOverview();
                  })}
                  disabled={Boolean(busy)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-60"
                >
                  {busy === 'verify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {t('Verify now')}
                </button>
              )}
            </div>

            {domain && (
              <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
                <button
                  type="button"
                  onClick={() => setShowDns((value) => !value)}
                  className="flex w-full items-center justify-between gap-2 text-start"
                >
                  <span className="text-xs font-bold text-[var(--text-primary)]">
                    {domain.name} · <span className="font-medium capitalize text-[var(--text-muted)]">{domain.status.replace('_', ' ')}</span>
                  </span>
                  {showDns ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {showDns && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {t('Add these records at your DNS provider. SPF and DKIM are required; DMARC is strongly recommended.')}
                    </p>
                    <div className="-mx-1 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-start text-[11px]">
                        <thead className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          <tr>
                            <th className="px-1 py-1.5 text-start">{t('Type')}</th>
                            <th className="px-1 py-1.5 text-start">{t('Name')}</th>
                            <th className="px-1 py-1.5 text-start">{t('Value')}</th>
                            <th className="px-1 py-1.5 text-start">{t('Status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domainRecords.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-1 py-2 text-[var(--text-muted)]">
                                {t('No DNS records were returned. Refresh the domain.')}
                              </td>
                            </tr>
                          ) : (
                            domainRecords.map((record) => (
                              <tr key={`${record.record}-${record.name}`} className="border-t border-[var(--border-subtle)]">
                                <td className="px-1 py-2 font-mono font-semibold">{record.type}</td>
                                <td className="max-w-[160px] break-all px-1 py-2 font-mono">{record.name}</td>
                                <td className="max-w-[280px] break-all px-1 py-2 font-mono text-[var(--text-secondary)]">{record.value}</td>
                                <td className="px-1 py-2 capitalize">{record.status || 'pending'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {t('A DMARC record is not created by Resend automatically. Recommended: v=DMARC1; p=none; rua=mailto:support@yourdomain')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label={t('Sent')} value={counts?.sent ?? 0} icon={Send} />
        <Metric label={t('Delivered')} value={counts?.delivered ?? 0} icon={MailCheck} tone="text-emerald-600" />
        <Metric label={t('Pending')} value={(counts?.pending ?? 0) + (counts?.processing ?? 0)} icon={Clock} tone="text-amber-600" />
        <Metric label={t('Failed')} value={(counts?.failed ?? 0) + (counts?.deadLetter ?? 0)} icon={XCircle} tone="text-rose-600" />
        <Metric label={t('Bounced')} value={(counts?.bounced ?? 0) + (counts?.complained ?? 0)} icon={MailX} tone="text-rose-600" />
        <Metric label={t('Suppressed')} value={(counts?.suppressed ?? 0) + (counts?.blocked ?? 0)} icon={Inbox} tone="text-[var(--text-muted)]" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Provider-reported')}</h3>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {t('Last 30 days')}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            {[
              [t('Delivered'), overview?.last30Days.delivered ?? 0],
              [t('Bounced'), overview?.last30Days.bounced ?? 0],
              [t('Opened'), overview?.last30Days.opened ?? 0],
              [t('Clicked'), overview?.last30Days.clicked ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-[var(--surface-secondary)]/50 p-2.5">
                <div className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">{label}</div>
                <div className="mt-0.5 text-lg font-bold tabular-nums">{Number(value).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            {t('Opens and clicks are recorded only when Resend sends the webhook for them.')}
          </p>
        </div>

        <div className={`${CARD} p-4`}>
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <BarChart3 className="h-4 w-4 text-[var(--color-primary-text)]" />
            {t('Queue controls')}
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {t('The queue runs on the cron every five minutes. These controls run a pass immediately.')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run('process', async () => {
                const result = await processAdminEmailQueue({ limit: 20 });
                flash(t('The queue was processed.') + ` ${JSON.stringify(result.summary)}`);
                await Promise.all([readOverview(), readLogs()]);
              })}
              disabled={Boolean(busy)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
            >
              {busy === 'process' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {t('Process now')}
            </button>
            <button
              type="button"
              onClick={() => void run('digests', async () => {
                await queueAdminDigests(true);
                flash(t('Digest generation ran. Any new digest is queued.'));
                await readLogs();
              })}
              disabled={Boolean(busy)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] disabled:opacity-60"
            >
              {busy === 'digests' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {t('Run digests')}
            </button>
            <button
              type="button"
              onClick={() => void run('release', async () => {
                const released = await releaseBlockedAdminEmails();
                flash(`${released} ${t('blocked messages were released.')}`);
                await Promise.all([readOverview(), readLogs()]);
              })}
              disabled={Boolean(busy)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] disabled:opacity-60"
            >
              {busy === 'release' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {t('Release blocked')}
            </button>
          </div>
        </div>
      </div>

      {/* Campaign composer */}
      <div className={`${CARD} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
              <Megaphone className="h-4 w-4 text-[var(--color-primary-text)]" />
              {t('Email announcement')}
            </h3>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {t(
                'Publishes an in-app announcement and queues the same message by email. Target it, preview it, then send now or schedule it.',
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <label className={LABEL} htmlFor="campaign-title">{t('Title')}</label>
              <input
                id="campaign-title"
                value={campaignTitle}
                onChange={(event) => setCampaignTitle(event.target.value)}
                className={INPUT}
                maxLength={200}
                placeholder={t('What is new?')}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="campaign-body">{t('Message')}</label>
              <textarea
                id="campaign-body"
                value={campaignBody}
                onChange={(event) => setCampaignBody(event.target.value)}
                className={`${INPUT} min-h-28 resize-y py-2`}
                maxLength={5000}
                placeholder={t('Write the message the candidate will receive.')}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="campaign-category">{t('Category')}</label>
                <select
                  id="campaign-category"
                  value={campaignCategory}
                  onChange={(event) => setCampaignCategory(event.target.value as AnnouncementCategory)}
                  className={INPUT}
                >
                  <option value="general">General</option>
                  <option value="product">Product</option>
                  <option value="opportunity">Opportunity</option>
                  <option value="learning">Learning</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="celebration">Celebration</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="campaign-priority">{t('Priority')}</label>
                <select
                  id="campaign-priority"
                  value={campaignPriority}
                  onChange={(event) => setCampaignPriority(event.target.value as AnnouncementPriority)}
                  className={INPUT}
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="campaign-cta-text">{t('Button label')}</label>
                <input
                  id="campaign-cta-text"
                  value={ctaText}
                  onChange={(event) => setCtaText(event.target.value)}
                  className={INPUT}
                  maxLength={80}
                  placeholder={t('Open Aionvia')}
                />
              </div>
              <div>
                <label className={LABEL} htmlFor="campaign-schedule">{t('Schedule (optional)')}</label>
                <input
                  id="campaign-schedule"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(event) => setScheduleAt(event.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
            <div>
              <label className={LABEL} htmlFor="campaign-cta-url">{t('Button URL')}</label>
              <input
                id="campaign-cta-url"
                value={ctaUrl}
                onChange={(event) => setCtaUrl(event.target.value)}
                className={INPUT}
                inputMode="url"
                placeholder="https://aionvia.pages.dev"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--border-subtle)] p-3">
              <div className="text-xs font-bold text-[var(--text-primary)]">{t('Audience')}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(['all', 'target_role'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAudienceType(type)}
                    className={`min-h-9 rounded-lg border px-3 text-[11px] font-semibold ${
                      audienceType === type
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {type === 'all' ? t('All users') : t('By target role')}
                  </button>
                ))}
              </div>
              {audienceType === 'target_role' && (
                <div className="mt-2">
                  <label className={LABEL} htmlFor="campaign-audience">{t('Target roles (comma separated)')}</label>
                  <input
                    id="campaign-audience"
                    value={audienceValues}
                    onChange={(event) => setAudienceValues(event.target.value)}
                    className={INPUT}
                    placeholder="Data Analyst, Product Manager"
                  />
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void previewAudience()}
                  disabled={composerBusy === 'audience'}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] font-semibold text-[var(--text-secondary)] disabled:opacity-60"
                >
                  {composerBusy === 'audience' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {t('Preview audience')}
                </button>
                {audiencePreview && (
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
                    {audiencePreview.count.toLocaleString()} {t('recipients')} · {audiencePreview.summary}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void previewEmail()}
                disabled={composerBusy === 'preview'}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-secondary)] disabled:opacity-60"
              >
                {composerBusy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                {t('Preview email')}
              </button>
              <button
                type="button"
                onClick={() => void sendCampaign()}
                disabled={composerBusy === 'send'}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-60"
              >
                {composerBusy === 'send' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {scheduleAt ? t('Schedule campaign') : t('Publish & queue email')}
              </button>
            </div>

            {emailPreview && (
              <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-3 py-2">
                  <span className="truncate text-[11px] font-semibold text-[var(--text-primary)]">
                    {emailPreview.subject}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEmailPreview(null)}
                    className="text-[10px] font-semibold text-[var(--text-muted)]"
                  >
                    {t('Close')}
                  </button>
                </div>
                <iframe
                  title={t('Email preview')}
                  srcDoc={emailPreview.html}
                  className="h-[420px] w-full bg-white"
                  sandbox=""
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Campaigns */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] p-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Campaign performance')}</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {t('From Resend events')}
          </span>
        </div>
        {overview?.campaigns?.length ? (
          <div className="divide-y divide-[var(--border-subtle)]">
            {overview.campaigns.map((campaign: AdminEmailCampaign) => (
              <div key={campaign.id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-[var(--text-primary)]">{campaign.title}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {campaign.audienceSummary ?? 'Everyone'} ·{' '}
                      {campaign.publishedAt ? formatWhen(campaign.publishedAt) : t('Not published')}
                    </div>
                  </div>
                  <StatusPill status={campaign.status} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-6">
                  {[
                    [t('Queued'), campaign.queued],
                    [t('Accepted'), campaign.sent],
                    [t('Delivered'), campaign.delivered],
                    [t('Failed'), campaign.failed],
                    [t('Blocked'), campaign.blocked],
                    [t('Bounced'), campaign.bounced],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg bg-[var(--surface-secondary)]/50 px-2 py-1.5">
                      <div className="text-[9px] font-semibold uppercase text-[var(--text-muted)]">{label}</div>
                      <div className="font-bold tabular-nums">{Number(value).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-xs text-[var(--text-muted)]">{t('No email campaigns yet.')}</p>
        )}
      </div>

      {/* Logs */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] p-3.5">
          <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Email log')}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={logSearch}
              onChange={(event) => setLogSearch(event.target.value)}
              placeholder={t('Search recipient or template')}
              className="min-h-9 w-44 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 text-[11px]"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as AdminEmailStatusName | '')}
              className="min-h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2 text-[11px]"
            >
              <option value="">{t('All statuses')}</option>
              {['pending', 'processing', 'sent', 'delivered', 'failed', 'dead_letter', 'blocked', 'suppressed', 'bounced', 'complained'].map(
                (status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        <div className="divide-y divide-[var(--border-subtle)]">
          {loadingLogs && logs.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-xs text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('Loading…')}
            </div>
          ) : logs.length === 0 ? (
            <p className="p-4 text-xs text-[var(--text-muted)]">{t('No messages match this view.')}</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={log.status} />
                      <span className="text-[11px] font-bold text-[var(--text-primary)]">{log.template}</span>
                      <span className="text-[10px] text-[var(--text-muted)]">{log.category}</span>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">{log.recipient}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {formatWhen(log.created_at)} · {t('Attempt')} {log.attempt}/{log.max_attempts}
                      {log.provider_message_id ? ` · ${log.provider_message_id}` : ''}
                    </div>
                    {log.last_error && (
                      <div className="mt-1 max-w-2xl break-words text-[10px] text-[var(--color-danger)]">
                        {log.last_error}
                      </div>
                    )}
                  </div>
                  {['failed', 'dead_letter', 'blocked', 'bounced', 'complained'].includes(log.status) && (
                    <button
                      type="button"
                      onClick={() => void run(`retry-${log.id}`, async () => {
                        await retryAdminEmail(log.id);
                        flash(t('The message was put back in the queue.'));
                        await Promise.all([readOverview(), readLogs()]);
                      })}
                      disabled={Boolean(busy)}
                      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-2.5 text-[10px] font-semibold text-[var(--text-secondary)] disabled:opacity-60"
                    >
                      {busy === `retry-${log.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      {t('Retry')}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
