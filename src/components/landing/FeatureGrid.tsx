import React from 'react';
import {
  BarChart3,
  Briefcase,
  FileText,
  FolderGit2,
  GraduationCap,
  MessageSquareQuote,
  Route,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';

import { useCareer } from '../../context/CareerContext';

/**
 * The capabilities section of the landing page.
 *
 * Every entry names a capability that is actually implemented in the
 * product, and names the in-app area where it lives, so a visitor can map
 * the promise onto the real navigation once they are inside.
 *
 * Nothing here advertises a feature that does not exist. The platform has
 * no live vacancy feed — it does not invent one — so the entry that talks
 * about opportunities is about matching a CV against a job description the
 * candidate brings, which is what the product genuinely does.
 */

interface Feature {
  icon: React.ComponentType<{ className?: string }>;
  /** The capability name. */
  title: string;
  /** What it does, in one sentence. */
  body: string;
  /** The in-app area where the capability lives. */
  area: string;
  /** AI-assisted surfaces are marked so the accent is meaningful. */
  ai?: boolean;
}

export const FeatureGrid: React.FC = () => {
  const { t } = useCareer();

  // The copy is translated here, as literal translation calls, rather than
  // through a call over the data array. The localisation audit only reads
  // literal calls, so a variable call would render correctly but would hide
  // an untranslated string from the report.
  const FEATURES: Feature[] = [
    {
      icon: BarChart3,
      title: t('Career Intelligence'),
      body: t(
        'A readiness score computed from your own records, with the gaps it is based on shown next to it.'
      ),
      area: t('Career Analysis'),
    },
    {
      icon: FileText,
      title: t('CV Studio'),
      body: t(
        'Parse your CV, work on it, and produce role-targeted versions without ever overwriting the original.'
      ),
      area: t('CV Studio'),
      ai: true,
    },
    {
      icon: Target,
      title: t('Job Matching'),
      body: t(
        'Paste a job description and see the match score, the evidence behind it, and what is still missing.'
      ),
      area: t('CV Studio'),
      ai: true,
    },
    {
      icon: Route,
      title: t('Career Roadmaps'),
      body: t(
        'A phased plan of real tasks, with prerequisites, hour estimates and the reason each task is in your plan.'
      ),
      area: t('Roadmap'),
    },
    {
      icon: GraduationCap,
      title: t('Learning'),
      body: t(
        'A curated catalogue filtered to the gaps your target role actually has, with the source shown for each one.'
      ),
      area: t('Learning'),
    },
    {
      icon: FolderGit2,
      title: t('Projects'),
      body: t(
        'Turn a skill into finished work, submit the deliverable and get a structured evaluation you can point at.'
      ),
      area: t('Projects'),
    },
    {
      icon: UserRound,
      title: t('Portfolio'),
      body: t(
        'A shareable profile that carries your projects, verified skills and the evidence behind them.'
      ),
      area: t('My Profile'),
    },
    {
      icon: Briefcase,
      title: t('Application Tracking'),
      body: t(
        'Every application with its tailored CV, cover letter, stage, follow-up date and full history.'
      ),
      area: t('Applications'),
    },
    {
      icon: MessageSquareQuote,
      title: t('Interview Preparation'),
      body: t(
        'Role-specific questions, mock interviews, a structured evaluation and what to work on next.'
      ),
      area: t('Interviews'),
      ai: true,
    },
  ];

  // The mentor is the capability the whole product is organised around, so
  // it closes the grid as a wide card instead of sitting alone in a
  // half-empty row.
  const MentorIcon = Sparkles;
  const mentorTitle = t('AI Career Mentor');
  const mentorBody = t(
    'An assistant that answers from your verified records and shows you the evidence behind each answer.'
  );
  const mentorArea = t('AI Copilot');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body, area, ai }) => (
          <article
            key={title}
            className="group flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-card)]"
          >
            <span
              className={`cp-icon-tile flex h-9 w-9 items-center justify-center rounded-xl ${
                ai
                  ? 'bg-[var(--color-ai-surface)] text-[var(--color-ai-text)]'
                  : 'bg-[var(--color-accent-surface)] text-[var(--color-primary-text)]'
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>

            <h3 className="mt-3.5 text-sm font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="mt-1.5 flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">{body}</p>

            <div className="mt-3.5 flex items-center gap-1.5">
              <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
                {area}
              </span>
              {ai && (
                <span className="rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ai-text)]">
                  {t('AI-assisted')}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      <article className="flex flex-col gap-4 rounded-2xl border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)]/40 p-5 sm:flex-row sm:items-center sm:gap-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-ai-surface)] text-[var(--color-ai-text)]">
          <MentorIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{mentorTitle}</h3>
            <span className="rounded-full border border-[var(--color-ai-border)] bg-[var(--color-ai-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-ai-text)]">
              {t('AI-assisted')}
            </span>
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-muted)]">
              {mentorArea}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">{mentorBody}</p>
        </div>
      </article>
    </div>
  );
};

export default FeatureGrid;
