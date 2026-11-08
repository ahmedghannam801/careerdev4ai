/**
 * A template preview.
 *
 * The library shows every template as a real document, not a colour swatch:
 * the same renderer the studio prints draws a complete sample CV here. Two
 * costs come with that honesty — the sample document is large, and thirty-five
 * of them would be a lot of markup to mount at once — so a card renders only
 * when it approaches the viewport.
 *
 * The page is drawn at its real A4 width and scaled with a container query, so
 * the preview is a true miniature of the paper rather than a second layout
 * that could disagree with it.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { CvTemplateDefinition } from '../../../../shared/cvTemplates';
import type { ResumeLanguage } from '../../../../shared/resumeLanguage';
import { cvTemplateSample } from '../../../../shared/cvTemplateSample';
import { CvTemplateRenderer } from './CvTemplateRenderer';

/** A4 at 96dpi. The renderer lays the document out at this width. */
const A4_WIDTH = 794;

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

interface CvTemplatePreviewProps {
  template: CvTemplateDefinition;
  /** The language of the sample document. */
  language?: ResumeLanguage;
  /**
   * `thumbnail` is the miniature on a library card; `full` is the readable
   * document in the preview dialog.
   */
  mode?: 'thumbnail' | 'full';
  /** A label for the loading state. */
  loadingLabel?: string;
}

export const CvTemplatePreview: React.FC<CvTemplatePreviewProps> = ({
  template,
  language = 'en',
  mode = 'thumbnail',
  loadingLabel = 'Loading preview',
}) => {
  const { ref, near } = useNearViewport<HTMLDivElement>(
    mode === 'full' ? '0px' : '400px'
  );
  const cv = cvTemplateSample(language);

  if (mode === 'full') {
    return (
      <div ref={ref} className="w-full">
        {near ? (
          <div className="mx-auto w-full max-w-[794px] shadow-sm">
            <CvTemplateRenderer
              cv={cv}
              language={language}
              template={template}
              printable={false}
            />
          </div>
        ) : (
          <div className="flex min-h-[520px] items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 text-xs text-[var(--text-muted)]">
            {loadingLabel}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-white"
      style={{
        containerType: 'inline-size',
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
      {near ? (
        <div
          style={{
            width: A4_WIDTH,
            transformOrigin: 'top left',
            // The page is drawn at A4 width and scaled to whatever the card
            // is. `cqw` is the card's own width, so no measurement script is
            // needed and the preview stays crisp at every size.
            transform: `scale(calc(100cqw / ${A4_WIDTH}))`,
          }}
        >
          <CvTemplateRenderer
            cv={cv}
            language={language}
            template={template}
            printable={false}
          />
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-secondary)]/40 text-[10px] text-[var(--text-muted)]">
          {loadingLabel}
        </div>
      )}
    </div>
  );
};
