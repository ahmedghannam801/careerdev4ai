/**
 * CV template administration.
 *
 * The catalogue ships with the code, but its presentation — the name, the
 * category, the tier, whether it is featured or visible, where it sits and the
 * thumbnail — is metadata an administrator can change without a deploy.
 *
 * This panel is a convenience over the API, not the security boundary: every
 * write calls a route that re-checks the verified administrator and the
 * `plans.manage` permission. A built-in template can be disabled but not
 * deleted, because its structure is part of the renderer; an
 * administrator-authored template reuses a built-in structure under its own
 * metadata and can be deleted.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import {
  createAdminCvTemplate,
  deleteAdminCvTemplate,
  fetchAdminCvTemplates,
  updateAdminCvTemplate,
  type AdminCvTemplateCatalogResponse,
  type AdminCvTemplateInput,
} from '../../lib/cvTemplatesApi';
import {
  CV_TEMPLATE_CATEGORIES,
  type CvTemplateCategoryId,
  type CvTemplateDefinition,
  type CvTemplateTier,
} from '../../../shared/cvTemplates';

const CARD = 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]';
const FIELD =
  'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--color-accent-strong)] focus:outline-none';
const LABEL = 'mb-1 block text-[11px] font-semibold text-[var(--text-secondary)]';

interface TemplateFormState {
  templateId: string;
  nameEn: string;
  nameAr: string;
  category: CvTemplateCategoryId;
  tier: CvTemplateTier;
  enabled: boolean;
  featured: boolean;
  sortOrder: string;
  thumbnailUrl: string;
  descriptionEn: string;
  descriptionAr: string;
  baseTemplateId: string;
}

function emptyForm(baseTemplateId: string): TemplateFormState {
  return {
    templateId: '',
    nameEn: '',
    nameAr: '',
    category: 'professional',
    tier: 'premium',
    enabled: true,
    featured: false,
    sortOrder: '',
    thumbnailUrl: '',
    descriptionEn: '',
    descriptionAr: '',
    baseTemplateId,
  };
}

function formFor(template: CvTemplateDefinition): TemplateFormState {
  return {
    templateId: template.id,
    nameEn: template.name,
    nameAr: template.nameAr,
    category: template.category,
    tier: template.tier,
    enabled: !template.disabled,
    featured: template.featured,
    sortOrder: String(template.order),
    thumbnailUrl: template.thumbnailUrl ?? '',
    descriptionEn: template.description,
    descriptionAr: template.descriptionAr,
    baseTemplateId: template.baseTemplateId ?? template.id,
  };
}

function CategoryName({ id, arabic }: { id: string; arabic: boolean }) {
  const category = CV_TEMPLATE_CATEGORIES.find((entry) => entry.id === id);
  if (!category) return <>{id}</>;
  return <>{arabic ? category.labelAr : category.label}</>;
}

export const CvTemplatesPanel: React.FC<{ canWrite: boolean }> = ({ canWrite }) => {
  const { t, settings } = useCareer();
  const arabic = settings.language === 'ar';

  const [data, setData] = useState<AdminCvTemplateCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState<TemplateFormState | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await fetchAdminCvTemplates());
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof Error
          ? loadFailure.message
          : 'The template catalogue could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const templates = data?.templates ?? [];
  const builtins = useMemo(
    () => templates.filter((template) => template.source === 'builtin'),
    [templates]
  );

  const startCreate = () => {
    setFormMode('create');
    setForm(emptyForm(builtins[0]?.id ?? 'ats-classic'));
    setError(null);
    setNotice(null);
  };

  const startEdit = (template: CvTemplateDefinition) => {
    setFormMode('edit');
    setForm(formFor(template));
    setError(null);
    setNotice(null);
  };

  const set = <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) => {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const sortOrder =
      form.sortOrder.trim() === '' ? null : Number(form.sortOrder);

    const payload: AdminCvTemplateInput = {
      nameEn: form.nameEn.trim() || null,
      nameAr: form.nameAr.trim() || null,
      category: form.category,
      tier: form.tier,
      enabled: form.enabled,
      featured: form.featured,
      sortOrder: sortOrder !== null && Number.isFinite(sortOrder) ? sortOrder : null,
      thumbnailUrl: form.thumbnailUrl.trim() || null,
      descriptionEn: form.descriptionEn.trim() || null,
      descriptionAr: form.descriptionAr.trim() || null,
    };

    try {
      if (formMode === 'create') {
        await createAdminCvTemplate({
          ...payload,
          templateId: form.templateId.trim(),
          baseTemplateId: form.baseTemplateId,
        });
      } else {
        await updateAdminCvTemplate(form.templateId, payload);
      }
      setForm(null);
      setNotice(t('Template saved.'));
      await load();
    } catch (saveFailure) {
      setError(
        saveFailure instanceof Error ? saveFailure.message : t('The template could not be saved.')
      );
    } finally {
      setSaving(false);
    }
  };

  const mutate = async (template: CvTemplateDefinition, action: 'toggle' | 'feature' | 'delete') => {
    if (!canWrite || busyId) return;
    setBusyId(template.id);
    setError(null);
    setNotice(null);
    try {
      if (action === 'delete') {
        await deleteAdminCvTemplate(template.id);
        setNotice(
          template.source === 'builtin'
            ? t('Template disabled. Built-in structures are never deleted.')
            : t('Template removed.')
        );
      } else if (action === 'toggle') {
        await updateAdminCvTemplate(template.id, { enabled: Boolean(template.disabled) });
        setNotice(template.disabled ? t('Template enabled.') : t('Template disabled.'));
      } else {
        await updateAdminCvTemplate(template.id, { featured: !template.featured });
        setNotice(template.featured ? t('Template unfeatured.') : t('Template featured.'));
      }
      await load();
    } catch (mutateFailure) {
      setError(
        mutateFailure instanceof Error
          ? mutateFailure.message
          : t('The template could not be updated.')
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t('CV template administration')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {t(
              'Manage the catalogue without a deploy: names, category, tier, visibility, order, thumbnail and feature status.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> {t('Refresh')}
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)]"
            >
              <Plus className="h-3 w-3" aria-hidden="true" /> {t('Add template')}
            </button>
          )}
        </div>
      </div>

      {data && !data.adminTableAvailable && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
          <span>
            {t(
              'The CV template table has not been migrated on this deployment yet. Built-in templates still work; metadata changes will fail until the migration is applied.'
            )}
          </span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {form && (
        <form onSubmit={save} className={`${CARD} space-y-3 p-4`}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {formMode === 'create' ? t('New template') : t('Edit template')}
            </h3>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {t('Cancel')}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={LABEL} htmlFor="cv-template-id">
                {t('Template ID')}
              </label>
              <input
                id="cv-template-id"
                value={form.templateId}
                onChange={(event) => set('templateId', event.target.value)}
                disabled={formMode === 'edit'}
                required={formMode === 'create'}
                placeholder="my-template"
                className={`${FIELD} disabled:opacity-60`}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="cv-template-name-en">
                {t('English name')}
              </label>
              <input
                id="cv-template-name-en"
                value={form.nameEn}
                onChange={(event) => set('nameEn', event.target.value)}
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="cv-template-name-ar">
                {t('Arabic name')}
              </label>
              <input
                id="cv-template-name-ar"
                value={form.nameAr}
                onChange={(event) => set('nameAr', event.target.value)}
                dir="rtl"
                className={FIELD}
              />
            </div>

            <div>
              <label className={LABEL} htmlFor="cv-template-category">
                {t('Category')}
              </label>
              <select
                id="cv-template-category"
                value={form.category}
                onChange={(event) => set('category', event.target.value as CvTemplateCategoryId)}
                className={FIELD}
              >
                {CV_TEMPLATE_CATEGORIES.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {arabic ? entry.labelAr : entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="cv-template-tier">
                {t('Tier')}
              </label>
              <select
                id="cv-template-tier"
                value={form.tier}
                onChange={(event) => set('tier', event.target.value as CvTemplateTier)}
                className={FIELD}
              >
                <option value="free">{t('Free')}</option>
                <option value="premium">{t('Premium')}</option>
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="cv-template-order">
                {t('Sort order')}
              </label>
              <input
                id="cv-template-order"
                type="number"
                min={0}
                max={9999}
                value={form.sortOrder}
                onChange={(event) => set('sortOrder', event.target.value)}
                className={FIELD}
              />
            </div>

            {formMode === 'create' && (
              <div>
                <label className={LABEL} htmlFor="cv-template-base">
                  {t('Base structure')}
                </label>
                <select
                  id="cv-template-base"
                  value={form.baseTemplateId}
                  onChange={(event) => set('baseTemplateId', event.target.value)}
                  required
                  className={FIELD}
                >
                  {builtins.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {arabic ? entry.nameAr : entry.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={LABEL} htmlFor="cv-template-thumbnail">
                {t('Thumbnail URL')}
              </label>
              <input
                id="cv-template-thumbnail"
                value={form.thumbnailUrl}
                onChange={(event) => set('thumbnailUrl', event.target.value)}
                placeholder="https://…"
                className={FIELD}
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className={LABEL} htmlFor="cv-template-description-en">
                {t('English description')}
              </label>
              <textarea
                id="cv-template-description-en"
                value={form.descriptionEn}
                onChange={(event) => set('descriptionEn', event.target.value)}
                rows={2}
                maxLength={400}
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className={LABEL} htmlFor="cv-template-description-ar">
                {t('Arabic description')}
              </label>
              <textarea
                id="cv-template-description-ar"
                value={form.descriptionAr}
                onChange={(event) => set('descriptionAr', event.target.value)}
                rows={2}
                maxLength={400}
                dir="rtl"
                className={FIELD}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => set('enabled', event.target.checked)}
              />
              {t('Enabled')}
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => set('featured', event.target.checked)}
              />
              {t('Featured')}
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || (formMode === 'create' && !form.templateId.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-on-primary)] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {saving ? t('Saving...') : t('Save template')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className={`${CARD} flex items-center justify-center gap-2 p-8 text-xs text-[var(--text-secondary)]`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t('Loading templates...')}
        </div>
      ) : loadError ? (
        <div className={`${CARD} p-6 text-center text-xs text-[var(--text-secondary)]`}>
          <p className="font-semibold text-[var(--text-primary)]">
            {t('The template catalogue could not be loaded.')}
          </p>
          <p className="mt-1">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)]"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" /> {t('Try again')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => {
            const busy = busyId === template.id;
            return (
              <div
                key={template.id}
                className={`${CARD} flex flex-col gap-3 p-3 sm:flex-row sm:items-center`}
              >
                <div
                  className="h-14 w-11 shrink-0 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)]"
                  aria-hidden="true"
                >
                  {template.thumbnailUrl ? (
                    <img
                      src={template.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: template.accent }}
                    >
                      {template.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-xs font-bold text-[var(--text-primary)]">
                      {arabic ? template.nameAr : template.name}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">
                      {template.id}
                    </span>
                    {template.tier === 'premium' ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent-strong)]/30 bg-[var(--accent-surface)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                        <Crown className="h-2 w-2" aria-hidden="true" /> {t('Premium')}
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                        {t('Free')}
                      </span>
                    )}
                    {template.featured && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-[var(--color-primary-text)]">
                        <Star className="h-2 w-2" aria-hidden="true" /> {t('Featured')}
                      </span>
                    )}
                    {template.disabled && (
                      <span className="rounded-full border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-muted)]">
                        {t('Disabled')}
                      </span>
                    )}
                    <span className="rounded-full border border-[var(--border-subtle)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--text-muted)]">
                      {template.source === 'builtin' ? t('Built-in') : t('Administrator')}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">
                    <CategoryName id={template.category} arabic={arabic} /> ·{' '}
                    {arabic ? template.layoutLabelAr : template.layoutLabel} · {t('Order')}{' '}
                    {template.order}
                    {template.baseTemplateId ? ` · ${t('Base structure')}: ${template.baseTemplateId}` : ''}
                  </p>
                </div>

                {canWrite && (
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      <Pencil className="h-2.5 w-2.5" aria-hidden="true" /> {t('Edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void mutate(template, 'feature')}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      <Star className="h-2.5 w-2.5" aria-hidden="true" />
                      {template.featured ? t('Unfeature') : t('Feature')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void mutate(template, 'toggle')}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                      {template.disabled ? (
                        <Eye className="h-2.5 w-2.5" aria-hidden="true" />
                      ) : (
                        <EyeOff className="h-2.5 w-2.5" aria-hidden="true" />
                      )}
                      {template.disabled ? t('Enable') : t('Disable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void mutate(template, 'delete')}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:border-[var(--color-danger)]/40 hover:text-[var(--color-danger)] disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="h-2.5 w-2.5" aria-hidden="true" />
                      )}
                      {template.source === 'builtin' ? t('Disable') : t('Delete')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
