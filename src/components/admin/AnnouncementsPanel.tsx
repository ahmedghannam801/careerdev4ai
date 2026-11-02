/**
 * Admin Communication Center: composition, targeting, scheduling and delivery
 * analytics.
 *
 * Every number on this screen comes from the server. The audience preview uses
 * the same targeting engine that publishing uses, and the read/click figures
 * are computed from announcement_deliveries, not from the announcement row.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  Flag,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  MousePointerClick,
  Plus,
  RefreshCw,
  Search,
  Send,
  Target,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  fetchAdminAnnouncements,
  patchAnnouncement,
  previewAnnouncement,
  publishAnnouncement,
  reportAdminIssue,
  scheduleAnnouncement,
  searchAdminUsers,
  type AdminAnnouncement,
  type AdminUserSummary,
} from '../../lib/adminApi';
import {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_CATEGORY_LABELS,
  ANNOUNCEMENT_PRIORITY_LABELS,
  AUDIENCE_FIELDS,
  AUDIENCE_FIELD_LABELS,
  AUDIENCE_LIMITS,
  type AnnouncementCategory,
  type AnnouncementPriority,
  type AudienceCondition,
  type AudienceField,
  type AudienceRuleGroup,
} from '../../../shared/admin';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';
const INPUT =
  'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]';

type AudienceMode = 'all' | 'users' | 'rules';

interface AnnouncementDraft {
  title: string;
  body: string;
  category: AnnouncementCategory;
  priority: AnnouncementPriority;
  imageUrl: string;
  thumbnailUrl: string;
  ctaText: string;
  ctaUrl: string;
  linkView: string;
  publishAt: string;
  expiresAt: string;
  audienceMode: AudienceMode;
  selectedUsers: AdminUserSummary[];
  groups: AudienceRuleGroup[];
}

const EMPTY_DRAFT: AnnouncementDraft = {
  title: '',
  body: '',
  category: 'general',
  priority: 'normal',
  imageUrl: '',
  thumbnailUrl: '',
  ctaText: '',
  ctaUrl: '',
  linkView: '',
  publishAt: '',
  expiresAt: '',
  audienceMode: 'all',
  selectedUsers: [],
  groups: [],
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

function toLocalInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function conditionValues(condition: AudienceCondition): string {
  return condition.values.join(', ');
}

function activeGroups(groups: AudienceRuleGroup[]): AudienceRuleGroup[] {
  return groups
    .map((group) => ({
      logic: group.logic,
      conditions: group.conditions
        .map((condition) => ({
          field: condition.field,
          values: condition.values
            .map((value) => value.trim())
            .filter(Boolean),
        }))
        .filter((condition) => condition.values.length > 0),
    }))
    .filter((group) => group.conditions.length > 0);
}

function legacyGroups(announcement: AdminAnnouncement): AudienceRuleGroup[] {
  if (announcement.audienceRules.length > 0) return announcement.audienceRules;
  const map: Partial<Record<AdminAnnouncement['audienceType'], AudienceField>> = {
    target_role: 'career',
    target_industry: 'industry',
    user_type: 'user_type',
    country: 'country',
  };
  const field = map[announcement.audienceType];
  if (!field || announcement.audienceValues.length === 0) return [];
  return [
    {
      logic: 'and',
      conditions: [{ field, values: announcement.audienceValues }],
    },
  ];
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'published'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : status === 'scheduled'
        ? 'border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
        : status === 'expired' || status === 'archived'
          ? 'border-slate-500/30 bg-slate-500/10 text-[var(--text-muted)]'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${tone}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: AnnouncementPriority }) {
  const tone =
    priority === 'critical'
      ? 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
      : priority === 'important'
        ? 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]'
        : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)] text-[var(--text-muted)]';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {ANNOUNCEMENT_PRIORITY_LABELS[priority]}
    </span>
  );
}

export function AnnouncementsPanel({
  canWrite,
  canPublish,
  canModerate,
  onChanged,
}: {
  canWrite: boolean;
  canPublish: boolean;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const { t } = useCareer();
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AdminUserSummary[]>([]);
  const [preview, setPreview] = useState<{ count: number; summary: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filters, setFilters] = useState({ status: '', category: '', priority: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAnnouncements(await fetchAdminAnnouncements());
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Announcements could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rulesKey = useMemo(() => JSON.stringify(draft.groups), [draft.groups]);
  useEffect(() => {
    setPreview(null);
  }, [rulesKey, draft.audienceMode, draft.selectedUsers]);

  const patchDraft = (patch: Partial<AnnouncementDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const setGroup = (groupIndex: number, next: AudienceRuleGroup) =>
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group, index) => (index === groupIndex ? next : group)),
    }));

  const addGroup = () =>
    setDraft((current) => {
      if (current.groups.length >= AUDIENCE_LIMITS.groups) return current;
      return {
        ...current,
        groups: [
          ...current.groups,
          {
            logic: 'and',
            conditions: [{ field: 'career', values: [] }],
          },
        ],
      };
    });

  const removeGroup = (groupIndex: number) =>
    setDraft((current) => ({
      ...current,
      groups: current.groups.filter((_group, index) => index !== groupIndex),
    }));

  const setCondition = (
    groupIndex: number,
    conditionIndex: number,
    next: AudienceCondition
  ) => {
    const group = draft.groups[groupIndex];
    if (!group) return;
    setGroup(groupIndex, {
      ...group,
      conditions: group.conditions.map((condition, index) =>
        index === conditionIndex ? next : condition
      ),
    });
  };

  const addCondition = (groupIndex: number) => {
    const group = draft.groups[groupIndex];
    if (!group || group.conditions.length >= AUDIENCE_LIMITS.conditionsPerGroup) return;
    setGroup(groupIndex, {
      ...group,
      conditions: [...group.conditions, { field: 'skill', values: [] }],
    });
  };

  const removeCondition = (groupIndex: number, conditionIndex: number) => {
    const group = draft.groups[groupIndex];
    if (!group) return;
    setGroup(groupIndex, {
      ...group,
      conditions: group.conditions.filter((_condition, index) => index !== conditionIndex),
    });
  };

  const searchUsers = async () => {
    try {
      setUserResults(await searchAdminUsers(userQuery));
    } catch {
      setUserResults([]);
    }
  };

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setUserQuery('');
    setUserResults([]);
    setPreview(null);
  };

  const buildPayload = () => {
    const groups = draft.audienceMode === 'rules' ? activeGroups(draft.groups) : [];
    return {
      title: draft.title.trim(),
      body: draft.body.trim(),
      category: draft.category,
      priority: draft.priority,
      audienceType:
        draft.audienceMode === 'users' ? ('users' as const) : ('all' as const),
      audienceValues:
        draft.audienceMode === 'users' ? draft.selectedUsers.map((user) => user.id) : [],
      audienceRules: groups,
      linkView: draft.linkView.trim() || null,
      imageUrl: draft.imageUrl.trim() || null,
      thumbnailUrl: draft.thumbnailUrl.trim() || null,
      ctaText: draft.ctaText.trim() || null,
      ctaUrl: draft.ctaUrl.trim() || null,
      publishAt: draft.publishAt ? new Date(draft.publishAt).toISOString() : null,
      expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
    };
  };

  const validate = (): string | null => {
    if (!draft.title.trim()) return t('A title is required.');
    if (!draft.body.trim()) return t('A message is required.');
    if (draft.audienceMode === 'users' && draft.selectedUsers.length === 0) {
      return t('Choose at least one recipient.');
    }
    if (draft.audienceMode === 'rules' && activeGroups(draft.groups).length === 0) {
      return t('Add at least one targeting condition.');
    }
    if (draft.publishAt && !Number.isFinite(new Date(draft.publishAt).getTime())) {
      return t('The publish date is not valid.');
    }
    if (draft.expiresAt && !Number.isFinite(new Date(draft.expiresAt).getTime())) {
      return t('The expiration date is not valid.');
    }
    if (draft.publishAt && draft.expiresAt && new Date(draft.expiresAt) <= new Date(draft.publishAt)) {
      return t('The expiration date must be after the publish date.');
    }
    return null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setBusy('save');
      const payload = buildPayload();
      if (editingId) {
        await patchAnnouncement(editingId, payload);
        setNotice(t('Draft updated.'));
      } else {
        await createAnnouncement(payload);
        setNotice(t('Draft saved. Publish it when it is ready.'));
      }
      resetDraft();
      await load();
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'The announcement could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const runPreview = async () => {
    if (previewing) return;
    setError(null);
    try {
      setPreviewing(true);
      const payload = buildPayload();
      setPreview(
        await previewAnnouncement({
          audienceType: payload.audienceType,
          audienceValues: payload.audienceValues,
          audienceRules: payload.audienceRules,
        })
      );
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'The audience could not be counted.');
    } finally {
      setPreviewing(false);
    }
  };

  const publishEdited = async () => {
    if (!editingId || busy) return;
    setError(null);
    setNotice(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setBusy(editingId);
      await patchAnnouncement(editingId, buildPayload());
      const delivered = await publishAnnouncement(editingId);
      setNotice(`${t('Published to')} ${delivered.recipientCount} ${t('people')}.`);
      resetDraft();
      await load();
      onChanged();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'The announcement could not be published.');
    } finally {
      setBusy(null);
    }
  };

  const scheduleEdited = async () => {
    if (!editingId || busy) return;
    if (!draft.publishAt) {
      setError(t('Choose a date and time before scheduling.'));
      return;
    }
    setError(null);
    setNotice(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    try {
      setBusy(editingId);
      await patchAnnouncement(editingId, buildPayload());
      const scheduled = await scheduleAnnouncement(
        editingId,
        new Date(draft.publishAt).toISOString()
      );
      setNotice(`${t('Scheduled for')} ${formatDate(scheduled.publishAt)}.`);
      resetDraft();
      await load();
      onChanged();
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : 'The announcement could not be scheduled.');
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: 'publish' | 'archive' | 'delete') => {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'publish') {
        const delivered = await publishAnnouncement(id);
        setNotice(`${t('Published to')} ${delivered.recipientCount} ${t('people')}.`);
      } else if (action === 'archive') {
        await archiveAnnouncement(id);
        setNotice(t('Announcement archived.'));
      } else {
        if (!window.confirm(t('Delete this announcement? Delivered notifications stay in user inboxes.'))) {
          setBusy(null);
          return;
        }
        await deleteAnnouncement(id);
        setNotice(t('Announcement deleted.'));
      }
      await load();
      onChanged();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The action failed.');
    } finally {
      setBusy(null);
    }
  };

  const edit = (announcement: AdminAnnouncement) => {
    const mode: AudienceMode = announcement.audienceRules.length > 0
      ? 'rules'
      : announcement.audienceType === 'users'
        ? 'users'
        : announcement.audienceType === 'all'
          ? 'all'
          : 'rules';
    setEditingId(announcement.id);
    setDraft({
      title: announcement.title,
      body: announcement.body,
      category: announcement.category,
      priority: announcement.priority,
      imageUrl: announcement.imageUrl ?? '',
      thumbnailUrl: announcement.thumbnailUrl ?? '',
      ctaText: announcement.ctaText ?? '',
      ctaUrl: announcement.ctaUrl ?? '',
      linkView: announcement.linkView ?? '',
      publishAt: toLocalInput(announcement.publishAt),
      expiresAt: toLocalInput(announcement.expiresAt),
      audienceMode: mode,
      selectedUsers:
        announcement.audienceType === 'users'
          ? announcement.audienceValues.map((id) => ({
              id,
              fullName: null,
              username: null,
              targetRole: null,
              targetIndustry: null,
              userType: null,
              country: null,
            }))
          : [],
      groups: mode === 'rules' ? legacyGroups(announcement) : [],
    });
    setPreview(null);
  };

  const report = async (announcement: AdminAnnouncement) => {
    const reason = window.prompt(
      t('Why are you reporting this announcement? A Super Admin will review it.')
    );
    if (!reason || !reason.trim()) return;
    setBusy(announcement.id);
    setError(null);
    setNotice(null);
    try {
      await reportAdminIssue({
        entityType: 'announcement',
        entityId: announcement.id,
        reason: reason.trim(),
      });
      setNotice(t('Report recorded. A Super Admin can review it in the audit log.'));
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'The report could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const visible = announcements.filter(
    (announcement) =>
      (!filters.status || announcement.status === filters.status) &&
      (!filters.category || announcement.category === filters.category) &&
      (!filters.priority || announcement.priority === filters.priority)
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/20 bg-[var(--color-danger)]/10 p-3 text-xs text-[var(--color-danger)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success-strong)]/20 bg-[var(--color-success-surface)] p-3 text-xs text-[var(--color-success-strong)]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {canWrite && (
        <form onSubmit={submit} className={`${CARD} space-y-4 p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              {editingId ? t('Edit announcement') : t('Compose an announcement')}
            </h2>
            {editingId && (
              <button type="button" onClick={resetDraft} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                {t('Cancel edit')}
              </button>
            )}
          </div>

          <input
            value={draft.title}
            onChange={(event) => patchDraft({ title: event.target.value })}
            placeholder={t('Announcement title')}
            maxLength={200}
            className={INPUT}
            aria-label={t('Announcement title')}
          />
          <textarea
            value={draft.body}
            onChange={(event) => patchDraft({ body: event.target.value })}
            placeholder={t('What do you want every recipient to know?')}
            rows={4}
            maxLength={5000}
            className={`${INPUT} resize-y`}
            aria-label={t('Announcement message')}
          />

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Category')}
              <select
                value={draft.category}
                onChange={(event) => patchDraft({ category: event.target.value as AnnouncementCategory })}
                className={INPUT}
              >
                {ANNOUNCEMENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(ANNOUNCEMENT_CATEGORY_LABELS[category])}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Priority')}
              <select
                value={draft.priority}
                onChange={(event) => patchDraft({ priority: event.target.value as AnnouncementPriority })}
                className={INPUT}
              >
                {(['normal', 'important', 'critical'] as const).map((priority) => (
                  <option key={priority} value={priority}>
                    {t(ANNOUNCEMENT_PRIORITY_LABELS[priority])}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Link view (optional)')}
              <input
                value={draft.linkView}
                onChange={(event) => patchDraft({ linkView: event.target.value })}
                placeholder="volunteer"
                maxLength={120}
                className={INPUT}
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Image URL (optional)')}
              <input
                value={draft.imageUrl}
                onChange={(event) => patchDraft({ imageUrl: event.target.value })}
                placeholder="https://…"
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Thumbnail URL (optional)')}
              <input
                value={draft.thumbnailUrl}
                onChange={(event) => patchDraft({ thumbnailUrl: event.target.value })}
                placeholder="https://…"
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('CTA text (optional)')}
              <input
                value={draft.ctaText}
                onChange={(event) => patchDraft({ ctaText: event.target.value })}
                placeholder={t('View opportunity')}
                maxLength={80}
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('CTA URL (optional)')}
              <input
                value={draft.ctaUrl}
                onChange={(event) => patchDraft({ ctaUrl: event.target.value })}
                placeholder="https://…"
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Publish date (optional)')}
              <input
                type="datetime-local"
                value={draft.publishAt}
                onChange={(event) => patchDraft({ publishAt: event.target.value })}
                className={INPUT}
              />
            </label>
            <label className="space-y-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              {t('Expiration date (optional)')}
              <input
                type="datetime-local"
                value={draft.expiresAt}
                onChange={(event) => patchDraft({ expiresAt: event.target.value })}
                className={INPUT}
              />
            </label>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                <Target className="h-3.5 w-3.5" /> {t('Audience')}
              </span>
              <div className="flex flex-wrap gap-1">
                {(['all', 'users', 'rules'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => patchDraft({ audienceMode: mode })}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                      draft.audienceMode === mode
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {mode === 'all'
                      ? t('Everyone')
                      : mode === 'users'
                        ? t('Specific users')
                        : t('Filtered audience')}
                  </button>
                ))}
              </div>
            </div>

            {draft.audienceMode === 'users' && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={userQuery}
                    onChange={(event) => setUserQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void searchUsers();
                      }
                    }}
                    placeholder={t('Search by name, username or target role')}
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={() => void searchUsers()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Search className="h-3.5 w-3.5" /> {t('Search')}
                  </button>
                </div>
                {draft.selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.selectedUsers.map((user) => (
                      <span
                        key={user.id}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-surface)] px-2 py-0.5 text-[10px] text-[var(--color-primary-text)]"
                      >
                        {user.fullName ?? user.username ?? user.id.slice(0, 8)}
                        <button
                          type="button"
                          onClick={() =>
                            patchDraft({
                              selectedUsers: draft.selectedUsers.filter((entry) => entry.id !== user.id),
                            })
                          }
                          aria-label={t('Remove')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {userResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)]">
                    {userResults.map((user) => {
                      const selected = draft.selectedUsers.some((entry) => entry.id === user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() =>
                            patchDraft({
                              selectedUsers: selected
                                ? draft.selectedUsers.filter((entry) => entry.id !== user.id)
                                : [...draft.selectedUsers, user],
                            })
                          }
                          className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-[11px] ${
                            selected
                              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]'
                          }`}
                        >
                          <span className="truncate">
                            {user.fullName ?? user.username ?? user.id.slice(0, 8)}
                            {user.targetRole ? ` · ${user.targetRole}` : ''}
                          </span>
                          {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {draft.audienceMode === 'rules' && (
              <div className="space-y-2">
                <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                  {t('Groups are combined with AND. Inside a group, conditions use the selected AND or OR logic.')}
                </p>
                {draft.groups.map((group, groupIndex) => (
                  <div key={groupIndex} className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        {t('Group')} {groupIndex + 1}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={group.logic}
                          onChange={(event) =>
                            setGroup(groupIndex, {
                              ...group,
                              logic: event.target.value === 'or' ? 'or' : 'and',
                            })
                          }
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-1 text-[10px] text-[var(--text-secondary)]"
                          aria-label={t('Group logic')}
                        >
                          <option value="and">AND</option>
                          <option value="or">OR</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeGroup(groupIndex)}
                          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                          aria-label={t('Remove group')}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {group.conditions.map((condition, conditionIndex) => (
                      <div key={conditionIndex} className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                        <select
                          value={condition.field}
                          onChange={(event) =>
                            setCondition(groupIndex, conditionIndex, {
                              field: event.target.value as AudienceField,
                              values: [],
                            })
                          }
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] sm:w-44"
                          aria-label={t('Targeting field')}
                        >
                          {AUDIENCE_FIELDS.map((field) => (
                            <option key={field} value={field}>
                              {t(AUDIENCE_FIELD_LABELS[field])}
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-1 gap-1.5">
                          <input
                            value={conditionValues(condition)}
                            onChange={(event) =>
                              setCondition(groupIndex, conditionIndex, {
                                field: condition.field,
                                values: event.target.value.split(','),
                              })
                            }
                            placeholder={t('Comma-separated values')}
                            className={INPUT}
                            aria-label={t('Targeting values')}
                          />
                          <button
                            type="button"
                            onClick={() => removeCondition(groupIndex, conditionIndex)}
                            className="shrink-0 rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--color-danger)]"
                            aria-label={t('Remove condition')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => addCondition(groupIndex)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-primary-text)]"
                    >
                      <Plus className="h-3 w-3" /> {t('Add condition')}
                    </button>
                  </div>
                ))}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={addGroup}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <Plus className="h-3 w-3" /> {t('Add group')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void runPreview()}
                    disabled={previewing}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                    {t('Preview audience')}
                  </button>
                </div>
              </div>
            )}

            {draft.audienceMode !== 'rules' && (
              <button
                type="button"
                onClick={() => void runPreview()}
                disabled={previewing}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
              >
                {previewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                {t('Preview audience')}
              </button>
            )}

            {preview && (
              <div className="rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-surface)] p-2.5 text-[11px] text-[var(--color-primary-text)]">
                <strong className="font-bold">
                  {t('Estimated audience:')} {preview.count.toLocaleString()} {t('users')}
                </strong>
                <p className="mt-1 break-words text-[10px] opacity-80">{preview.summary}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
            {canPublish && editingId && (
              <>
                <button
                  type="button"
                  onClick={() => void scheduleEdited()}
                  disabled={busy !== null || !draft.publishAt}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  <CalendarClock className="h-3.5 w-3.5" /> {t('Schedule')}
                </button>
                <button
                  type="button"
                  onClick={() => void publishEdited()}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" /> {t('Publish now')}
                </button>
              </>
            )}
            <button
              type="submit"
              disabled={busy !== null || !draft.title.trim() || !draft.body.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
              {editingId ? t('Update draft') : t('Save draft')}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Communication history')}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              {
                key: 'status' as const,
                options: ['draft', 'scheduled', 'published', 'expired', 'archived'],
                label: t('Status'),
              },
              {
                key: 'category' as const,
                options: ANNOUNCEMENT_CATEGORIES,
                label: t('Category'),
              },
              {
                key: 'priority' as const,
                options: ['normal', 'important', 'critical'],
                label: t('Priority'),
              },
            ].map((filter) => (
              <select
                key={filter.key}
                value={filters[filter.key]}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, [filter.key]: event.target.value }))
                }
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-secondary)]"
                aria-label={filter.label}
              >
                <option value="">{filter.label}</option>
                {filter.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ))}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> {t('Refresh')}
            </button>
          </div>
        </div>

        {visible.length === 0 && !loading && (
          <div className={`${CARD} p-8 text-center text-xs text-[var(--text-secondary)]`}>
            {t('No announcements yet. The first one you publish will appear in every targeted inbox.')}
          </div>
        )}

        {visible.map((announcement) => {
          const image = announcement.thumbnailUrl ?? announcement.imageUrl;
          const editable = announcement.status === 'draft' || announcement.status === 'scheduled';
          return (
            <article key={announcement.id} className={`${CARD} overflow-hidden`}>
              <div className="flex flex-col sm:flex-row">
                {image && (
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-28 w-full object-cover sm:h-auto sm:w-36"
                  />
                )}
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {announcement.title}
                        </h3>
                        <StatusBadge status={announcement.status} />
                        <PriorityBadge priority={announcement.priority} />
                        <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
                          {t(ANNOUNCEMENT_CATEGORY_LABELS[announcement.category])}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-[var(--text-secondary)]">
                        {announcement.body}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {announcement.audienceSummary ?? announcement.audienceType.replace(/_/g, ' ')}
                        </span>
                        <span>
                          {t('Created')} {formatDate(announcement.createdAt)}
                          {announcement.createdByName ? ` · ${announcement.createdByName}` : ''}
                        </span>
                        {announcement.publishAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {t('Publish date')} {formatDate(announcement.publishAt)}
                          </span>
                        )}
                        {announcement.expiresAt && (
                          <span>
                            {t('Expires')} {formatDate(announcement.expiresAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {canWrite && editable && (
                        <button
                          type="button"
                          onClick={() => edit(announcement)}
                          className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        >
                          {t('Edit')}
                        </button>
                      )}
                      {canPublish && editable && (
                        <button
                          type="button"
                          onClick={() => void act(announcement.id, 'publish')}
                          disabled={busy === announcement.id}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-on-primary)] disabled:opacity-50"
                        >
                          {busy === announcement.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                          {announcement.status === 'scheduled' ? t('Publish now') : t('Publish')}
                        </button>
                      )}
                      {canPublish && announcement.status === 'published' && (
                        <button
                          type="button"
                          onClick={() => void act(announcement.id, 'archive')}
                          disabled={busy === announcement.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          <Archive className="h-3 w-3" /> {t('Archive')}
                        </button>
                      )}
                      {canModerate && !canWrite && (
                        <button
                          type="button"
                          onClick={() => void report(announcement)}
                          disabled={busy === announcement.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--color-danger)] disabled:opacity-50"
                          title={t('Report')}
                        >
                          <Flag className="h-3 w-3" /> {t('Report')}
                        </button>
                      )}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => void act(announcement.id, 'delete')}
                          disabled={busy === announcement.id}
                          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--color-danger)] disabled:opacity-50"
                          aria-label={t('Delete announcement')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {(announcement.status === 'published' || announcement.stats.deliveredCount > 0) && (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-4">
                      {[
                        {
                          label: t('Delivered'),
                          value: announcement.stats.deliveredCount,
                          icon: Send,
                        },
                        {
                          label: t('Read'),
                          value: announcement.stats.readCount,
                          icon: Eye,
                        },
                        {
                          label: t('Clicked'),
                          value: announcement.stats.clickedCount,
                          icon: MousePointerClick,
                        },
                        {
                          label: t('Read rate'),
                          value: `${announcement.stats.readRate}%`,
                          icon: Target,
                        },
                      ].map(({ label, value, icon: Icon }) => (
                        <div key={label} className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                              {label}
                            </div>
                            <div className="text-xs font-semibold text-[var(--text-primary)]">
                              {typeof value === 'number' ? value.toLocaleString() : value}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {announcement.ctaText && (
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                      <ImageIcon className="h-3 w-3" /> {t('CTA')}: {announcement.ctaText}
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
