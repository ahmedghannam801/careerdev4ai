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
 * disagree with it. A card shows the first sheet at a size that can be read,
 * and says how many sheets the whole document runs to; the dialog carries the
 * entire document, with its sheet boundaries drawn, so nothing is hidden from
 * the candidate who wants to read it.
 *
 * The number of pages the document would print as is shown next to it, for
 * the same reason.
 *
 * There is no locked state here. Looking at a template is free, so the layout
 * is always here to draw; whether the candidate may USE the template is a
 * different question, and the library answers it beside the document.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CvTemplateDefinition, CvTemplateStructure } from '../../../../shared/cvTemplates';
import type { ResumeLanguage } from '../../../../shared/resumeLanguage';
import { cvTemplateSample } from '../../../../shared/cvTemplateSample';
import { A4_HEIGHT, A4_WIDTH, CV_TEMPLATE_DENSITY, CvTemplateRenderer } from './CvTemplateRenderer';

/**
 * What the preview is asked to draw.
 *
 * The layout is optional only so that a catalogue that failed to load still
 * type-checks; in practice the server sends the layout for every template,
 * because a template the candidate may not use is still a template they are
 * allowed to look at.
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
 *
 * The element is measured through a CALLBACK ref, not an object ref. The page
 * is not on the screen until the card nears the viewport, so an effect that
 * ran once on mount would find nothing to measure and would never run again:
 * the document would keep the height of nothing, and the page count would be
 * a guess. A callback ref runs whenever the element actually appears.
 */
function useMeasuredSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);

  const ref = useCallback((node: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) return;

    const update = () =>
      setSize({ width: node.clientWidth, height: node.clientHeight });

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      cleanupRef.current = () => window.removeEventListener('resize', update);
      return;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);
    cleanupRef.current = () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    []
  );

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
  /**
   * A label for the case where the layout is missing altogether.
   *
   * This is a failure state, not a paywall: the server sends the layout for
   * every template, so a preview without a layout means the catalogue did not
   * load.
   */
  lockedLabel?: string;
}

export const CvTemplatePreview: React.FC<CvTemplatePreviewProps> = ({
  template,
  language = 'en',
  mode = 'thumbnail',
  loadingLabel = 'Loading preview',
  pageCountLabel,
  onPageCount,
  lockedLabel = 'This preview could not be loaded.',
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
 * The card is a sheet of A4 and the document is drawn at A4 width, then scaled
 * to the width of the card. What the candidate sees is therefore the first
 * sheet of the real paper, at the real proportions, at a size they can read —
 * a thumbnail of a three-page document shrunk until all three pages fit would
 * be a grey smudge, and a smudge is not a preview.
 *
 * The card is not lying about the rest of the document: the page count sits in
 * the corner, and the full preview in the dialog carries the whole thing with
 * its sheet boundaries drawn.
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

  // The card box and the near-viewport watcher watch the same element.
  const setCardNode = useCallback(
    (node: HTMLDivElement | null) => {
      nearRef.current = node;
      cardRef(node);
    },
    [nearRef, cardRef]
  );

  const pages = useMemo(
    () => (structure ? cvTemplatePageCount(template as CvTemplateDefinition, pageSize.height || A4_HEIGHT) : 0),
    [template, structure, pageSize.height]
  );

  useEffect(() => {
    if (structure && pageSize.height > 0) onPageCount?.(pages);
  }, [pages, pageSize.height, structure, onPageCount]);

  // The scale that puts one full sheet across the card.
  const scale = useMemo(() => {
    if (!cardSize.width) return null;
    return cardSize.width / A4_WIDTH;
  }, [cardSize.width]);

  return (
    <div
      ref={setCardNode}
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
        // The layout never arrived. This is a broken catalogue, not a paywall,
        // and it says so plainly instead of pretending the template is locked.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--surface-secondary)]/60 px-3 text-center">
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
 *
 * The page is fitted to the WIDTH of the frame by default. That is the whole
 * point of a preview that is read in a dialog: showing the page at its natural
 * width pushes half of it out of sight, and a candidate who has to scroll
 * sideways to read a name has not been shown a preview.
 *
 * When the document runs past one sheet, the sheet boundaries are drawn on it
 * and the reader is told which sheet they are looking at, so scrolling through
 * a long document is navigation rather than guesswork.
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
  const { ref: frameRef, size: frameSize } = useMeasuredSize<HTMLDivElement>();
  const { ref: pageRef, size: pageSize } = useMeasuredSize<HTMLDivElement>();
  const [currentPage, setCurrentPage] = useState(1);
  const structure = template.structure;

  const pages = useMemo(
    () => (structure ? cvTemplatePageCount(template as CvTemplateDefinition, pageSize.height || A4_HEIGHT) : 0),
    [template, structure, pageSize.height]
  );

  useEffect(() => {
    if (structure && pageSize.height > 0) onPageCount?.(pages);
  }, [pages, pageSize.height, structure, onPageCount]);

  // The scale that fits the sheet across the frame.
  const fitScale = useMemo(() => {
    if (!frameSize.width) return 1;
    // A little breathing room so the sheet never touches the frame.
    return Math.min(1, (frameSize.width - 24) / A4_WIDTH);
  }, [frameSize.width]);

  const scale = zoom ?? fitScale;
  const naturalHeight = pageSize.height || A4_HEIGHT;

  const step = (direction: 1 | -1) => {
    const current = zoom ?? fitScale;
    const next = Math.min(2, Math.max(0.25, Math.round((current + direction * 0.1) * 100) / 100));
    onZoomChange(next);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    const sheet = A4_HEIGHT * scale;
    if (sheet <= 0) return;
    const page = Math.floor(element.scrollTop / sheet) + 1;
    setCurrentPage(Math.min(pages, Math.max(1, page)));
  };

  // There is nothing to draw only when the catalogue itself failed.
  if (!structure) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-6 text-center">
        <p className="text-xs font-semibold text-[var(--text-secondary)]">
          {lockedLabel}
        </p>
      </div>
    );
  }

  // The sheet boundaries, drawn on the paper so the reader can see where a
  // page ends and the next one begins.
  const sheetBreaks = [];
  for (let index = 1; index < pages; index += 1) {
    sheetBreaks.push(index * A4_HEIGHT);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-[var(--text-muted)]">
          {pageCountLabel ? pageCountLabel(pages) : `${pages} pages`}
          {pages > 1 ? (
            <span className="ms-1.5 tabular-nums">
              · {currentPage} / {pages}
            </span>
          ) : null}
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

      <div
        ref={frameRef}
        onScroll={handleScroll}
        className="max-h-[70vh] overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
      >
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
              position: 'relative',
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

            {/* Where one sheet ends and the next begins. */}
            {sheetBreaks.map((offset) => (
              <div
                key={offset}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: offset,
                  left: 0,
                  right: 0,
                  height: 0,
                  borderTop: '1px dashed rgba(15, 23, 42, 0.28)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
