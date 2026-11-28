/**
 * The CV template library.
 *
 * A candidate chooses a STRUCTURE here, not a colour. Every card is a real
 * miniature of the document the studio will print, drawn by the same renderer
 * from a complete sample CV.
 *
 * The server owns two answers this screen must not invent:
 *
 *   - which templates exist (an administrator's metadata can rename, reorder,
 *     feature or disable one);
 *   - whether this candidate may use one.
 *
 * The client draws the badge the server describes. Applying a template is a
 * server call, and a refused apply leaves the candidate's current document
 * untouched.
 *
 * LOOKING AT A TEMPLATE IS FREE, AND SO IS USING IT. The platform is free at
 * the moment: every template is drawn in full, exactly like any other, and
 * every template may be used. There is no lock, no price, no plan and no
 * currency in this library — the server decides which templates exist, and
 * the candidate chooses between them.
 *
 * Switching a template is presentation only: the document is rebuilt from the
 * same CV data, so no fact can be lost by changing the layout.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  LayoutTemplate,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { useCareer } from '../../../context/CareerContext';
import {
  applyCvTemplate,
  fetchCvTemplateCatalog,
  fetchCvTemplatePreview,
  type CvTemplateCatalogResponse,
  type CvTemplateWithAccess,
} from '../../../lib/cvTemplatesApi';
import {
  CV_TEMPLATE_CATEGORIES,
  filterCvTemplates,
  recommendCvTemplates,
  type CvTemplateCategoryFilter,
  type CvTemplateStructure,
} from '../../../../shared/cvTemplates';
import { CvTemplatePreview } from './CvTemplatePreview';

interface CvTemplateLibraryProps {
  /** Opens the editor, so the candidate can see the new layout on their CV. */
  onOpenEditor?: () => void;
}

function categoryLabel(id: CvTemplateWithAccess['category'], arabic: boolean): string {
  const category = CV_TEMPLATE_CATEGORIES.find((entry) => entry.id === id);
  if (!category) return id;
  return arabic ? category.labelAr : category.label;
}

const CARD =
  'group flex flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] transition-colors hover:border-[var(--color-accent-strong)]/40';

const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:cursor-not-allowed disabled:opacity-50';

export const CvTemplateLibrary: React.FC<CvTemplateLibraryProps> = ({
  onOpenEditor,
}) => {
  const { settings, updateSettings, t, profile, targetRole } = useCareer();
  const arabic = settings.language === 'ar';

  const [catalog, setCatalog] = useState<CvTemplateCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CvTemplateCategoryFilter>('all');
  const [preview, setPreview] = useState<CvTemplateWithAccess | null>(null);
  /**
   * The layout of the template being previewed.
   *
   * The catalogue carries the layout of every template, so this is normally the
   * template's own layout. It is kept apart because a catalogue that arrives
   * without one can still be completed from the server.
   */
  const [previewStructure, setPreviewStructure] = useState<CvTemplateStructure | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  /**
   * Opens the preview of a template.
   *
   * The layout comes from the catalogue, and from the server when the
   * catalogue did not carry it. Either way the document is drawn: looking at a
   * template is free.
   */
  const openPreview = useCallback(async (template: CvTemplateWithAccess) => {
    setPreview(template);
    setPreviewError(null);
    setPreviewStructure(template.structure);

    if (template.structure) return;

    try {
      const result = await fetchCvTemplatePreview(template.id);
      setPreviewStructure(result.structure);
    } catch (error) {
      setPreviewStructure(null);
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'This template could not be previewed.'
      );
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setCatalog(await fetchCvTemplateCatalog());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'The template library could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The preview dialog is a dialog: Escape closes it and the page behind it
  // does not scroll while it is open.
  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPreview(null);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [preview]);

  const templates = catalog?.templates ?? [];
  const currentTemplateId = catalog?.currentTemplateId ?? settings.cvTemplateId;

  const filtered = useMemo(() => {
    const visible = new Set(
      filterCvTemplates(templates, { query, category }).map((entry) => entry.id)
    );
    return templates.filter((entry) => visible.has(entry.id));
  }, [templates, query, category]);

  const showHighlights = !query.trim() && category === 'all';

  const recommended = useMemo(() => {
    if (!showHighlights) return [];
    const byId = new Map(templates.map((entry) => [entry.id, entry]));
    return recommendCvTemplates(
      {
        careerState: profile.careerState,
        careerGoal: profile.careerGoal,
        targetRoleTitle: targetRole?.title ?? '',
      },
      templates
    )
      .map((entry) => ({ template: byId.get(entry.templateId), reason: entry.reason }))
      .filter(
        (entry): entry is { template: CvTemplateWithAccess; reason: string } =>
          entry.template !== undefined
      );
  }, [templates, showHighlights, profile.careerState, profile.careerGoal, targetRole?.title ?? '']);

  const featured = useMemo(() => {
    if (!showHighlights) return [];
    const recommendedIds = new Set(recommended.map((entry) => entry.template.id));
    return templates.filter((entry) => entry.featured && !recommendedIds.has(entry.id));
  }, [templates, recommended, showHighlights]);

  const apply = async (template: CvTemplateWithAccess) => {
    if (!template.access.allowed || applyingId) return;
    setApplyingId(template.id);
    setApplyError(null);
    setNotice(null);
    try {
      const result = await applyCvTemplate(template.id);
      updateSettings({ cvTemplateId: result.templateId });
      setCatalog((previous) =>
        previous
          ? {
              ...previous,
              currentTemplateId: result.templateId,
              templates: previous.templates.map((entry) =>
                entry.id === result.templateId ? { ...entry, access: result.access } : entry
              ),
            }
          : previous
      );
      setPreview(null);
      setNotice(t('Template applied. Your content has not changed.'));
    } catch (error) {
      setApplyError(
        error instanceof Error ? error.message : t('The template could not be applied.')
      );
    } finally {
      setApplyingId(null);
    }
  };

  const displayName = (template: CvTemplateWithAccess) =>
    arabic ? template.nameAr : template.name;
  const displayDescription = (template: CvTemplateWithAccess) =>
    arabic ? template.descriptionAr : template.description;
  const displayLayout = (template: CvTemplateWithAccess) =>
    arabic ? template.layoutLabelAr : template.layoutLabel;

  /**
   * The action row of a card.
   *
   * Every template is available to every candidate, so there is exactly one
   * button: use it. There is no price to show and no second way to obtain it.
   */
  const actions = (template: CvTemplateWithAccess) => {
    const isCurrent = template.id === currentTemplateId;
    const busy = applyingId === template.id;

    if (isCurrent) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-surface)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)]">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('Current')}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void apply(template)}
        disabled={applyingId !== null}
        className={PRIMARY_BUTTON}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {busy ? t('Applying...') : t('Use Template')}
      </button>
    );
  };

  const card = (template: CvTemplateWithAccess, reason?: string) => {
    const isCurrent = template.id === currentTemplateId;
    const busy = applyingId === template.id;
    return (
      <article key={template.id} className={CARD}>
        <button
          type="button"
          onClick={() => void openPreview(template)}
          className="relative block w-full text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          aria-label={`${t('Preview')}: ${displayName(template)}`}
        >
          <CvTemplatePreview
            template={template}
            language={settings.resumeLanguage}
            loadingLabel={t('Loading preview')}
            lockedLabel={t('This preview could not be loaded.')}
            pageCountLabel={(pages) =>
              pages === 1 ? t('1 page') : t('{count} pages').replace('{count}', String(pages))
            }
          />
          {/* A hint that the document can be opened. The document itself is
              never covered by anything that would hide it. */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              <Maximize2 className="h-3 w-3" aria-hidden="true" /> {t('Full preview')}
            </span>
          </span>
        </button>

        <div className="flex flex-1 flex-col gap-2 p-3">
          {/* The badges sit with the name, not over the document. A template
              with the name at its top left would otherwise have a badge
              printed across the candidate's name. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-on-primary)]">
                <Check className="h-2.5 w-2.5" aria-hidden="true" /> {t('Current')}
              </span>
            )}
            {template.featured && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
                <Star className="h-2.5 w-2.5" aria-hidden="true" /> {t('Featured')}
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-[var(--text-primary)]">
                {displayName(template)}
              </h3>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
                {categoryLabel(template.category, arabic)} · {displayLayout(template)}
                {template.atsFriendly ? ` · ${t('ATS friendly')}` : ''}
              </p>
            </div>
          </div>

          {reason && (
            <p className="flex items-start gap-1 text-[11px] font-medium text-[var(--color-primary-text)]">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t(reason)}</span>
            </p>
          )}

          <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {displayDescription(template)}
          </p>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">{actions(template)}</div>

          {!template.access.allowed && (
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
              {t(template.access.reason)}
            </p>
          )}
          {busy && <span className="sr-only">{t('Applying...')}</span>}
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 border-b border-[var(--border-subtle)] pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">{t('Template Library')}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--text-secondary)]">
            {t('Choose how your CV looks. Your content stays exactly as it is.')}
          </p>
        </div>
        <p className="text-[11px] font-medium text-[var(--text-muted)]">
          {filtered.length} / {templates.length} {t('templates')}
        </p>
      </div>

      {catalog && (
        <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2 text-[11px] text-[var(--text-secondary)]">
          {t('Every template is available to every candidate, at no cost.')}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
          {onOpenEditor && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="rounded-lg border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold hover:bg-emerald-500/10"
            >
              {t('Open editor')}
            </button>
          )}
        </div>
      )}

      {applyError && (
        <div
          role="alert"
          className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]"
        >
          {applyError}
        </div>
      )}

      {/* The filters. Every one of them narrows the same catalogue, so the
          search and the category can be combined. */}
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">{t('Search templates')}</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search by name, category or best use')}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] py-2 pe-3 ps-9 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-accent-strong)] focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Category')}>
          <button
            type="button"
            aria-pressed={category === 'all'}
            onClick={() => setCategory('all')}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              category === 'all'
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('All categories')}
          </button>
          {CV_TEMPLATE_CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={category === entry.id}
              onClick={() => setCategory(entry.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                category === entry.id
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {arabic ? entry.labelAr : entry.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)]"
            >
              <div className="aspect-[210/297] bg-[var(--surface-secondary)]" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-2/3 rounded bg-[var(--surface-secondary)]" />
                <div className="h-2 w-1/2 rounded bg-[var(--surface-secondary)]" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-2xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/5 p-6 text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {t('The template library could not be loaded.')}
          </p>
          <p className="mx-auto mt-1 max-w-lg text-xs text-[var(--text-secondary)]">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> {t('Try again')}
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          {recommended.length > 0 && (
            <section className="space-y-3" aria-label={t('Recommended for you')}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[var(--color-primary-text)]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Recommended for you')}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {recommended.map((entry) => card(entry.template, entry.reason))}
              </div>
            </section>
          )}

          {featured.length > 0 && (
            <section className="space-y-3" aria-label={t('Featured templates')}>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-[var(--color-primary-text)]" aria-hidden="true" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  {t('Featured templates')}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {featured.map((entry) => card(entry))}
              </div>
            </section>
          )}

          <section className="space-y-3" aria-label={t('All templates')}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('All templates')}</h3>
              {(query || category !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setCategory('all');
                  }}
                  className="text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline"
                >
                  {t('Clear filters')}
                </button>
              )}
            </div>
            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((entry) => card(entry))}
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 text-center text-xs text-[var(--text-secondary)]">
                {t('No templates match your search.')}
              </div>
            )}
          </section>
        </>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={t('Template preview')}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setPreview(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
                    {displayName(preview)}
                  </h3>
                  {preview.featured && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-primary-text)]">
                      <Star className="h-2.5 w-2.5" aria-hidden="true" /> {t('Featured')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                  {categoryLabel(preview.category, arabic)} · {displayLayout(preview)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-[var(--border-subtle)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label={t('Close preview')}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--surface-secondary)] p-3 sm:p-5">
              {previewStructure ? (
                <CvTemplatePreview
                  template={{ ...preview, structure: previewStructure }}
                  language={settings.resumeLanguage}
                  mode="full"
                  loadingLabel={t('Loading preview')}
                  lockedLabel={t('This preview could not be loaded.')}
                  pageCountLabel={(pages) =>
                    pages === 1 ? t('1 page') : t('{count} pages').replace('{count}', String(pages))
                  }
                />
              ) : (
                // The layout never arrived. This is a broken catalogue rather
                // than a paywall, and it says so instead of pretending the
                // template is locked.
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)]/60 px-6 text-center">
                  <p className="text-xs font-semibold text-[var(--text-secondary)]">
                    {previewError ?? t('This preview could not be loaded.')}
                  </p>
                  <p className="max-w-sm text-[11px] leading-relaxed text-[var(--text-muted)]">
                    {t('Please close this and try again.')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {displayDescription(preview)}
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {t('Best for:')} {preview.bestFor}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
                >
                  {t('Close')}
                </button>
                {preview.id === currentTemplateId ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-primary-text)]">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" /> {t('Current')}
                  </span>
                ) : (
                  actions(preview)
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
