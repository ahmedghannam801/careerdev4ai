/**
 * The CV built from the user's own records.
 *
 * The CV studio could only ever show a document the user had imported or
 * typed by hand. Everything the platform knows about the user — their rated
 * skills, their experience, their projects, their volunteering, the courses
 * they finished, their certificates — was never assembled into a CV.
 *
 * This panel shows that assembly. It is deliberately honest about what it
 * can and cannot say: the "still needed" list names every field the CV
 * cannot fill because the user has not supplied it. Nothing is invented to
 * fill a gap.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  FolderGit2,
  Award,
  BookOpen,
  MapPin,
} from 'lucide-react';
import { fetchBuiltCv, type BuiltCv } from '../../lib/personalizationApi';
import { useCareer } from '../../context/CareerContext';

export const BuiltCvPanel: React.FC = () => {
  const { t } = useCareer();
  const [cv, setCv] = useState<BuiltCv | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchBuiltCv()
      .then((response) => {
        if (cancelled) return;
        setCv(response.cv);
        setError(null);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Your CV could not be assembled right now.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-12 text-sm text-[var(--text-secondary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('Assembling your CV from your profile…')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-8 text-center space-y-2">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {t('Your CV could not be assembled right now')}
        </div>
        <p className="text-xs text-[var(--text-secondary)]">{error}</p>
      </div>
    );
  }

  if (!cv) return null;

  return (
    <div data-guide="cv-build" className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* The document */}
      <div className="lg:col-span-7 space-y-6">
        <div className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xs">
          <header className="space-y-1.5">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {cv.fullName ?? t('Your name')}
            </h2>
            <p className="text-sm text-[var(--color-primary-text)] font-medium">
              {cv.title ?? ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
              {cv.email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {cv.email}
                </span>
              )}
              {cv.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {cv.phone}
                </span>
              )}
              {cv.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {cv.location}
                </span>
              )}
            </div>
            {cv.links.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[11px] text-[var(--color-primary-text)] hover:underline"
              >
                {link.label}
              </a>
            ))}
          </header>

          {cv.summary ? (
            <section className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Summary')}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{cv.summary}</p>
            </section>
          ) : null}

          {cv.experiences.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Experience')}
              </h3>
              {cv.experiences.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {entry.role} · {entry.company}
                    </span>
                    <span className="shrink-0 text-[10px] font-mono text-[var(--text-muted)]">
                      {entry.startDate ?? ''}
                      {entry.endDate || entry.isCurrent ? ` — ${entry.endDate ?? 'Present'}` : ''}
                    </span>
                  </div>
                  {entry.description && (
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {entry.description}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {cv.volunteering.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Volunteering')}
              </h3>
              {cv.volunteering.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {entry.role} · {entry.organization}
                    </span>
                    <span className="shrink-0 text-[10px] font-mono text-[var(--text-muted)]">
                      {entry.startDate ?? ''}
                      {entry.endDate || entry.isCurrent ? ` — ${entry.endDate ?? 'Present'}` : ''}
                    </span>
                  </div>
                  {entry.description && (
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {entry.description}
                    </p>
                  )}
                  {entry.achievements.length > 0 && (
                    <ul className="list-disc ps-4 text-xs text-[var(--text-secondary)]">
                      {entry.achievements.map((achievement) => (
                        <li key={achievement}>{achievement}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          {cv.projects.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Projects')}
              </h3>
              {cv.projects.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {entry.title}
                  </div>
                  {entry.goal && (
                    <p className="text-xs text-[var(--text-secondary)]">{entry.goal}</p>
                  )}
                  {entry.description && (
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {entry.description}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {cv.educations.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Education')}
              </h3>
              {cv.educations.map((entry) => (
                <div key={entry.id} className="space-y-1">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    {[entry.degree, entry.field].filter(Boolean).join(', ') || entry.institution}
                  </div>
                  <div className="text-xs text-[var(--text-secondary)]">{entry.institution}</div>
                </div>
              ))}
            </section>
          )}

          {cv.skills.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Skills')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {cv.skills.map((skill) => (
                  <span
                    key={skill.name}
                    className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
                  >
                    {skill.name}
                    <span className="ms-1 font-mono text-[10px] text-[var(--text-muted)]">
                      {skill.level}/5
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {cv.certifications.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Certifications')}
              </h3>
              <ul className="space-y-1">
                {cv.certifications.map((entry) => (
                  <li key={entry.id} className="text-xs text-[var(--text-secondary)]">
                    {entry.name}
                    {entry.issuer ? ` — ${entry.issuer}` : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {cv.courses.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {t('Completed courses')}
              </h3>
              <ul className="space-y-1">
                {cv.courses.map((entry) => (
                  <li key={entry.id} className="text-xs text-[var(--text-secondary)]">
                    {entry.title} — {entry.provider}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {/* What is in it, and what is still missing. */}
      <div className="lg:col-span-5 space-y-5">
        <div className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <Sparkles className="h-3 w-3" />
            {t('What this CV is built from')}
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: Briefcase, label: 'Experience', value: cv.counts.experiences },
              { icon: GraduationCap, label: 'Education', value: cv.counts.educations },
              { icon: FolderGit2, label: 'Projects', value: cv.counts.projects },
              { icon: HeartHandshake, label: 'Volunteering', value: cv.counts.volunteering },
              { icon: CheckCircle2, label: 'Skills', value: cv.counts.skills },
              { icon: Award, label: 'Certifications', value: cv.counts.certifications },
              { icon: BookOpen, label: 'Courses', value: cv.counts.courses },
            ].map((entry) => (
              <div
                key={entry.label}
                className="flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)]/40 px-2.5 py-2"
              >
                <entry.icon className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                <span className="text-[11px] text-[var(--text-secondary)]">{entry.label}</span>
                <span className="ms-auto font-mono text-xs font-bold text-[var(--text-primary)]">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* The honest list of what the CV cannot say yet. */}
        {cv.missing.length > 0 && (
          <div className="p-5 rounded-2xl border border-amber-500/25 bg-amber-500/5 space-y-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {t('Still needed to complete this CV')}
            </div>
            <ul className="space-y-1">
              {cv.missing.map((item) => (
                <li key={item} className="text-[11px] text-[var(--text-secondary)]">
                  {item}
                </li>
              ))}
            </ul>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
              {t(
                'Nothing here is filled in for you. CareerDev4AI will not invent a job, a date, a metric or a certificate you do not have.'
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
