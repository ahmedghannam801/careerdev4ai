/**
 * The layout editor of the CV.
 *
 * A template proposes a document. The candidate decides where each part of it
 * goes. This control is where those decisions are made, and every one of them
 * is written into the document itself (`sectionOrder` and `layout`), so the
 * preview, the PDF, the Word file and the next reload all read the same
 * decision from the same place.
 *
 * Three kinds of movement are offered, because three different people need to
 * move something:
 *
 *  - a pointer drag, which works with a mouse and with a finger;
 *  - a pair of arrow buttons, which works from the keyboard and from a screen
 *    reader and is the dependable fallback on a small touch screen;
 *  - an explicit "main / side" control for a template that has two columns.
 *
 * Every move is announced to assistive technology, every change can be undone,
 * and the whole layout can be reset to the template's own proposal.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Columns2,
  Eye,
  EyeOff,
  GripVertical,
  PanelLeft,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import type {
  CVLayoutPreferences,
  CVProfile,
  CvSectionColumn,
} from '../../../types/career';
import type { CvSectionKey, CvTemplateDefinition } from '../../../../shared/cvTemplates';
import {
  buildCvLayoutPlan,
  cvOrderableSections,
  cvTemplateSupportsSidebar,
} from '../../../../shared/cvLayout';

interface CvSectionOrderControlProps {
  cv: CVProfile;
  template: CvTemplateDefinition;
  update: (updates: Partial<CVProfile>) => void;
  t: (key: string) => string;
  language?: 'ar' | 'en';
}

type DropPosition = 'before' | 'after';

interface SectionDrop {
  key: CvSectionKey;
  position: DropPosition;
}

interface EntryDrop {
  sectionKey: CvSectionKey;
  entryId: string;
  position: DropPosition;
}

type DragState =
  | { kind: 'section'; source: CvSectionKey }
  | { kind: 'entry'; sectionKey: CvSectionKey; sourceId: string };

interface Snapshot {
  sectionOrder: CVProfile['sectionOrder'];
  layout: CVProfile['layout'];
  links: CVProfile['links'];
}

/** Moves one item inside a list, without losing the item. */
function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Fills a placeholder in a translated sentence. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  );
}

export const CvSectionOrderControl: React.FC<CvSectionOrderControlProps> = ({
  cv,
  template,
  update,
  t,
  language = 'en',
}) => {
  const [announcement, setAnnouncement] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [sectionDrop, setSectionDrop] = useState<SectionDrop | null>(null);
  const [entryDrop, setEntryDrop] = useState<EntryDrop | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [canUndo, setCanUndo] = useState(false);

  const historyRef = useRef<Snapshot[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const dropRef = useRef<{ section: SectionDrop | null; entry: EntryDrop | null }>({
    section: null,
    entry: null,
  });

  const plan = useMemo(
    () => buildCvLayoutPlan({ cv, template, language }),
    [cv, template, language]
  );
  const sections = useMemo(() => cvOrderableSections(plan), [plan]);
  const sectionByKey = useMemo(
    () => new Map(plan.document.sections.map((section) => [section.key, section])),
    [plan]
  );
  const supportsSidebar = cvTemplateSupportsSidebar(template);
  const customised =
    (Array.isArray(cv.sectionOrder) && cv.sectionOrder.length > 0) ||
    Boolean(cv.layout && Object.keys(cv.layout).length > 0) ||
    (cv.links ?? []).some((link) => link.placement !== undefined);

  const contact = [cv.email, cv.phone, cv.location].filter((value) => value.trim().length > 0);
  const visibleLinks = (cv.links ?? []).filter((link) => link.enabled && link.url.trim());
  const contactPlacement = cv.layout?.contactPlacement ?? 'header';
  const linksPlacement = cv.layout?.linksPlacement ?? 'section';

  /**
   * The refs let the pointer listeners read the newest document without being
   * torn down and rebuilt on every pointermove.
   */
  const latest = useRef({ cv, plan, sections, t });
  latest.current = { cv, plan, sections, t };

  const commit = useCallback(
    (updates: Partial<CVProfile>, message: string) => {
      historyRef.current = [
        ...historyRef.current.slice(-19),
        { sectionOrder: cv.sectionOrder, layout: cv.layout, links: cv.links },
      ];
      setCanUndo(true);
      update(updates);
      setAnnouncement(message);
    },
    [cv.links, cv.layout, cv.sectionOrder, update]
  );
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const undo = useCallback(() => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    update({
      sectionOrder: previous.sectionOrder,
      layout: previous.layout,
      links: previous.links,
    });
    setCanUndo(historyRef.current.length > 0);
    setAnnouncement(t('Undid the last layout change'));
  }, [t, update]);

  const reset = useCallback(() => {
    historyRef.current = [
      ...historyRef.current.slice(-19),
      { sectionOrder: cv.sectionOrder, layout: cv.layout, links: cv.links },
    ];
    setCanUndo(true);
    const clearedLinks = (cv.links ?? []).map((link) => {
      const copy = { ...link };
      delete copy.placement;
      return copy;
    });
    update({ sectionOrder: [], layout: {}, links: clearedLinks });
    setAnnouncement(t('The layout is back to the one the template suggests'));
  }, [cv.layout, cv.links, cv.sectionOrder, t, update]);

  const setSectionOrder = useCallback(
    (keys: CvSectionKey[], message: string) => {
      commitRef.current({ sectionOrder: keys }, message);
    },
    []
  );

  const moveSection = useCallback(
    (key: CvSectionKey, delta: number) => {
      const list = latest.current.sections;
      const index = list.findIndex((section) => section.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= list.length) return;
      const next = move(
        list.map((section) => section.key),
        index,
        target
      );
      const moved = list[index];
      setSectionOrder(
        next,
        fill(
          delta < 0
            ? t('{name} moved up to position {position}')
            : t('{name} moved down to position {position}'),
          { name: moved.heading, position: target + 1 }
        )
      );
    },
    [setSectionOrder, t]
  );

  const setColumn = useCallback(
    (key: CvSectionKey, column: CvSectionColumn) => {
      const current = latest.current.cv;
      const nextLayout: CVLayoutPreferences = {
        ...(current.layout ?? {}),
        sectionColumns: {
          ...(current.layout?.sectionColumns ?? {}),
          [key]: column,
        },
      };
      const heading = latest.current.sections.find((section) => section.key === key)?.heading ?? '';
      commitRef.current(
        { layout: nextLayout },
        fill(
          column === 'aside'
            ? t('{name} moved to the side column')
            : t('{name} moved to the main column'),
          { name: heading }
        )
      );
    },
    [t]
  );

  /**
   * Hides a section from the printed document, or shows it again.
   *
   * The key is kept in the order either way, so a section that is shown again
   * returns to the place the candidate had put it rather than to the end.
   */
  const setSectionHidden = useCallback(
    (key: CvSectionKey, hidden: boolean) => {
      const current = latest.current.cv;
      const next = new Set<CvSectionKey>(current.layout?.hiddenSections ?? []);
      if (hidden) next.add(key);
      else next.delete(key);
      const rest: CVLayoutPreferences = { ...(current.layout ?? {}) };
      delete rest.hiddenSections;
      const nextLayout: CVLayoutPreferences =
        next.size > 0 ? { ...rest, hiddenSections: [...next] } : rest;
      const heading = latest.current.sections.find((section) => section.key === key)?.heading ?? '';
      commitRef.current(
        { layout: nextLayout },
        hidden
          ? fill(t('{name} hidden from the document'), { name: heading })
          : fill(t('{name} shown on the document'), { name: heading })
      );
    },
    [t]
  );

  const setContactPlacement = useCallback(
    (placement: 'header' | 'section') => {
      const current = latest.current.cv;
      commitRef.current(
        { layout: { ...(current.layout ?? {}), contactPlacement: placement } },
        placement === 'header'
          ? t('Contact details moved to the header')
          : t('Contact details moved to a section of their own')
      );
    },
    [t]
  );

  const setLinksPlacement = useCallback(
    (placement: 'header' | 'section') => {
      const current = latest.current.cv;
      commitRef.current(
        { layout: { ...(current.layout ?? {}), linksPlacement: placement } },
        placement === 'header'
          ? t('Links moved to the header')
          : t('Links moved to their own section')
      );
    },
    [t]
  );

  const setLinkPlacement = useCallback(
    (id: string, placement: 'header' | 'section') => {
      const current = latest.current.cv;
      const links = (current.links ?? []).map((link) =>
        link.id === id ? { ...link, placement } : link
      );
      const label = (current.links ?? []).find((link) => link.id === id)?.label ?? '';
      commitRef.current(
        { links },
        fill(t('{name} moved to the {column}'), {
          name: label,
          column: placement === 'header' ? t('header') : t('section'),
        })
      );
    },
    [t]
  );

  const moveEntry = useCallback(
    (sectionKey: CvSectionKey, entryId: string, delta: number) => {
      const current = latest.current;
      const entries = current.plan.document.sections.find(
        (section) => section.key === sectionKey
      )?.entries;
      if (!entries) return;
      const ids = entries.map((entry) => entry.id);
      const from = ids.indexOf(entryId);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const nextIds = move(ids, from, to);
      const nextLayout: CVLayoutPreferences = {
        ...(current.cv.layout ?? {}),
        entryOrder: {
          ...(current.cv.layout?.entryOrder ?? {}),
          [sectionKey]: nextIds,
        },
      };
      const name = entries[from]?.title ?? '';
      commitRef.current(
        { layout: nextLayout },
        fill(
          delta < 0
            ? t('{name} moved up inside its section')
            : t('{name} moved down inside its section'),
          { name }
        )
      );
    },
    []
  );

  const startDrag = useCallback(
    (event: React.PointerEvent, state: DragState) => {
      // Only the primary button drags with a mouse. A secondary click keeps
      // its browser meaning.
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      dragRef.current = state;
      setDrag(state);
    },
    []
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      if (!element) return;

      if (drag.kind === 'section') {
        const row = element.closest<HTMLElement>('[data-cv-layout-section]');
        if (!row) {
          dropRef.current.section = null;
          setSectionDrop(null);
          return;
        }
        const key = row.dataset.cvLayoutSection as CvSectionKey;
        if (key === drag.source) {
          dropRef.current.section = null;
          setSectionDrop(null);
          return;
        }
        const rect = row.getBoundingClientRect();
        const next: SectionDrop = {
          key,
          position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
        };
        dropRef.current.section = next;
        setSectionDrop(next);
        return;
      }

      const row = element.closest<HTMLElement>('[data-cv-layout-entry]');
      if (!row) {
        dropRef.current.entry = null;
        setEntryDrop(null);
        return;
      }
      if (row.dataset.cvLayoutSection !== drag.sectionKey) {
        dropRef.current.entry = null;
        setEntryDrop(null);
        return;
      }
      const entryId = row.dataset.cvLayoutEntry;
      if (!entryId || entryId === drag.sourceId) {
        dropRef.current.entry = null;
        setEntryDrop(null);
        return;
      }
      const rect = row.getBoundingClientRect();
      const next: EntryDrop = {
        sectionKey: drag.sectionKey,
        entryId,
        position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
      };
      dropRef.current.entry = next;
      setEntryDrop(next);
    };

    const finish = () => {
      const dropped = dropRef.current;
      dropRef.current = { section: null, entry: null };
      setSectionDrop(null);
      setEntryDrop(null);
      setDrag(null);
      dragRef.current = null;

      if (drag.kind === 'section' && dropped.section) {
        const list = latest.current.sections;
        const keys = list.map((section) => section.key);
        const from = keys.indexOf(drag.source);
        const to = keys.indexOf(dropped.section.key);
        if (from < 0 || to < 0 || from === to) return;
        const insertAt = dropped.section.position === 'before' ? to : to + 1;
        const next = [...keys];
        next.splice(from, 1);
        const adjusted = insertAt > from ? insertAt - 1 : insertAt;
        next.splice(adjusted, 0, drag.source);
        const moved = list[from];
        commitRef.current(
          { sectionOrder: next },
          fill(latest.current.t('{name} moved to position {position}'), {
            name: moved.heading,
            position: adjusted + 1,
          })
        );
        return;
      }

      if (drag.kind === 'entry' && dropped.entry) {
        const current = latest.current;
        const entries = current.plan.document.sections.find(
          (section) => section.key === drag.sectionKey
        )?.entries;
        if (!entries) return;
        const ids = entries.map((entry) => entry.id);
        const from = ids.indexOf(drag.sourceId);
        const to = ids.indexOf(dropped.entry.entryId);
        if (from < 0 || to < 0 || from === to) return;
        const insertAt = dropped.entry.position === 'before' ? to : to + 1;
        const next = [...ids];
        next.splice(from, 1);
        const adjusted = insertAt > from ? insertAt - 1 : insertAt;
        next.splice(adjusted, 0, drag.sourceId);
        const nextLayout: CVLayoutPreferences = {
          ...(current.cv.layout ?? {}),
          entryOrder: {
            ...(current.cv.layout?.entryOrder ?? {}),
            [drag.sectionKey]: next,
          },
        };
        commitRef.current(
          { layout: nextLayout },
          fill(current.t('{name} moved to position {position}'), {
            name: entries[from]?.title ?? '',
            position: adjusted + 1,
          })
        );
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', finish, { once: true });
    window.addEventListener('pointercancel', finish, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [drag]);

  if (sections.length < 2 && !customised) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">{t('Layout')}</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">
          {t('Your CV has one section, so there is nothing to reorder.')}
        </p>
      </div>
    );
  }

  const placementButton = (
    active: boolean,
    onClick: () => void,
    label: string,
    icon: React.ReactNode
  ) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
        active
          ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
          : 'border-[var(--border-subtle)] bg-[var(--surface-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">{t('Layout')}</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
            {t(
              'Drag a section, or use the arrows, to change the order your CV is read in. Move a section to the side column, and reorder the entries inside it. The template still decides how each part looks.'
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canUndo && (
            <button
              type="button"
              onClick={undo}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              {t('Undo')}
            </button>
          )}
          {customised && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('Reset')}
            </button>
          )}
        </div>
      </div>

      {/* Contact and links can leave the masthead independently. */}
      {(contact.length > 0 || visibleLinks.length > 0) && (
        <div className="space-y-2 border-b border-[var(--border-subtle)] px-4 py-3">
          {contact.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                {t('Contact details')}
              </span>
              <div className="flex items-center gap-1">
                {placementButton(
                  contactPlacement === 'header',
                  () => setContactPlacement('header'),
                  t('Header'),
                  <PanelLeft className="h-3 w-3" aria-hidden="true" />
                )}
                {placementButton(
                  contactPlacement === 'section',
                  () => setContactPlacement('section'),
                  t('Section'),
                  <Columns2 className="h-3 w-3" aria-hidden="true" />
                )}
              </div>
            </div>
          )}

          {visibleLinks.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">
                  {t('Professional links')}
                </span>
                <div className="flex items-center gap-1">
                  {placementButton(
                    linksPlacement === 'header',
                    () => setLinksPlacement('header'),
                    t('Header'),
                    <PanelLeft className="h-3 w-3" aria-hidden="true" />
                  )}
                  {placementButton(
                    linksPlacement === 'section',
                    () => setLinksPlacement('section'),
                    t('Section'),
                    <Columns2 className="h-3 w-3" aria-hidden="true" />
                  )}
                </div>
              </div>
              <ul className="space-y-1">
                {visibleLinks.map((link) => {
                  const placement = link.placement ?? linksPlacement;
                  return (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface-secondary)]/50 px-2 py-1"
                    >
                      <span className="min-w-0 truncate text-[11px] text-[var(--text-primary)]">
                        {link.label || link.url}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {placementButton(
                          placement === 'header',
                          () => setLinkPlacement(link.id, 'header'),
                          t('Header'),
                          <PanelLeft className="h-3 w-3" aria-hidden="true" />
                        )}
                        {placementButton(
                          placement === 'section',
                          () => setLinkPlacement(link.id, 'section'),
                          t('Section'),
                          <Columns2 className="h-3 w-3" aria-hidden="true" />
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <ul className="relative divide-y divide-[var(--border-subtle)]">
        {sections.map((section, index) => {
          const documentSection = sectionByKey.get(section.key);
          const entries = documentSection?.entries ?? [];
          const canReorderEntries = documentSection?.kind === 'entries' && entries.length > 1;
          const open = openSections[section.key] === true;
          const showDropBefore =
            sectionDrop?.key === section.key && sectionDrop.position === 'before';
          const showDropAfter =
            sectionDrop?.key === section.key && sectionDrop.position === 'after';
          const isDragging = drag?.kind === 'section' && drag.source === section.key;

          return (
            <li
              key={section.key}
              data-cv-layout-section={section.key}
              className={`relative transition-colors ${
                isDragging ? 'bg-[var(--surface-secondary)]' : ''
              }`}
            >
              {showDropBefore && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-2 -top-px h-0.5 rounded-full bg-[var(--accent-primary)] transition-all"
                />
              )}

              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  aria-label={fill(t('Drag {name}'), { name: section.heading })}
                  title={t('Drag to reorder')}
                  onPointerDown={(event) =>
                    startDrag(event, { kind: 'section', source: section.key })
                  }
                  className="shrink-0 cursor-grab touch-none rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                </button>

                <span
                  className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
                    section.hidden
                      ? 'text-[var(--text-muted)] line-through decoration-[var(--text-muted)]/40'
                      : 'text-[var(--text-primary)]'
                  }`}
                >
                  {section.heading}
                </span>

                {/* Visibility is a printing decision, so it is offered beside
                    the move controls rather than in a separate screen. The
                    section's words stay in the document either way. */}
                <button
                  type="button"
                  onClick={() => setSectionHidden(section.key, !section.hidden)}
                  aria-pressed={!section.hidden}
                  title={
                    section.hidden
                      ? t('Show this section on the CV')
                      : t('Hide this section from the CV')
                  }
                  aria-label={fill(
                    section.hidden ? t('Show {name} on the CV') : t('Hide {name} from the CV'),
                    { name: section.heading }
                  )}
                  className={`shrink-0 rounded-md p-1 transition-colors hover:bg-[var(--surface-secondary)] ${
                    section.hidden
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--color-primary-text)]'
                  }`}
                >
                  {section.hidden ? (
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                {supportsSidebar && (
                  <button
                    type="button"
                    onClick={() =>
                      setColumn(section.key, section.column === 'aside' ? 'main' : 'aside')
                    }
                    title={
                      section.column === 'aside'
                        ? t('Move to the main column')
                        : t('Move to the side column')
                    }
                    aria-label={fill(
                      section.column === 'aside'
                        ? t('Move {name} to the main column')
                        : t('Move {name} to the side column'),
                      { name: section.heading }
                    )}
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                      section.column === 'aside'
                        ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {section.column === 'aside' ? t('Side') : t('Main')}
                  </button>
                )}

                {canReorderEntries && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSections((previous) => ({
                        ...previous,
                        [section.key]: !open,
                      }))
                    }
                    aria-expanded={open}
                    aria-label={fill(
                      open ? t('Hide the entries of {name}') : t('Show the entries of {name}'),
                      { name: section.heading }
                    )}
                    className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                )}

                <span className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveSection(section.key, -1)}
                    disabled={index === 0}
                    aria-label={fill(t('Move {name} up'), { name: section.heading })}
                    className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(section.key, 1)}
                    disabled={index === sections.length - 1}
                    aria-label={fill(t('Move {name} down'), { name: section.heading })}
                    className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              </div>

              {open && canReorderEntries && (
                <ul className="space-y-1 px-3 pb-2 ps-9">
                  {entries.map((entry, entryIndex) => {
                    const entryVisible =
                      entryDrop?.sectionKey === section.key &&
                      entryDrop.entryId === entry.id;
                    const entryDragging =
                      drag?.kind === 'entry' &&
                      drag.sectionKey === section.key &&
                      drag.sourceId === entry.id;
                    return (
                      <li
                        key={entry.id}
                        data-cv-layout-entry={entry.id}
                        data-cv-layout-section={section.key}
                        className={`relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                          entryDragging
                            ? 'border-[var(--accent-primary)]/40 bg-[var(--accent-surface)]'
                            : 'border-transparent bg-[var(--surface-secondary)]/40'
                        }`}
                      >
                        {entryVisible && (
                          <div
                            aria-hidden="true"
                            className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-[var(--accent-primary)] ${
                              entryDrop.position === 'before' ? '-top-px' : '-bottom-px'
                            }`}
                          />
                        )}
                        <button
                          type="button"
                          aria-label={fill(t('Drag {name}'), {
                            name: entry.title || t('entry'),
                          })}
                          title={t('Drag to reorder')}
                          onPointerDown={(event) =>
                            startDrag(event, {
                              kind: 'entry',
                              sectionKey: section.key,
                              sourceId: entry.id,
                            })
                          }
                          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] active:cursor-grabbing"
                        >
                          <GripVertical className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
                          {entry.title || t('Untitled')}
                        </span>
                        <button
                          type="button"
                          onClick={() => moveEntry(section.key, entry.id, -1)}
                          disabled={entryIndex === 0}
                          aria-label={fill(t('Move {name} up'), {
                            name: entry.title || t('entry'),
                          })}
                          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
                        >
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveEntry(section.key, entry.id, 1)}
                          disabled={entryIndex === entries.length - 1}
                          aria-label={fill(t('Move {name} down'), {
                            name: entry.title || t('entry'),
                          })}
                          className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
                        >
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {showDropAfter && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent-primary)] transition-all"
                />
              )}
            </li>
          );
        })}
      </ul>

      {/* What a screen reader hears after every move. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {customised && (
        <p className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] px-4 py-2 text-[10px] text-[var(--text-muted)]">
          <Check className="h-3 w-3" aria-hidden="true" />
          {t('Saved with your CV. The preview, the PDF and the Word file follow this layout.')}
        </p>
      )}
    </div>
  );
};
