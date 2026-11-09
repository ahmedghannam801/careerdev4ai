/**
 * A template preview.
 *
 * The library shows every template as a real document, not a colour swatch:
 * the same renderer the studio prints draws a complete sample CV here. Two
 * costs come with that honesty — the sample document is large, and thirty-five
 * of them would be a lot of markup to mount at once — so a card renders only
 * when it approaches the viewport.
 *
 * The page is drawn at its real A4 width and scaled to fit, so the preview is
 * a true miniature of the paper rather than a second layout that could
 * disagree with it. It is scaled to fit the WHOLE document, not the first
 * sheet: a candidate choosing between a one-page and a two-page document has
 * to see both, and a preview that stops at the fold is a preview that lies.
 *
 * The number of pages the document would print as is shown next to it, for
 * the same reason.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import type { CvTemplateDefinition, CvTemplateStructure } from '../../../../shared/cvTemplates';
import type { ResumeLanguage } from '../../../../shared/resumeLanguage';
import { cvTemplateSample } from '../../../../shared/cvTemplateSample';
import { A4_HEIGHT, A4_WIDTH, CV_TEMPLATE_DENSITY, CvTemplateRenderer } from './CvTemplateRenderer';

/**
 * What the preview is asked to draw.
 *
 * The layout is optional because the server does not send it for a template
 * the candidate may not use. A preview of a locked template therefore has
 * nothing to draw, and says so.
 */
export type CvTemplatePreviewTarget =
  | CvTemplateDefinition
  | (Omit<CvTemplateDefinition, 'structure'> & { structure: CvTemplateStructure | null });

/**
 * Reports when an element is close enough to the viewport to be worth
 * rendering. The root margin is generous so the card is ready before it is
 * seen; a browser without IntersectionObserver simply renders immediately.
 */
function useNearViewport<T extends HTMLElement>(rootMargin = '400px') {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, near };
}

/**
 * Measures an element.
 *
 * The preview has to know how tall the document is before it can scale it to
 * fit, and the document's height depends on its own content — which is only
 * known once it has been laid out. A ResizeObserver is the only way to learn
 * it without measuring twice.
 */
function useMeasuredSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = () =>
      setSize({ width: element.clientWidth, height: element.clientHeight });

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

/**
 * The number of sheets of A4 a document would print as.
 *
 * The page box is one sheet tall; the printable part of a sheet is a little
 * shorter than that, because the page carries its own margin. A document that
 * is shorter than one sheet is one page, and one that overflows is counted.
 */
export function cvTemplatePageCount(
  template: Pick<CvTemplateDefinition, 'structure'>,
  pageHeight: number
): number {
  const pad = CV_TEMPLATE_DENSITY[template.structure.density].pad;
  const printable = Math.max(1, A4_HEIGHT - pad * 2);
  const content = Math.max(0, pageHeight - pad * 2);
  return Math.max(1, Math.ceil(content / printable));
}

interface CvTemplatePreviewProps {
  template: CvTemplatePreviewTarget;
  /** The language of the sample document. */
  language?: ResumeLanguage;
  /**
   * `thumbnail` is the miniature on a library card; `full` is the readable
   * document in the preview dialog.
   */
  mode?: 'thumbnail' | 'full';
  /** A label for the loading state. */
  loadingLabel?: string;
  /** A label for the page count, e.g. "2 pages". */
  pageCountLabel?: (pages: number) => string;
  /** Called with the number of pages once the document has been measured. */
  onPageCount?: (pages: number) => void;
  /** The message shown when the layout was withheld. */
  lockedLabel?: string;
}

export const CvTemplatePreview: React.FC<CvTemplatePreviewProps> = ({
  template,
  language = 'en',
  mode = 'thumbnail',
  loadingLabel = 'Loading preview',
  pageCountLabel,
  onPageCount,
  lockedLabel = 'This template is part of a paid plan.',
}) => {
  const { ref: nearRef, near } = useNearViewport<HTMLDivElement>(
    mode === 'full' ? '0px' : '400px'
  );
  const cv = cvTemplateSample(language);

  // The zoom of the readable preview. `null` means "fit the width".
  const [zoom, setZoom] = useState<number | null>(null);

  if (mode === 'full') {
    return (
      <div ref={nearRef} className="w-full">
        {near ? (
          <FullPreview
            template={template}
            cv={cv}
            language={language}
            zoom={zoom}
            onZoomChange={setZoom}
            pageCountLabel={pageCountLabel}
            onPageCount={onPageCount}
            lockedLabel={lockedLabel}
          />
        ) : (
          <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 text-xs text-[var(--text-muted)]">
            {loadingLabel}
          </div>
        )}
      </div>
    );
  }

  return (
    <ThumbnailPreview
      template={template}
      cv={cv}
      language={language}
      near={near}
      nearRef={nearRef}
      loadingLabel={loadingLabel}
      pageCountLabel={pageCountLabel}
      onPageCount={onPageCount}
      lockedLabel={lockedLabel}
    />
  );
};

/**
 * The miniature on a library card.
 *
 * The card is a sheet of A4 and the document is drawn at A4 width. The
 * document is then scaled by whichever is smaller — the width it needs or the
 * height it needs — so that the WHOLE document is inside the card. A preview
 * that cut the bottom off would be telling the candidate a two-page template
 * is a one-page one.
 */
function ThumbnailPreview({
  template,
  cv,
  language,
  near,
  nearRef,
  loadingLabel,
  pageCountLabel,
  onPageCount,
  lockedLabel,
}: {
  template: CvTemplatePreviewTarget;
  cv: ReturnType<typeof cvTemplateSample>;
  language: ResumeLanguage;
  near: boolean;
  nearRef: React.RefObject<HTMLDivElement | null>;
  loadingLabel: string;
  pageCountLabel?: (pages: number) => string;
  onPageCount?: (pages: number) => void;
  lockedLabel?: string;
}) {
  const { ref: cardRef, size: cardSize } = useMeasuredSize<HTMLDivElement>();
  const { ref: pageRef, size: pageSize } = useMeasuredSize<HTMLDivElement>();
  const structure = template.structure;

  const pages = useMemo(
    () => (structure ? cvTemplatePageCount(template as CvTemplateDefinition, pageSize.height || A4_HEIGHT) : 0),
    [template, structure, pageSize.height]
  );

  useEffect(() => {
    if (structure && pageSize.height > 0) onPageCount?.(pages);
  }, [pages, pageSize.height, structure, onPageCount]);

  // The scale that puts the whole document inside the card.
  const scale = useMemo(() => {
    if (!cardSize.width || !pageSize.height) return null;
    const cardHeight = (cardSize.width * A4_HEIGHT) / A4_WIDTH;
    const byWidth = cardSize.width / A4_WIDTH;
    const byHeight = cardHeight / pageSize.height;
    return Math.min(byWidth, byHeight);
  }, [cardSize.width, pageSize.height]);

  return (
    <div
      ref={(node) => {
        nearRef.current = node;
        cardRef.current = node;
      }}
      className="relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white"
      style={{
        aspectRatio: '210 / 297',
        // The card holds the page, not the interface. In an Arabic interface
        // the card would otherwise be laid out from the right, and the scaled
        // page — whose origin is the top LEFT corner — would sit outside the
        // card and show nothing. The document keeps its own direction: the
        // paper inside is `dir="rtl"` for an Arabic CV and reads right to left
        // as it should.
        direction: 'ltr',
      }}
      aria-hidden="true"
    >
      {near && structure ? (
        <div
          ref={pageRef}
          style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            marginLeft: -A4_WIDTH / 2,
            width: A4_WIDTH,
            transformOrigin: 'top center',
            transform: scale ? `scale(${scale})` : undefined,
          }}
        >
          <CvTemplateRenderer
            cv={cv}
            language={language}
            template={template as CvTemplateDefinition}
            printable={false}
          />
        </div>
      ) : near ? (
        // The layout was withheld, so there is no document to draw. The card
        // says so rather than showing an empty sheet.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--surface-secondary)]/60 px-3 text-center">
          <Lock className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
          <span className="text-[10px] leading-snug text-[var(--text-muted)]">
            {lockedLabel}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-secondary)]/40 text-[10px] text-[var(--text-muted)]">
          {loadingLabel}
        </div>
      )}

      {/* The page count, so the size of the document is part of the choice. */}
      {near && structure && pageSize.height > 0 && pageCountLabel && (
        <span className="absolute bottom-1.5 end-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          {pageCountLabel(pages)}
        </span>
      )}
    </div>
  );
}

/**
 * The readable document in the preview dialog.
 *
 * It can be zoomed, because a two-column layout that has been scaled to fit a
 * dialog cannot be read. The zoom is a scale on the real A4 page rather than
 * a re-layout, so what the candidate reads is what the printer will produce.
 */
function FullPreview({
  template,
  cv,
  language,
  zoom,
  onZoomChange,
  pageCountLabel,
  onPageCount,
  lockedLabel,
}: {
  template: CvTemplatePreviewTarget;
  cv: ReturnType<typeof cvTemplateSample>;
  language: ResumeLanguage;
  zoom: number | null;
  onZoomChange: (zoom: number | null) => void;
  pageCountLabel?: (pages: number) => string;
  onPageCount?: (pages: number) => void;
  lockedLabel?: string;
}) {
  const { ref: pageRef, size: pageSize } = useMeasuredSize<HTMLDivElement>();
  const structure = template.structure;

  const pages = useMemo(
    () => (structure ? cvTemplatePageCount(template as CvTemplateDefinition, pageSize.height || A4_HEIGHT) : 0),
    [template, structure, pageSize.height]
  );

  useEffect(() => {
    if (structure && pageSize.height > 0) onPageCount?.(pages);
  }, [pages, pageSize.height, structure, onPageCount]);

  // `null` means the page is shown at its natural width and the frame scrolls
  // sideways. A number scales the page about its top left corner.
  const scale = zoom ?? 1;
  const naturalHeight = pageSize.height || A4_HEIGHT;

  const step = (direction: 1 | -1) => {
    const current = zoom ?? 1;
    const next = Math.min(2, Math.max(0.5, Math.round((current + direction * 0.1) * 10) / 10));
    onZoomChange(next);
  };

  // There is nothing to draw when the server withheld the layout.
  if (!structure) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-6 text-center">
        <Lock className="h-5 w-5 text-[var(--text-muted)]" aria-hidden="true" />
        <p className="text-xs font-semibold text-[var(--text-secondary)]">
          {lockedLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-[var(--text-muted)]">
          {pageCountLabel ? pageCountLabel(pages) : `${pages} pages`}
        </p>

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => step(-1)}
            className="h-7 w-7 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="min-w-[3.5rem] text-center text-[11px] font-semibold tabular-nums text-[var(--text-secondary)]">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            className="h-7 w-7 rounded-lg border border-[var(--border-subtle)] text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(null)}
            aria-pressed={zoom === null}
            className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
              zoom === null
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Fit
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3">
        <div
          style={{
            width: A4_WIDTH * scale,
            height: naturalHeight * scale,
            margin: '0 auto',
          }}
        >
          <div
            ref={pageRef}
            style={{
              width: A4_WIDTH,
              transformOrigin: 'top left',
              transform: `scale(${scale})`,
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)',
            }}
          >
            <CvTemplateRenderer
              cv={cv}
              language={language}
              template={template as CvTemplateDefinition}
              printable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
