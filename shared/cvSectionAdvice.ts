/**
 * The advice that belongs to a section.
 *
 * The measurement produces one report about the whole CV, and the studio
 * used to show it as one block: a score, a list of findings, and an action
 * plan. The candidate then had to work out which part of the document a
 * finding was about, which is the part they would have to change.
 *
 * This module puts the advice next to the section it is about. It is a
 * mapping from the report onto the sections of the document, and it is
 * deliberately conservative: an item that cannot honestly be attributed to a
 * section is not attributed to one. A recommendation in the wrong place is
 * worse than no recommendation, because the candidate acts on it.
 *
 * Nothing here invents advice. Every item comes from a part of the report
 * that already exists, so the advice a section shows and the report it came
 * from cannot disagree.
 */

import type { CvAnalysisReport } from './cvAnalysis.ts';
import type { CvSectionKey } from './cvExtraction.ts';

/** What kind of advice an item is. */
export type CvAdviceKind = 'missing' | 'weak' | 'finding';

/** One piece of advice about a section. */
export interface CvSectionAdviceItem {
  /** A stable id, so the interface can key on it. */
  id: string;
  kind: CvAdviceKind;
  /** The advice, in the report's own words. */
  text: string;
}

/** The advice for one section. */
export interface CvSectionAdvice {
  section: CvSectionKey;
  items: CvSectionAdviceItem[];
}

/** The evidence of a dimension, when the dimension was measured. */
function dimensionEvidence(
  report: CvAnalysisReport,
  key: CvAnalysisReport['dimensions'][number]['key']
): string[] {
  const dimension = report.dimensions.find((entry) => entry.key === key);
  if (!dimension || !dimension.available) return [];
  return dimension.evidence;
}

/**
 * The advice for a section.
 *
 * A section with nothing to say returns nothing. The studio shows the
 * advice beside the section it belongs to, and an empty box beside every
 * section would train the candidate to ignore the ones that matter.
 */
export function sectionAdvice(
  report: CvAnalysisReport | null | undefined,
  section: CvSectionKey
): CvSectionAdvice {
  const items: CvSectionAdviceItem[] = [];
  if (!report) return { section, items };

  switch (section) {
    case 'skills': {
      for (const skill of report.skills.missing) {
        items.push({ id: `skill-missing-${skill}`, kind: 'missing', text: skill });
      }
      for (const skill of report.skills.needsEvidence) {
        items.push({ id: `skill-evidence-${skill}`, kind: 'weak', text: skill });
      }
      break;
    }
    case 'experience': {
      for (const finding of report.experience.findings) {
        items.push({ id: `experience-${finding}`, kind: 'finding', text: finding });
      }
      for (const evidence of dimensionEvidence(report, 'impact')) {
        items.push({ id: `experience-impact-${evidence}`, kind: 'weak', text: evidence });
      }
      break;
    }
    case 'summary': {
      for (const evidence of dimensionEvidence(report, 'clarity')) {
        items.push({ id: `summary-clarity-${evidence}`, kind: 'weak', text: evidence });
      }
      break;
    }
    case 'projects': {
      for (const evidence of dimensionEvidence(report, 'impact')) {
        items.push({ id: `projects-impact-${evidence}`, kind: 'weak', text: evidence });
      }
      break;
    }
    case 'personal': {
      // Only the failures. A pass is not advice; it is the absence of a
      // problem, and the studio says so elsewhere.
      for (const finding of report.ats.findings) {
        if (finding.status === 'fail') {
          items.push({ id: `header-ats-${finding.id}`, kind: 'finding', text: finding.detail });
        }
      }
      break;
    }
    default:
      break;
  }

  return { section, items };
}

/**
 * The sections that have advice, with the advice.
 *
 * The studio uses this to put a marker beside the section tabs, so the
 * candidate can see where the work is before they open anything.
 */
export function sectionsWithAdvice(
  report: CvAnalysisReport | null | undefined,
  sections: readonly CvSectionKey[]
): Array<{ section: CvSectionKey; count: number }> {
  if (!report) return [];
  return sections
    .map((section) => ({ section, count: sectionAdvice(report, section).items.length }))
    .filter((entry) => entry.count > 0);
}
