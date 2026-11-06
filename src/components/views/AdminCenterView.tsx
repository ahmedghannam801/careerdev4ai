/**
 * The Admin Center.
 *
 * This is the real administrative surface: administrators, announcement
 * composition and delivery, opportunity verification, learning curation and
 * the audit trail. Every action calls the API, and the API re-checks the
 * verified caller's permission. The tabs below are therefore a convenience,
 * not the security boundary.
 *
 * The visual language stays inside the existing CareerDev4AI shell: the same
 * cards, borders, radii and typography as the rest of the product.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Eye,
  Flag,
  GraduationCap,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Star,
  Trash2,
  TrendingUp,
  Users,
  CreditCard,
  Smartphone,
  DollarSign,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useAdminAccess } from '../../lib/useAdminAccess';
import { AnnouncementsPanel } from '../admin/AnnouncementsPanel';
import { TrafficAnalyticsPanel } from '../admin/TrafficAnalyticsPanel';
import { AdminSubscriptionsPanel } from '../admin/AdminSubscriptionsPanel';
import { AdminPaymentsPanel } from '../admin/AdminPaymentsPanel';
import { AdminRevenuePanel } from '../admin/AdminRevenuePanel';
import {
  createAdmin,
  deleteAdmin,
  fetchAdminAnalytics,
  fetchAdminAudit,
  fetchAdminLearning,
  fetchAdminOpportunities,
  fetchAdmins,
  patchAdmin,
  patchAdminCourse,
  patchAdminOpportunity,
  reportAdminIssue,
  type AdminAnalytics,
  type AdminAuditEntry,
  type AdminDTO,
} from '../../lib/adminApi';
import type { LearningCourse } from '../../types/learning';
import type { VolunteerOpportunity } from '../../lib/personalizationApi';
import { RESOURCE_TYPE_LABELS, type LearningResourceType } from '../../../shared/learningResources';
import {
  ADMIN_ROLE_DESCRIPTIONS,
  ADMIN_ROLE_LABELS,
  type AdminRole,
} from '../../../shared/admin';
import { OPPORTUNITY_LABELS, type OpportunityKind } from '../../../shared/opportunities';

type AdminTab =
  | 'overview'
  | 'traffic'
  | 'announcements'
  | 'admins'
  | 'opportunities'
  | 'learning'
  | 'audit'
  | 'subscriptions'
  | 'payments'
  | 'revenue';

const ROLE_OPTIONS: AdminRole[] = [
  'super_admin',
  'content_admin',
  'opportunity_admin',
  'moderator',
];

const RESPONSIVE_TABLE = 'w-full text-left text-xs';
const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : '—';
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'published' || status === 'active' || status === 'verified'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'archived' || status === 'disabled' || status === 'rejected'
        ? 'border-slate-500/30 bg-slate-500/10 text-[var(--text-muted)]'
        : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${tone}`}>
      {status}
    </span>
  );
}

/**
 * A moderator records a report. The reason is required by the API; the write
 * goes to the persistent audit trail rather than a client-only flag.
 */
function ReportButton({
  label,
  disabled,
  onReport,
}: {
  label: string;
  disabled?: boolean;
  onReport: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onReport}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)] disabled:opacity-50"
      title={label}
    >
      <Flag className="h-3 w-3" /> {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Administrators                                                             */
/* -------------------------------------------------------------------------- */

function AdminsPanel({ me, onChanged }: { me: AdminDTO; onChanged: () => void }) {
  const { t } = useCareer();
  const [admins, setAdmins] = useState<AdminDTO[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('content_admin');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAdmins(await fetchAdmins());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Administrators could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy('add');
    setError(null);
    setNotice(null);
    try {
      await createAdmin({ email: email.trim(), role });
      setEmail('');
      setNotice(t('Administrator added.'));
      await load();
      onChanged();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : 'The administrator could not be added.');
    } finally {
      setBusy(null);
    }
  };

  const change = async (admin: AdminDTO, patch: Parameters<typeof patchAdmin>[1]) => {
    setBusy(admin.id);
    setError(null);
    setNotice(null);
    try {
      await patchAdmin(admin.id, patch);
      setNotice(t('Administrator updated.'));
      await load();
      onChanged();
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'The change failed.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (admin: AdminDTO) => {
    if (!window.confirm(`${t('Remove')} ${admin.email} ${t('from the administrative team?')}`)) return;
    setBusy(admin.id);
    setError(null);
    try {
      await deleteAdmin(admin.id);
      setNotice(t('Administrator removed.'));
      await load();
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'The administrator could not be removed.');
    } finally {
      setBusy(null);
    }
  };

  const inputClass =
    'rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]';

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3 text-xs text-[var(--color-success-strong)]">
          {notice}
        </div>
      )}

      <form onSubmit={add} className={`${CARD} flex flex-col gap-2 p-4 sm:flex-row sm:items-end`}>
        <label className="flex-1 space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          {t('Account email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            className={`${inputClass} w-full`}
          />
        </label>
        <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
          {t('Role')}
          <select value={role} onChange={(event) => setRole(event.target.value as AdminRole)} className={inputClass}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {ADMIN_ROLE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy !== null || !email.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] hover:opacity-90 disabled:opacity-50"
        >
          {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {t('Add admin')}
        </button>
      </form>

      <p className="text-[11px] text-[var(--text-muted)]">
        {t('Administrators are identified by their verified account email. Only a Super Admin can change this team.')}
      </p>

      {loading ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading administrators…')}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className={RESPONSIVE_TABLE}>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">{t('Name')}</th>
                  <th className="px-3 py-2">{t('Role')}</th>
                  <th className="px-3 py-2">{t('Status')}</th>
                  <th className="px-3 py-2">{t('Created')}</th>
                  <th className="px-3 py-2">{t('Last active')}</th>
                  <th className="px-3 py-2 text-end">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="px-3 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {admin.fullName ?? admin.email.split('@')[0]}
                        {admin.id === me.id && (
                          <span className="ms-1.5 rounded bg-[var(--accent-surface)] px-1 py-0.5 text-[9px] text-[var(--color-primary-text)]">
                            {t('you')}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">{admin.email}</div>
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === admin.id ? null : admin.id)}
                        className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-[var(--color-primary-text)] hover:underline"
                      >
                        <Shield className="h-2.5 w-2.5" /> {admin.permissions.length} {t('permissions')}
                        <ChevronDown className={`h-2.5 w-2.5 transition-transform ${expanded === admin.id ? 'rotate-180' : ''}`} />
                      </button>
                      {expanded === admin.id && (
                        <div className="mt-1 flex max-w-xs flex-wrap gap-1">
                          {admin.permissions.map((permission) => (
                            <span
                              key={permission}
                              className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--text-muted)]"
                            >
                              {permission}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={admin.role}
                        disabled={busy === admin.id}
                        onChange={(event) => void change(admin, { role: event.target.value as AdminRole })}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
                        title={ADMIN_ROLE_DESCRIPTIONS[admin.role]}
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {ADMIN_ROLE_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={admin.status} />
                    </td>
                    <td className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
                      {formatDate(admin.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-[11px] text-[var(--text-muted)]">
                      {formatDate(admin.lastActiveAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={busy === admin.id || admin.id === me.id}
                          onClick={() =>
                            void change(admin, {
                              status: admin.status === 'active' ? 'disabled' : 'active',
                            })
                          }
                          className="rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
                        >
                          {admin.status === 'active' ? t('Disable') : t('Enable')}
                        </button>
                        <button
                          type="button"
                          disabled={busy === admin.id || admin.id === me.id}
                          onClick={() => void remove(admin)}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--color-danger)] disabled:opacity-40"
                          aria-label={t('Remove administrator')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Opportunity review                                                         */
/* -------------------------------------------------------------------------- */

function OpportunitiesPanel({ canWrite, canModerate }: { canWrite: boolean; canModerate: boolean }) {
  const { t } = useCareer();
  const [opportunities, setOpportunities] = useState<VolunteerOpportunity[]>([]);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | OpportunityKind>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOpportunities(await fetchAdminOpportunities());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Opportunities could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (item: VolunteerOpportunity, patch: Parameters<typeof patchAdminOpportunity>[1]) => {
    setBusy(item.id);
    setError(null);
    try {
      const next = await patchAdminOpportunity(item.id, patch);
      setOpportunities((current) => current.map((entry) => (entry.id === next.id ? next : entry)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'The update failed.');
    } finally {
      setBusy(null);
    }
  };

  const report = async (item: VolunteerOpportunity) => {
    const reason = window.prompt(
      t('What is wrong with this opportunity? A Super Admin will review it.')
    );
    if (!reason || !reason.trim()) return;
    setBusy(item.id);
    setError(null);
    setNotice(null);
    try {
      await reportAdminIssue({
        entityType: 'opportunity',
        entityId: item.id,
        reason: reason.trim(),
      });
      setNotice(t('Report recorded. A Super Admin can review it in the audit log.'));
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return opportunities.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!term) return true;
      return (
        item.title.toLowerCase().includes(term) ||
        item.organization.toLowerCase().includes(term) ||
        item.tags.some((tag) => tag.includes(term))
      );
    });
  }, [opportunities, kindFilter, query]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3 text-xs text-[var(--color-success-strong)]">
          {notice}
        </div>
      )}

      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search organisation, title or tag')}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-xs text-[var(--text-primary)]"
          />
        </div>
        <select
          value={kindFilter}
          onChange={(event) => setKindFilter(event.target.value as 'all' | OpportunityKind)}
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text-primary)]"
        >
          <option value="all">{t('All categories')}</option>
          {(Object.keys(OPPORTUNITY_LABELS) as OpportunityKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {OPPORTUNITY_LABELS[kind]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        <span className="text-[11px] text-[var(--text-muted)]">
          {visible.length} / {opportunities.length}
        </span>
      </div>

      {loading ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading the catalogue…')}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="max-h-[68vh] overflow-auto">
            <table className={RESPONSIVE_TABLE}>
              <thead className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">{t('Opportunity')}</th>
                  <th className="px-3 py-2">{t('Category')}</th>
                  <th className="px-3 py-2">{t('Mode')}</th>
                  <th className="px-3 py-2">{t('Deadline')}</th>
                  <th className="px-3 py-2">{t('Verification')}</th>
                  <th className="px-3 py-2 text-end">{t('Visibility')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--border-subtle)] last:border-b-0 align-top">
                    <td className="max-w-[320px] px-3 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{item.title}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">{item.organization}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.tags.slice(0, 5).map((tag) => (
                          <span key={tag} className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <a
                        href={item.applicationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-[var(--color-primary-text)] hover:underline"
                      >
                        <Eye className="h-2.5 w-2.5" /> {t('Open source page')}
                      </a>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-[var(--text-secondary)]">
                      {OPPORTUNITY_LABELS[item.kind] ?? item.category}
                    </td>
                    <td className="px-3 py-3 text-[11px] capitalize text-[var(--text-secondary)]">
                      {item.participationMode}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-[var(--text-muted)]">
                      {item.deadline ?? t('Rolling')}
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={item.verificationStatus}
                        disabled={!canWrite || busy === item.id}
                        onChange={(event) =>
                          void update(item, {
                            verificationStatus: event.target.value as
                              | 'http'
                              | 'pending'
                              | 'verified'
                              | 'rejected',
                          })
                        }
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-primary)] disabled:opacity-50"
                      >
                        <option value="http">http</option>
                        <option value="pending">pending</option>
                        <option value="verified">verified</option>
                        <option value="rejected">rejected</option>
                      </select>
                      <div className="mt-1">
                        <StatusBadge status={item.verificationStatus} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          type="button"
                          disabled={!canWrite || busy === item.id}
                          onClick={() => void update(item, { isActive: !item.live })}
                          className="rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {item.live ? t('Hide') : t('Activate')}
                        </button>
                        <button
                          type="button"
                          disabled={!canWrite || busy === item.id}
                          onClick={() => void update(item, { isFeatured: !item.isFeatured })}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium disabled:opacity-50 ${
                            item.isFeatured
                              ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <Star className={`h-3 w-3 ${item.isFeatured ? 'fill-current' : ''}`} />
                          {t('Featured')}
                        </button>
                        {canModerate && !canWrite && (
                          <ReportButton
                            label={t('Report')}
                            disabled={busy === item.id}
                            onReport={() => void report(item)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Learning curation                                                          */
/* -------------------------------------------------------------------------- */

function LearningPanel({ canWrite, canModerate }: { canWrite: boolean; canModerate: boolean }) {
  const { t } = useCareer();
  const [courses, setCourses] = useState<LearningCourse[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCourses(await fetchAdminLearning());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Learning could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = async (course: LearningCourse, patch: Parameters<typeof patchAdminCourse>[1]) => {
    setBusy(course.id);
    setError(null);
    try {
      const next = await patchAdminCourse(course.id, patch);
      setCourses((current) => current.map((entry) => (entry.id === next.id ? next : entry)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'The update failed.');
    } finally {
      setBusy(null);
    }
  };

  const report = async (course: LearningCourse) => {
    const reason = window.prompt(
      t('What is wrong with this learning resource? A Super Admin will review it.')
    );
    if (!reason || !reason.trim()) return;
    setBusy(course.id);
    setError(null);
    setNotice(null);
    try {
      await reportAdminIssue({
        entityType: 'course',
        entityId: course.id,
        reason: reason.trim(),
      });
      setNotice(t('Report recorded. A Super Admin can review it in the audit log.'));
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = term
      ? courses.filter(
          (course) =>
            course.title.toLowerCase().includes(term) ||
            course.provider.toLowerCase().includes(term) ||
            course.category.toLowerCase().includes(term)
        )
      : courses;
    return [...filtered].sort(
      (a, b) => Number(b.isFeatured) - Number(a.isFeatured) || b.popularity! - a.popularity!
    ).slice(0, 100);
  }, [courses, query]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3 text-xs text-[var(--color-success-strong)]">
          {notice}
        </div>
      )}
      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search title, provider or category')}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] py-2 ps-8 pe-3 text-xs text-[var(--text-primary)]"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('Refresh')}
        </button>
        <span className="text-[11px] text-[var(--text-muted)]">
          {courses.length} {t('resources')} · {t('showing')} {visible.length}
        </span>
      </div>

      {loading ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading learning resources…')}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="max-h-[68vh] overflow-auto">
            <table className={RESPONSIVE_TABLE}>
              <thead className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2">{t('Resource')}</th>
                  <th className="px-3 py-2">{t('Type')}</th>
                  <th className="px-3 py-2">{t('Certificate')}</th>
                  <th className="px-3 py-2 text-end">{t('Featured')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((course) => (
                  <tr key={course.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="max-w-[340px] px-3 py-2.5">
                      <div className="truncate font-medium text-[var(--text-primary)]">{course.title}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {course.provider} · {course.level}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={course.resourceType ?? 'course'}
                        disabled={!canWrite || busy === course.id}
                        onChange={(event) =>
                          void update(course, {
                            resourceType: event.target.value as LearningResourceType,
                          })
                        }
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-primary)] disabled:opacity-50"
                      >
                        {(Object.keys(RESOURCE_TYPE_LABELS) as LearningResourceType[]).map((type) => (
                          <option key={type} value={type}>
                            {RESOURCE_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <label className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                        <input
                          type="checkbox"
                          checked={Boolean(course.hasCertificate)}
                          disabled={!canWrite || busy === course.id}
                          onChange={(event) =>
                            void update(course, {
                              hasCertificate: event.target.checked,
                              certificateIncluded: event.target.checked
                                ? course.certificateIncluded
                                : false,
                            })
                          }
                          className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
                        />
                        {t('Exists')}
                      </label>
                      {course.hasCertificate && (
                        <label className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                          <input
                            type="checkbox"
                            checked={Boolean(course.certificateIncluded)}
                            disabled={!canWrite || busy === course.id}
                            onChange={(event) =>
                              void update(course, { certificateIncluded: event.target.checked })
                            }
                            className="h-3.5 w-3.5 accent-[var(--accent-primary)]"
                          />
                          {t('Included free')}
                        </label>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <button
                        type="button"
                        disabled={!canWrite || busy === course.id}
                        onClick={() => void update(course, { isFeatured: !course.isFeatured })}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium disabled:opacity-50 ${
                          course.isFeatured
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'border-[var(--border-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        <Star className={`h-3 w-3 ${course.isFeatured ? 'fill-current' : ''}`} />
                        {course.isFeatured ? t('Featured') : t('Feature')}
                      </button>
                      {canModerate && !canWrite && (
                        <div className="mt-1">
                          <ReportButton
                            label={t('Report')}
                            disabled={busy === course.id}
                            onReport={() => void report(course)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

function AuditPanel() {
  const { t } = useCareer();
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminAudit(150)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'The audit log could not be loaded.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
        <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading the audit log…')}
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

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="max-h-[68vh] overflow-auto">
        <table className={RESPONSIVE_TABLE}>
          <thead className="sticky top-0 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">{t('When')}</th>
              <th className="px-3 py-2">{t('Administrator')}</th>
              <th className="px-3 py-2">{t('Action')}</th>
              <th className="px-3 py-2">{t('Entity')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[10px] text-[var(--text-muted)]">
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-[11px] text-[var(--text-secondary)]">
                  {entry.adminEmail ?? '—'}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-[var(--text-primary)]">
                  {entry.action}
                </td>
                <td className="px-3 py-2 text-[10px] text-[var(--text-muted)]">
                  {entry.entityType ?? '—'}
                  {entry.entityId ? ` · ${entry.entityId.slice(0, 8)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length === 0 && (
        <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
          {t('No administrative actions have been recorded yet.')}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export const AdminCenterView: React.FC = () => {
  const { t } = useCareer();
  const { admin, loading } = useAdminAccess();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const permissions = useMemo(() => new Set(admin?.permissions ?? []), [admin]);
  const canReadAnalytics = permissions.has('analytics.read');
  const canModerate = permissions.has('moderation.write');

  const tabs = useMemo(() => {
    const entries: Array<{ id: AdminTab; label: string; icon: React.ElementType }> = [
      { id: 'overview', label: t('Overview'), icon: BarChart3 },
    ];
    if (permissions.has('analytics.read')) {
      entries.push({ id: 'traffic', label: t('Traffic'), icon: TrendingUp });
    }
    if (permissions.has('announcements.read')) {
      entries.push({ id: 'announcements', label: t('Communications'), icon: Megaphone });
    }
    if (permissions.has('admin.manage')) {
      entries.push({ id: 'admins', label: t('Administrators'), icon: Users });
    }
    if (permissions.has('opportunities.read')) {
      entries.push({ id: 'opportunities', label: t('Opportunities'), icon: GraduationCap });
    }
    if (permissions.has('learning.read')) {
      entries.push({ id: 'learning', label: t('Learning'), icon: BookOpen });
    }
    if (permissions.has('audit.read')) {
      entries.push({ id: 'audit', label: t('Audit log'), icon: Shield });
    }
    if (permissions.has('subscriptions.read')) {
      entries.push({ id: 'subscriptions', label: t('Subscriptions'), icon: CreditCard });
    }
    if (permissions.has('payments.read')) {
      entries.push({ id: 'payments', label: t('Payments'), icon: Smartphone });
    }
    if (permissions.has('revenue.read')) {
      entries.push({ id: 'revenue', label: t('Revenue & Finance'), icon: DollarSign });
    }
    return entries;
  }, [permissions, t]);

  useEffect(() => {
    if (!tabs.some((entry) => entry.id === tab)) {
      setTab('overview');
    }
  }, [tabs, tab]);

  const loadAnalytics = useCallback(async () => {
    if (!permissions.has('analytics.read')) return;
    try {
      setAnalytics(await fetchAdminAnalytics());
      setAnalyticsError(null);
    } catch (error) {
      setAnalyticsError(error instanceof Error ? error.message : 'Analytics could not be loaded.');
    }
  }, [permissions]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  if (loading && !admin) {
    return (
      <div className={`${CARD} flex items-center justify-center gap-2 p-10 text-sm text-[var(--text-secondary)]`}>
        <Loader2 className="h-4 w-4 animate-spin" /> {t('Checking administrator access…')}
      </div>
    );
  }

  if (!admin || admin.status === 'disabled') {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <Shield className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]" />
        <h1 className="text-base font-bold text-[var(--text-primary)]">
          {t('Administrator access required')}
        </h1>
        <p className="mx-auto mt-1 max-w-md text-xs text-[var(--text-secondary)]">
          {t('This area is available to authorised administrators only. Ask a Super Admin if you believe you should have access.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-strong)]">
            <Shield className="h-3.5 w-3.5" /> {t('Administration')}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            {t('Admin Communication Center')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            {admin.fullName ?? admin.email} · {ADMIN_ROLE_LABELS[admin.role]} ·{' '}
            {admin.permissions.length} {t('permissions')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === entry.id
                    ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                    : 'border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          {analyticsError && (
            <div className="rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
              {analyticsError}
            </div>
          )}
          {analytics ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label={t('Users')} value={analytics.users} icon={Users} />
                <StatCard label={t('Administrators')} value={analytics.admins} icon={Shield} />
                <StatCard label={t('Published announcements')} value={analytics.publishedAnnouncements} icon={Megaphone} />
                <StatCard label={t('Notifications delivered')} value={analytics.notifications} icon={Send} />
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label={t('Learning resources')} value={analytics.courses} icon={BookOpen} />
                <StatCard label={t('Completed learning')} value={analytics.completedLearning} icon={CheckCircle2} />
                <StatCard label={t('Live opportunities')} value={analytics.activeOpportunities} icon={GraduationCap} />
                <StatCard label={t('Draft & archived announcements')} value={analytics.announcements - analytics.publishedAnnouncements} icon={Archive} />
              </div>
              <div className={`${CARD} p-4`}>
                <h2 className="text-sm font-bold text-[var(--text-primary)]">{t('Role map')}</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((option) => (
                    <div key={option} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-3">
                      <div className="text-xs font-semibold text-[var(--text-primary)]">
                        {ADMIN_ROLE_LABELS[option]}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                        {ADMIN_ROLE_DESCRIPTIONS[option]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : canReadAnalytics ? (
            <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
              <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading analytics…')}
            </div>
          ) : (
            <div className={`${CARD} p-8 text-center text-xs text-[var(--text-secondary)]`}>
              {t('Your role can manage content but cannot read platform analytics.')}
            </div>
          )}
        </div>
      )}

      {tab === 'traffic' && <TrafficAnalyticsPanel />}
      {tab === 'announcements' && (
        <AnnouncementsPanel
          canWrite={permissions.has('announcements.write')}
          canPublish={permissions.has('announcements.publish')}
          canModerate={canModerate}
          onChanged={() => void loadAnalytics()}
        />
      )}
      {tab === 'admins' && <AdminsPanel me={admin} onChanged={() => void loadAnalytics()} />}
      {tab === 'opportunities' && (
        <OpportunitiesPanel
          canWrite={permissions.has('opportunities.write')}
          canModerate={canModerate}
        />
      )}
      {tab === 'learning' && (
        <LearningPanel canWrite={permissions.has('learning.write')} canModerate={canModerate} />
      )}
      {tab === 'audit' && <AuditPanel />}
      {tab === 'subscriptions' && <AdminSubscriptionsPanel />}
      {tab === 'payments' && <AdminPaymentsPanel />}
      {tab === 'revenue' && <AdminRevenuePanel />}

      {tabs.length === 1 && (
        <div className={`${CARD} p-6 text-center text-xs text-[var(--text-secondary)]`}>
          <AlertCircle className="mx-auto mb-2 h-5 w-5 text-[var(--text-muted)]" />
          {t('Your role has no management permissions yet. A Super Admin can grant them.')}
        </div>
      )}
    </div>
  );
};
