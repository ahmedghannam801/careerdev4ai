import React, { useState } from 'react';
import { ChevronDown, Eye, GraduationCap, Briefcase, FolderGit2, Award, Route, BookOpen } from 'lucide-react';

import { useCareer } from '../../context/CareerContext';

/**
 * The evidence the AI Career Mentor can actually see.
 *
 * The mentor reads the user's verified account — not the prompt, and not
 * anything the browser can send it. That is what keeps its answers honest,
 * and it is also the thing a user is entitled to check: "on what basis did
 * it tell me that?"
 *
 * This panel answers that question. It lists the records the assistant
 * reasons over, with their counts, and it is rendered from the same client
 * state the rest of the dashboard uses. It does not claim to be the exact
 * server-side prompt; it is the user-facing summary of the same verified
 * record set, and it says so.
 */

interface EvidencePanelProps {
  /** Where a row navigates to when the user opens it. */
  onNavigate: (view: string) => void;
}

export const EvidencePanel: React.FC<EvidencePanelProps> = ({ onNavigate }) => {
  const {
    targetRole,
    analysis,
    skills,
    roadmapPhases,
    learningRecommendations,
    projects,
    evidenceItems,
    applications,
    profile,
    t,
  } = useCareer();

  const [open, setOpen] = useState(false);

  const allTasks = roadmapPhases.flatMap((phase) =>
    phase.milestones.flatMap((milestone) => milestone.tasks)
  );
  const completedTasks = allTasks.filter((task) => task.status === 'completed').length;

  const gaps = analysis.criticalGaps ?? [];

  const records: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    view: string;
  }[] = [
    {
      icon: Eye,
      label: t('Target role'),
      value: targetRole?.title ?? t('Not set'),
      view: 'my-career',
    },
    {
      icon: Award,
      label: t('Skills recorded'),
      value: `${skills.length}`,
      view: 'skills',
    },
    {
      icon: Route,
      label: t('Roadmap steps'),
      value: `${completedTasks}/${allTasks.length}`,
      view: 'roadmap',
    },
    {
      icon: BookOpen,
      label: t('Learning items'),
      value: `${learningRecommendations.length}`,
      view: 'learning',
    },
    {
      icon: FolderGit2,
      label: t('Projects'),
      value: `${projects.length}`,
      view: 'projects',
    },
    {
      icon: Award,
      label: t('Evidence entries'),
      value: `${evidenceItems.length}`,
      view: 'evidence',
    },
    {
      icon: Briefcase,
      label: t('Applications'),
      value: `${applications.length}`,
      view: 'applications',
    },
    {
      icon: GraduationCap,
      label: t('Work experience'),
      value: `${profile.experiences.length}`,
      view: 'profile',
    },
  ];

  return (
    <div className="border-b border-[var(--border-subtle)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-[var(--surface-secondary)]/60"
      >
        <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
          <Eye className="h-3.5 w-3.5 shrink-0 text-[var(--color-ai-text)]" />
          <span className="truncate">{t('What the assistant can see')}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-2.5 px-4 pb-3.5">
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            {t(
              'The assistant reads these verified records when it answers. It cannot see anything you have not recorded here, and it is told to say so when a record is missing.'
            )}
          </p>

          <ul className="grid grid-cols-2 gap-1.5">
            {records.map(({ icon: Icon, label, value, view }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => onNavigate(view)}
                  className="flex w-full items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-2 text-start transition-colors hover:border-[var(--color-ai-border)]"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-ai-text)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-[var(--text-muted)]">{label}</span>
                    <span className="block truncate text-xs font-bold text-[var(--text-primary)]">{value}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {gaps.length > 0 && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/50 px-2.5 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                {t('Skill gaps it reasons about')}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {gaps.slice(0, 5).map((gap) => (
                  <span
                    key={gap.skill}
                    className="rounded-full bg-[var(--surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                  >
                    {gap.skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
            {t('Account')}: {profile.name}
          </p>
        </div>
      )}
    </div>
  );
};

export default EvidencePanel;
