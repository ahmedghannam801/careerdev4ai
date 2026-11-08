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
 */

import React from 'react';
import type { CVProfile } from '../../types/career';
import type { ResumeLanguage } from '../../../shared/resumeLanguage';
import type { CvTemplateDefinition } from '../../../shared/cvTemplates';
import { CvTemplateRenderer } from './templates/CvTemplateRenderer';

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
}) => (
  <CvTemplateRenderer
    cv={cv}
    language={language}
    templateId={templateId}
    template={template}
    catalog={catalog}
  />
);
