import React, { useMemo, useState } from 'react';
import {
  Search,
  Briefcase,
  MapPin,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { Reveal } from '../motion/Motion';

interface JobsViewProps {
  onNavigate: (view: string) => void;
}

/**
 * Job Search.
 *
 * This release has no live job-feed provider connected, so the page does not
 * invent listings or application URLs. It builds real queries on public job
 * boards from the user's target role and location, and every role the user
 * finds can be tracked in the Applications pipeline (which is persisted in
 * PostgreSQL).
 */
export const JobsView: React.FC<JobsViewProps> = ({ onNavigate }) => {
  const { targetRole, profile, applications, t} = useCareer();

  const [keywords, setKeywords] = useState(targetRole.title);
  const [location, setLocation] = useState(profile.location || '');

  const query = keywords.trim() || targetRole.title;
  const place = location.trim();

  const boards = useMemo(
    () => [
      {
        id: 'linkedin',
        name: 'LinkedIn Jobs',
        description: 'Search public job posts and filter by location and work mode.',
        buildUrl: () =>
          `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(
            query
          )}${place ? `&location=${encodeURIComponent(place)}` : ''}`,
      },
      {
        id: 'indeed',
        name: 'Indeed',
        description: 'Broad job-board search with salary and remote filters.',
        buildUrl: () =>
          `https://www.indeed.com/jobs?q=${encodeURIComponent(query)}${
            place ? `&l=${encodeURIComponent(place)}` : ''
          }`,
      },
      {
        id: 'google',
        name: 'Google Jobs',
        description: 'Aggregates postings from multiple job sites in one search.',
        buildUrl: () =>
          `https://www.google.com/search?q=${encodeURIComponent(
            `${query} jobs${place ? ` ${place}` : ''}`
          )}&ibp=htl;jobs`,
      },
      {
        id: 'wellfound',
        name: 'Wellfound',
        description: 'Startup and scale-up roles, including remote positions.',
        buildUrl: () => `https://wellfound.com/jobs?q=${encodeURIComponent(query)}`,
      },
    ],
    [query, place]
  );

  const roleSkills = [
    ...(targetRole.requiredSkills ?? []).map((skill) => ({ ...skill, required: true })),
    ...(targetRole.preferredSkills ?? []).map((skill) => ({ ...skill, required: false })),
  ];

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
            {t('Job Search')}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5">
            Find roles for {targetRole.title}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Launch a real search on a public job board, then track the roles you find in your
            application pipeline.
          </p>
        </div>

        <button
          onClick={() => onNavigate('applications')}
          className="px-4 py-2 rounded-xl bg-[var(--surface-secondary)] hover:bg-[var(--accent-surface)] text-xs font-semibold text-[var(--color-primary-text)] border border-[var(--border-subtle)] flex items-center gap-1.5 transition-colors self-start md:self-auto"
        >
          <span>Applications Pipeline ({applications.length})</span>
          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </button>
      </div>

      {/* Honest scope notice */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 flex items-start gap-3">
        <Info className="w-4 h-4 text-[var(--color-primary-text)] shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">
            {t('No live job feed is connected in this release.')}
          </p>
          <p>
            CareerPilot does not display invented vacancies or placeholder application links. The
            searches below open real job boards using your target role and location, and anything
            you decide to apply for can be tracked in the Applications pipeline.
          </p>
        </div>
      </div>

      {/* Search builder */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              {t('Job title or keywords')}
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-3" />
              <input
                type="text"
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                placeholder={t('e.g. Frontend Engineer')}
                className="w-full ps-9 pe-3.5 py-2.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              {t('Location (optional)')}
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-[var(--text-muted)] absolute start-3 top-3" />
              <input
                type="text"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder={t('e.g. Remote or Berlin')}
                className="w-full ps-9 pe-3.5 py-2.5 rounded-xl bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {boards.map((board) => (
            <a
              key={board.id}
              href={board.buildUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 hover:border-[var(--accent-primary)]/50 hover:bg-[var(--surface-secondary)] transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md flex items-start justify-between gap-3 group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Briefcase className="w-4 h-4 text-[var(--color-primary-text)]" />
                  <span>{board.name}</span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {board.description}
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--color-primary-text)] shrink-0 mt-0.5" />
            </a>
          ))}
        </div>
      </div>

      {/* Target-role expectations */}
      <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 shadow-xs">
        <div>
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {t('What employers usually ask for')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            These are the requirements defined for your target role. Use them to read a posting and
            tailor your CV — there is no invented match score.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          {roleSkills.map((skill) => (
            <div
              key={`${skill.required ? 'required' : 'preferred'}-${skill.name}`}
              className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--color-success-strong)] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[var(--text-primary)]">{skill.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {skill.required ? 'Core requirement' : 'Preferred'} · target level {skill.minLevel}/5
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onNavigate('applications')}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <span>{t('Track a role you found')}</span>
          <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        </button>
      </div>
    </Reveal>
  );
};
