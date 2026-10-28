/**
 * The CV paper preview.
 *
 * The preview used to show four sections — summary, experience, education and
 * skills — while the document carried more. A candidate who wrote a project
 * description could not see it on the page they were about to print, and a
 * section with nothing in it still printed its heading.
 *
 * This component renders the whole document, and it renders it honestly:
 *
 *   - a section with content is shown in full;
 *   - a section with nothing in it is not shown at all, because a heading
 *     with an empty space under it reads as an omission;
 *   - the professional links are shown in the order the editor put them in,
 *     and a link the candidate switched off is not shown.
 *
 * The paper stays paper-white in both themes: this is a print surface.
 */

import React from 'react';
import type { CVProfile } from '../../types/career';

interface CvPreviewProps {
  cv: CVProfile;
}

export const CvPreview: React.FC<CvPreviewProps> = ({ cv }) => {
  const links = (cv.links ?? []).filter((link) => link.enabled && link.url.trim());
  const volunteering = cv.volunteering ?? [];
  const courses = cv.courses ?? [];
  const certificationDetails = cv.certificationDetails ?? [];

  const contactParts = [cv.email, cv.phone, cv.location].filter(
    (value) => value && value.trim()
  );

  return (
    <div
      data-cv-print
      className="p-8 sm:p-12 rounded-2xl bg-white border border-[var(--border-subtle)] shadow-md text-slate-900 font-sans space-y-6"
    >
      {/* Paper header */}
      <header className="border-b border-slate-200 pb-4 text-center space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{cv.fullName}</h2>
        {cv.title && (
          <div className="text-xs font-semibold text-[var(--color-print-primary)] tracking-wide uppercase">
            {cv.title}
          </div>
        )}
        {contactParts.length > 0 && (
          <div className="text-xs text-slate-500 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-1">
            {contactParts.map((part, index) => (
              <span key={`${part}-${index}`} className="inline-flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">·</span>}
                {part}
              </span>
            ))}
          </div>
        )}
        {links.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[var(--color-print-primary)] hover:underline break-all"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}
      </header>

      {/* Summary */}
      {cv.summary.trim() && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Professional Summary
          </h3>
          <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{cv.summary}</p>
        </section>
      )}

      {/* Experience */}
      {cv.experiences.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Work Experience
          </h3>
          <div className="space-y-3">
            {cv.experiences.map((exp) => (
              <div key={exp.id} className="space-y-1 text-xs">
                <div className="flex justify-between gap-3 font-bold text-slate-900">
                  <span>{exp.role}{exp.company ? ` — ${exp.company}` : ''}</span>
                  {exp.period && (
                    <span className="shrink-0 font-mono text-slate-500 font-normal">{exp.period}</span>
                  )}
                </div>
                {exp.location && <div className="text-[11px] text-slate-500">{exp.location}</div>}
                {exp.bullets.length > 0 && (
                  <ul className="list-disc list-inside space-y-1 text-slate-700 pt-0.5">
                    {exp.bullets.map((bullet, index) => (
                      <li key={index} className="leading-relaxed">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Volunteering */}
      {volunteering.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Volunteering
          </h3>
          {volunteering.map((entry) => (
            <div key={entry.id} className="space-y-1 text-xs">
              <div className="flex justify-between gap-3 font-bold text-slate-900">
                <span>{entry.role}{entry.organization ? ` — ${entry.organization}` : ''}</span>
                {entry.period && (
                  <span className="shrink-0 font-mono text-slate-500 font-normal">{entry.period}</span>
                )}
              </div>
              {entry.location && <div className="text-[11px] text-slate-500">{entry.location}</div>}
              {entry.bullets.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-slate-700 pt-0.5">
                  {entry.bullets.map((bullet, index) => (
                    <li key={index} className="leading-relaxed">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Projects */}
      {cv.projects.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Projects
          </h3>
          {cv.projects.map((project) => (
            <div key={project.id} className="space-y-1 text-xs">
              <div className="flex justify-between gap-3 font-bold text-slate-900">
                <span>{project.title}</span>
                {project.role && (
                  <span className="shrink-0 text-slate-500 font-normal">{project.role}</span>
                )}
              </div>
              {project.technologies.length > 0 && (
                <div className="text-[11px] text-slate-500">{project.technologies.join(' · ')}</div>
              )}
              {project.bullets.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-slate-700 pt-0.5">
                  {project.bullets.map((bullet, index) => (
                    <li key={index} className="leading-relaxed">
                      {bullet}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Education */}
      {cv.education.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Education
          </h3>
          {cv.education.map((edu) => {
            // A field of study recorded as a full stop is a typo in the
            // profile. Rendering it would put "B.Sc in ." on the document.
            const field = /[a-z]/i.test(edu.field ?? '') ? edu.field : '';
            const qualification = [edu.degree, field].filter(Boolean).join(' in ');
            return (
              <div key={edu.id} className="space-y-0.5 text-xs">
                <div className="flex justify-between gap-3">
                  <div>
                    <span className="font-bold text-slate-900">
                      {qualification || edu.institution}
                    </span>
                    <span className="text-slate-500"> — {edu.institution}</span>
                  </div>
                  {edu.period && (
                    <span className="shrink-0 font-mono text-slate-500">{edu.period}</span>
                  )}
                </div>
                {edu.gpa && <div className="text-[11px] text-slate-500">GPA: {edu.gpa}</div>}
                {edu.description && (
                  <p className="text-[11px] leading-relaxed text-slate-600">{edu.description}</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Skills */}
      {cv.skillsList.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Core Skills & Technologies
          </h3>
          <div className="text-xs text-slate-700">{cv.skillsList.join(' · ')}</div>
        </section>
      )}

      {/* Certifications */}
      {certificationDetails.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Certifications
          </h3>
          <ul className="space-y-1">
            {certificationDetails.map((entry, index) => (
              <li key={`${entry.name}-${index}`} className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{entry.name}</span>
                {entry.issuer ? ` — ${entry.issuer}` : ''}
                {entry.description && (
                  <p className="text-[11px] leading-relaxed text-slate-600">{entry.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Courses */}
      {courses.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
            Completed Courses
          </h3>
          <ul className="space-y-1">
            {courses.map((course) => (
              <li key={course.id} className="text-xs text-slate-700">
                <span className="font-semibold text-slate-900">{course.title}</span>
                {course.provider ? ` — ${course.provider}` : ''}
                {course.description && (
                  <p className="text-[11px] leading-relaxed text-slate-600">{course.description}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
