/**
 * The last check before a CV leaves the studio.
 *
 * An export always succeeds, which is exactly the problem: a document with no
 * phone number, no summary and no number anywhere in its bullets downloads
 * just as cleanly as a good one. This panel reads the same document the
 * exporter reads and names what an employer or an ATS would notice, before
 * the file is sent rather than after.
 *
 * It never blocks the export. A candidate may have a reason to send a CV that
 * is still incomplete, and the decision is theirs; the panel only makes sure
 * the decision is informed.
 */

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, FileWarning } from 'lucide-react';
import type { CVProfile } from '../../types/career';

interface CvSendChecklistProps {
  cv: CVProfile;
  /** Opens the tab where the gap is fixed. */
  onOpenTab: (tab: 'editor' | 'data' | 'review') => void;
  t: (key: string) => string;
}

interface Check {
  id: string;
  label: string;
  detail: string;
  /** The tab where the candidate fixes it. */
  fixTab: 'editor' | 'data' | 'review';
  done: boolean;
}

/** Whether any bullet in the document carries a number, i.e. a result. */
function hasQuantifiedBullet(cv: CVProfile): boolean {
  const bullets = [
    ...cv.experiences.flatMap((entry) => entry.bullets ?? []),
    ...cv.projects.flatMap((entry) => entry.bullets ?? []),
    ...(cv.volunteering ?? []).flatMap((entry) => entry.bullets ?? []),
    ...(cv.internships ?? []).flatMap((entry) => entry.bullets ?? []),
    ...(cv.leadership ?? []).flatMap((entry) => entry.bullets ?? []),
    ...(cv.research ?? []).flatMap((entry) => entry.bullets ?? []),
  ];
  return bullets.some((bullet) => /\d/.test(bullet));
}

export const CvSendChecklist: React.FC<CvSendChecklistProps> = ({ cv, onOpenTab, t }) => {
  const checks = useMemo<Check[]>(() => {
    const hasEmail = Boolean(cv.email?.trim());
    const hasReachable = Boolean(cv.phone?.trim() || cv.location?.trim());
    return [
      {
        id: 'contact',
        label: t('An employer can reach you'),
        detail: hasEmail && hasReachable
          ? t('Email and a phone number or location are on the document.')
          : t('Add an email and either a phone number or a location.'),
        fixTab: 'data',
        done: hasEmail && hasReachable,
      },
      {
        id: 'summary',
        label: t('The top of the page says who you are'),
        detail:
          cv.summary?.trim().length >= 60
            ? t('A summary of at least a sentence is present.')
            : t('Write two lines naming the role you want and the value you bring.'),
        fixTab: 'editor',
        done: cv.summary?.trim().length >= 60,
      },
      {
        id: 'impact',
        label: t('At least one bullet shows a result'),
        detail: hasQuantifiedBullet(cv)
          ? t('A bullet carries a number, which is what makes impact credible.')
          : t('Add a number to one bullet: volume, percentage, time saved or people served.'),
        fixTab: 'editor',
        done: hasQuantifiedBullet(cv),
      },
      {
        id: 'skills',
        label: t('The skills section is usable'),
        detail:
          cv.skillsList.filter((skill) => skill.trim()).length >= 5
            ? t('Five or more skills are listed.')
            : t('List at least five skills, strongest first.'),
        fixTab: 'data',
        done: cv.skillsList.filter((skill) => skill.trim()).length >= 5,
      },
      {
        id: 'links',
        label: t('There is a way to see your work'),
        detail:
          cv.linkedin?.trim() || cv.github?.trim() || cv.website?.trim()
            ? t('A professional link is on the document.')
            : t('Add a LinkedIn, GitHub or portfolio link.'),
        fixTab: 'data',
        done: Boolean(cv.linkedin?.trim() || cv.github?.trim() || cv.website?.trim()),
      },
    ];
  }, [cv, t]);

  const failing = checks.filter((check) => !check.done);

  // A complete document is worth saying out loud, once, without a second
  // panel of green rows a candidate has to read to learn nothing is wrong.
  if (failing.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-[var(--color-success-strong)]/25 bg-[var(--color-success-surface)] px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success-strong)]" />
        <p className="text-xs font-semibold text-[var(--color-success-strong)]">
          {t('Send-ready: contact details, summary, evidence and skills are all present.')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5 p-4">
      <div className="flex items-start gap-2.5">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[var(--text-primary)]">
            {failing.length === 1
              ? t('One thing to fix before you send this')
              : t('{count} things to fix before you send this').replace(
                  '{count}',
                  String(failing.length)
                )}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            {t('You can still export. These are what a recruiter or an ATS is most likely to mark down.')}
          </p>

          <ul className="mt-3 space-y-1.5">
            {failing.map((check) => (
              <li key={check.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                <AlertTriangle className="mt-1 h-3 w-3 shrink-0 text-[var(--color-warning)]" />
                <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                  {check.label}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">— {check.detail}</span>
                <button
                  type="button"
                  onClick={() => onOpenTab(check.fixTab)}
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[var(--color-primary-text)] hover:underline"
                >
                  {t('Fix')}
                  <ChevronRight className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
