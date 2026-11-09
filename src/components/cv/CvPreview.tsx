/**
 * The CV paper preview.
 *
 * The preview used to be one fixed layout. It is now the entry point to the
 * template engine: the candidate chooses a structure in the template library
 * and this component draws that structure with their own document. Switching
 * a template changes the presentation only — the document model is built from
 * the same CV data every time, so no fact can be lost by changing the look.
 *
 * The paper stays paper-white in both themes: this is a print surface. It
 * carries `data-cv-print`, which is what the print stylesheet keeps.
 *
 * THE PAPER IS A SHEET OF A4.
 *
 * The sheet is drawn at its real width — 794px at 96dpi, which is A4 — and
 * scaled down to whatever room the screen has, rather than being laid out
 * narrower and looking like a sheet of A4. A document laid out at a different
 * width wraps its lines in different places, so a fluid paper would not be the
 * document the printer produces. Drawn at A4 and scaled, it is exactly the
 * document that comes out of the printer, at a size that fits on the screen.
 *
 * The print stylesheet takes the scale away again, so the printed sheet is the
 * sheet, full size.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { CVProfile } from '../../types/career';
import type { ResumeLanguage } from '../../../shared/resumeLanguage';
import type { CvTemplateDefinition } from '../../../shared/cvTemplates';
import { A4_HEIGHT, A4_WIDTH, CvTemplateRenderer } from './templates/CvTemplateRenderer';

interface CvPreviewProps {
  cv: CVProfile;
  /**
   * The language the CV is written in.
   *
   * It decides the section headings printed on the paper and the direction
   * the paper is laid out in. It is deliberately not the interface language:
   * a candidate can work in an Arabic interface and print an English CV.
   */
  language?: ResumeLanguage;
  /** The template the candidate chose. Defaults to the free template. */
  templateId?: string;
  /** A resolved template, when the caller already has one. */
  template?: CvTemplateDefinition;
  /** The catalogue a stale id is resolved against. */
  catalog?: readonly CvTemplateDefinition[];
}

export const CvPreview: React.FC<CvPreviewProps> = ({
  cv,
  language = 'en',
  templateId,
  template,
  catalog,
}) => {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [paperHeight, setPaperHeight] = useState(A4_HEIGHT);

  // The sheet is scaled to the room the screen has. It is never scaled UP: a
  // sheet larger than A4 is not a sheet of A4.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const update = () => {
      const available = element.clientWidth;
      setScale(available > 0 ? Math.min(1, available / A4_WIDTH) : 1);
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The frame reserves the height the scaled sheet needs. A document longer
  // than one sheet is longer here too, so the whole of it is shown.
  useEffect(() => {
    const element = paperRef.current;
    if (!element) return;

    const update = () => setPaperHeight(element.offsetHeight);

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={frameRef}
      data-cv-paper-frame
      className="mx-auto w-full overflow-hidden"
      style={{ height: paperHeight * scale }}
    >
      <div
        ref={paperRef}
        data-cv-paper-scale
        style={{
          width: A4_WIDTH,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        <CvTemplateRenderer
          cv={cv}
          language={language}
          templateId={templateId}
          template={template}
          catalog={catalog}
        />
      </div>
    </div>
  );
};
