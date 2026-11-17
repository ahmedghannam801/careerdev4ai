/**
 * The order of the sections of a CV.
 *
 * A template proposes an order. The candidate decides it. This control is
 * where that decision is made, and it writes it into the document itself
 * (`sectionOrder`), so the preview, the PDF and the Word file all read the
 * same order from the same place.
 *
 * Two ways of moving a section are offered, because two different people need
 * to move a section:
 *
 *  - dragging a section with the pointer, which is the fastest way and the
 *    way everybody expects;
 *  - a pair of buttons that move a section up or down, which works from the
 *    keyboard and from a screen reader, and which is the only way the control
 *    can be operated on a touch screen where dragging is fiddly.
 *
 * Both do exactly the same thing, and both announce what they did.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, RotateCcw } from 'lucide-react';
import type { CVProfile } from '../../../types/career';
import type { CvSectionKey, CvTemplateDefinition } from '../../../../shared/cvTemplates';
import { buildCvLayoutPlan, cvOrderableSections } from '../../../../shared/cvLayout';

interface CvSectionOrderControlProps {
  cv: CVProfile;
  template: CvTemplateDefinition;
  update: (updates: Partial<CVProfile>) => void;
  t: (key: string) => string;
  language?: 'ar' | 'en';
}

/**
 * Moves a section to a new place in the list.
 *
 * The list is the whole list of the document's sections, so a move never
 * leaves a section behind: the order written to the document is always a
 * complete order, and a section that is added later keeps the place the
 * template gave it.
 */
function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Fills a placeholder in a translated sentence.
 *
 * The translation catalogue is keyed by the whole sentence, so a sentence that
 * carries a name has to carry a placeholder too: the Arabic sentence is
 * written once with `{name}` in it, and the name is put in afterwards.
 */
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
  const [dragging, setDragging] = useState<CvSectionKey | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const dragKeyRef = useRef<CvSectionKey | null>(null);

  /**
   * The sections as the document will print them.
   *
   * The same plan the preview draws from, so the list can never offer an
   * order the paper does not follow.
   */
  const sections = useMemo(() => {
    const plan = buildCvLayoutPlan({ cv, template, language });
    return cvOrderableSections(plan);
  }, [cv, template, language]);

  const customised = Array.isArray(cv.sectionOrder) && cv.sectionOrder.length > 0;

  const apply = useCallback(
    (keys: CvSectionKey[]) => {
      update({ sectionOrder: keys });
    },
    [update]
  );

  const moveSection = useCallback(
    (key: CvSectionKey, delta: number) => {
      const index = sections.findIndex((section) => section.key === key);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= sections.length) return;
      const next = move(
        sections.map((section) => section.key),
        index,
        target
      );
      apply(next);
      const moved = sections[index];
      setAnnouncement(
        fill(
          delta < 0 ? t('{name} moved up to position {position}') : t('{name} moved down to position {position}'),
          { name: moved.heading, position: target + 1 }
        )
      );
    },
    [apply, sections, t]
  );

  const dropOn = useCallback(
    (target: CvSectionKey) => {
      const source = dragKeyRef.current;
      dragKeyRef.current = null;
      setDragging(null);
      if (!source || source === target) return;
      const from = sections.findIndex((section) => section.key === source);
      const to = sections.findIndex((section) => section.key === target);
      if (from < 0 || to < 0) return;
      const next = move(
        sections.map((section) => section.key),
        from,
        to
      );
      apply(next);
      const moved = sections[from];
      setAnnouncement(fill(t('{name} moved to position {position}'), { name: moved.heading, position: to + 1 }));
    },
    [apply, sections, t]
  );

  const reset = useCallback(() => {
    apply([]);
    setAnnouncement(t('The section order is back to the one the template suggests'));
  }, [apply, t]);

  if (sections.length < 2) {
    // There is nothing to reorder. The control says so rather than showing a
    // list of one item with two disabled buttons.
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-4">
        <h3 className="text-xs font-semibold text-[var(--text-primary)]">{t('Section order')}</h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">
          {t('Your CV has one section, so there is nothing to reorder.')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">{t('Section order')}</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-relaxed">
            {t(
              'Drag a section, or use the arrows, to change the order your CV is read in. The template still decides how each section looks.'
            )}
          </p>
        </div>
        {customised && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            {t('Reset')}
          </button>
        )}
      </div>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {sections.map((section, index) => (
          <li
            key={section.key}
            draggable
            onDragStart={(event) => {
              dragKeyRef.current = section.key;
              setDragging(section.key);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', section.key);
            }}
            onDragEnd={() => {
              dragKeyRef.current = null;
              setDragging(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              dropOn(section.key);
            }}
            className={`flex items-center gap-2 px-3 py-2 transition-colors ${
              dragging === section.key ? 'bg-[var(--surface-secondary)]' : ''
            }`}
          >
            <span
              className="shrink-0 cursor-grab text-[var(--text-muted)]"
              aria-hidden="true"
              title={t('Drag to reorder')}
            >
              <GripVertical className="w-4 h-4" />
            </span>

            <span className="flex-1 min-w-0 text-[12px] font-medium text-[var(--text-primary)] truncate">
              {section.heading}
            </span>

            {section.column === 'aside' && (
              <span className="shrink-0 text-[10px] font-semibold text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-1.5 py-0.5">
                {t('Side column')}
              </span>
            )}

            <span className="shrink-0 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => moveSection(section.key, -1)}
                disabled={index === 0}
                aria-label={fill(t('Move {name} up'), { name: section.heading })}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => moveSection(section.key, 1)}
                disabled={index === sections.length - 1}
                aria-label={fill(t('Move {name} down'), { name: section.heading })}
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      {/* The announcement is what a screen reader hears after a move. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
