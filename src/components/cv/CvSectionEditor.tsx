/**
 * The CV studio's document editor.
 *
 * The studio used to offer five text boxes: name, headline, email, location
 * and a summary. Everything else on the page — the experience, the
 * education, the projects, the volunteering, the courses, the certificates —
 * was visible on the preview but could not be edited, and none of it could
 * be written for the user even though the platform already held the facts.
 *
 * This component is the editor for the whole document. Every section the
 * preview shows has an editor here, and every long-form section has the
 * assistant beside it.
 *
 * Two rules shape the code:
 *
 *   - nothing is invented. A section the user has not supplied says so
 *     instead of showing an empty box that looks like an omission;
 *   - nothing is overwritten. The assistant proposes; the user accepts.
 */

import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  FolderGit2,
  GraduationCap,
  HeartHandshake,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { AiAssist } from './AiAssist';
import { useCareer } from '../../context/CareerContext';
import {
  deleteProfileLink,
  fetchProfileLinks,
  patchProfileLink,
  postProfileLink,
} from '../../lib/coreApi';
import { CV_LINK_KINDS, cvLinkLabel } from '../../../shared/cvDocument';
import type { CVLink, CVProfile } from '../../types/career';

interface CvSectionEditorProps {
  /** The document being edited. */
  cv: CVProfile;
  /** Applies a change to the document. */
  update: (updates: Partial<CVProfile>) => void;
  /** The role the CV is aimed at. */
  targetRoleTitle: string;
  /** The candidate's own records, so the editor can offer what they own. */
  source: {
    experiences: Array<{ id: string; role: string; company: string }>;
    projects: Array<{ id: string; title: string }>;
    volunteering: Array<{ id: string; organization: string; role: string }>;
    certifications: Array<{ id: string; name: string }>;
    courses: Array<{ id: string; title: string }>;
  };
  /**
   * The skills the candidate has actually rated.
   *
   * The skills line is written from these and from nothing else, so the
   * assistant cannot put a skill on the CV that the candidate does not have.
   */
  ratedSkills: string[];
}

const LINK_INPUT_CLASS =
  'w-full px-3 py-1.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]';

const LABEL_CLASS =
  'block text-[11px] font-semibold text-[var(--text-secondary)] mb-1';

export const CvSectionEditor: React.FC<CvSectionEditorProps> = ({
  cv,
  update,
  targetRoleTitle,
  source,
  ratedSkills,
}) => {
  const { t } = useCareer();
  const links = cv.links ?? [];

  const updateLink = (id: string, changes: Partial<CVLink>) => {
    update({
      links: links.map((link) => (link.id === id ? { ...link, ...changes } : link)),
    });
  };

  const moveLink = (id: string, direction: -1 | 1) => {
    const index = links.findIndex((link) => link.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= links.length) return;
    const next = [...links];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    update({ links: next });
  };

  return (
    <div className="space-y-4">
      {/* ---- Contact & Header ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Contact & Header')}
        </h3>
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLASS}>{t('Full Name')}</label>
            <input
              type="text"
              value={cv.fullName}
              onChange={(e) => update({ fullName: e.target.value })}
              className={LINK_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Target Role Headline')}</label>
            <input
              type="text"
              value={cv.title}
              onChange={(e) => update({ title: e.target.value })}
              className={LINK_INPUT_CLASS}
            />
            <div className="mt-2">
              <AiAssist
                field="headline"
                existingText={cv.title}
                targetRoleTitle={targetRoleTitle}
                onApply={(text) => update({ title: text })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLASS}>{t('Email')}</label>
              <input
                type="email"
                value={cv.email}
                onChange={(e) => update({ email: e.target.value })}
                className={LINK_INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>{t('Phone')}</label>
              <input
                type="tel"
                value={cv.phone}
                onChange={(e) => update({ phone: e.target.value })}
                className={LINK_INPUT_CLASS}
              />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{t('Location')}</label>
            <input
              type="text"
              value={cv.location}
              onChange={(e) => update({ location: e.target.value })}
              className={LINK_INPUT_CLASS}
            />
          </div>
        </div>
      </section>

      {/* ---- Professional Links ---- */}
      <ProfessionalLinksEditor
        links={links}
        update={update}
        updateLink={updateLink}
        moveLink={moveLink}
      />

      {/* ---- Executive Summary ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)]">{t('Executive Summary')}</h3>
        <textarea
          rows={4}
          value={cv.summary}
          onChange={(e) => update({ summary: e.target.value })}
          className="w-full p-3 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] leading-relaxed"
        />
        <AiAssist
          field="summary"
          existingText={cv.summary}
          targetRoleTitle={targetRoleTitle}
          onApply={(text) => update({ summary: text })}
        />
        <div className="text-[11px] text-[var(--text-muted)]">
          {t('Tip: Quantify your results using the X-Y-Z format: "Accomplished [X], as measured by [Y], by doing [Z]".')}
        </div>
      </section>

      {/* ---- Experience ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Briefcase className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Work Experience')}
        </h3>
        {cv.experiences.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No work experience yet.')}</p>
        ) : (
          cv.experiences.map((exp) => (
            <div
              key={exp.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {exp.role} {exp.company ? `— ${exp.company}` : ''}
              </div>
              {exp.period && (
                <div className="text-[11px] text-[var(--text-muted)]">{exp.period}</div>
              )}
              <BulletsEditor
                bullets={exp.bullets}
                onChange={(bullets) =>
                  update({
                    experiences: cv.experiences.map((entry) =>
                      entry.id === exp.id ? { ...entry, bullets } : entry
                    ),
                  })
                }
                emptyLabel={t('No bullet points yet.')}
              />
              <AiAssist
                field="experience"
                sourceKind="experience"
                sourceId={exp.id}
                existingText={exp.bullets.join('\n')}
                targetRoleTitle={targetRoleTitle}
                onApply={(_text, bullets) =>
                  update({
                    experiences: cv.experiences.map((entry) =>
                      entry.id === exp.id ? { ...entry, bullets } : entry
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>

      {/* ---- Education ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <GraduationCap className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Education')}
        </h3>
        {cv.education.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No education yet.')}</p>
        ) : (
          cv.education.map((edu) => (
            <div
              key={edu.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {[edu.degree, /[a-z]/i.test(edu.field ?? '') ? edu.field : '']
                  .filter(Boolean)
                  .join(' in ') || edu.institution}
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {edu.institution}
                {edu.period ? ` · ${edu.period}` : ''}
              </div>
              <div>
                <label className={LABEL_CLASS}>{t('Description')}</label>
                <textarea
                  rows={2}
                  value={edu.description ?? ''}
                  onChange={(e) =>
                    update({
                      education: cv.education.map((entry) =>
                        entry.id === edu.id ? { ...entry, description: e.target.value } : entry
                      ),
                    })
                  }
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] leading-relaxed"
                />
              </div>
              <AiAssist
                field="education"
                sourceKind="education"
                sourceId={edu.id}
                existingText={edu.description ?? ''}
                targetRoleTitle={targetRoleTitle}
                onApply={(text) =>
                  update({
                    education: cv.education.map((entry) =>
                      entry.id === edu.id ? { ...entry, description: text } : entry
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>

      {/* ---- Skills ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Core Skills & Technologies')}
        </h3>
        {cv.skillsList.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No skills yet.')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {cv.skillsList.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
              >
                {skill}
                <button
                  type="button"
                  onClick={() =>
                    update({ skillsList: cv.skillsList.filter((entry) => entry !== skill) })
                  }
                  className="text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
                  aria-label={t('Remove')}
                >
                  <Trash2 className="h-3 w-3 shrink-0" />
                </button>
              </span>
            ))}
          </div>
        )}
        <AiAssist
          field="skills"
          existingText={cv.skillsList.join(', ')}
          context={
            ratedSkills.length > 0
              ? `The skills the candidate has rated: ${ratedSkills.join(', ')}`
              : undefined
          }
          targetRoleTitle={targetRoleTitle}
          onApply={(text) =>
            update({
              skillsList: text
                .split(/[,\n]/)
                .map((entry) => entry.trim())
                .filter(Boolean),
            })
          }
        />
      </section>

      {/* ---- Projects ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Projects')}
        </h3>
        {cv.projects.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No projects yet.')}</p>
        ) : (
          cv.projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">{project.title}</div>
              {project.technologies.length > 0 && (
                <div className="text-[11px] text-[var(--text-muted)]">
                  {project.technologies.join(' · ')}
                </div>
              )}
              <BulletsEditor
                bullets={project.bullets}
                onChange={(bullets) =>
                  update({
                    projects: cv.projects.map((entry) =>
                      entry.id === project.id ? { ...entry, bullets } : entry
                    ),
                  })
                }
                emptyLabel={t('No bullet points yet.')}
              />
              <AiAssist
                field="project"
                sourceKind="project"
                sourceId={project.id}
                existingText={project.bullets.join('\n')}
                targetRoleTitle={targetRoleTitle}
                onApply={(_text, bullets) =>
                  update({
                    projects: cv.projects.map((entry) =>
                      entry.id === project.id ? { ...entry, bullets } : entry
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>

      {/* ---- Volunteering ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Volunteering')}
        </h3>
        {(cv.volunteering ?? []).length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No volunteering yet.')}</p>
        ) : (
          (cv.volunteering ?? []).map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">
                {entry.role} {entry.organization ? `— ${entry.organization}` : ''}
              </div>
              {entry.period && (
                <div className="text-[11px] text-[var(--text-muted)]">{entry.period}</div>
              )}
              <BulletsEditor
                bullets={entry.bullets}
                onChange={(bullets) =>
                  update({
                    volunteering: (cv.volunteering ?? []).map((item) =>
                      item.id === entry.id ? { ...item, bullets } : item
                    ),
                  })
                }
                emptyLabel={t('No bullet points yet.')}
              />
              <AiAssist
                field="volunteering"
                sourceKind="volunteering"
                sourceId={entry.id}
                existingText={entry.bullets.join('\n')}
                targetRoleTitle={targetRoleTitle}
                onApply={(_text, bullets) =>
                  update({
                    volunteering: (cv.volunteering ?? []).map((item) =>
                      item.id === entry.id ? { ...item, bullets } : item
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>

      {/* ---- Certifications ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Certifications')}
        </h3>
        {(cv.certificationDetails ?? []).length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No certifications yet.')}</p>
        ) : (
          (cv.certificationDetails ?? []).map((cert, index) => (
            <div
              key={`${cert.name}-${index}`}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">{cert.name}</div>
              {cert.issuer && (
                <div className="text-[11px] text-[var(--text-muted)]">{cert.issuer}</div>
              )}
              <div>
                <label className={LABEL_CLASS}>{t('Description')}</label>
                <textarea
                  rows={2}
                  value={cert.description ?? ''}
                  onChange={(e) =>
                    update({
                      certificationDetails: (cv.certificationDetails ?? []).map((entry, i) =>
                        i === index ? { ...entry, description: e.target.value } : entry
                      ),
                    })
                  }
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] leading-relaxed"
                />
              </div>
              <AiAssist
                field="certification"
                sourceKind="certification"
                sourceId={source.certifications[index]?.id}
                existingText={cert.description ?? ''}
                targetRoleTitle={targetRoleTitle}
                onApply={(text) =>
                  update({
                    certificationDetails: (cv.certificationDetails ?? []).map((entry, i) =>
                      i === index ? { ...entry, description: text } : entry
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>

      {/* ---- Courses ---- */}
      <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Completed courses')}
        </h3>
        {(cv.courses ?? []).length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">{t('No completed courses yet.')}</p>
        ) : (
          (cv.courses ?? []).map((course) => (
            <div
              key={course.id}
              className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3 space-y-2"
            >
              <div className="text-xs font-bold text-[var(--text-primary)]">{course.title}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{course.provider}</div>
              <div>
                <label className={LABEL_CLASS}>{t('Description')}</label>
                <textarea
                  rows={2}
                  value={course.description}
                  onChange={(e) =>
                    update({
                      courses: (cv.courses ?? []).map((entry) =>
                        entry.id === course.id ? { ...entry, description: e.target.value } : entry
                      ),
                    })
                  }
                  className="w-full p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-primary)] leading-relaxed"
                />
              </div>
              <AiAssist
                field="course"
                sourceKind="course"
                sourceId={course.id}
                existingText={course.description}
                targetRoleTitle={targetRoleTitle}
                onApply={(text) =>
                  update({
                    courses: (cv.courses ?? []).map((entry) =>
                      entry.id === course.id ? { ...entry, description: text } : entry
                    ),
                  })
                }
              />
            </div>
          ))
        )}
      </section>
    </div>
  );
};

/**
 * The bullet list editor.
 *
 * Bullets are edited one line at a time, because a CV bullet is a line and
 * an editor that joins them into a paragraph makes them hard to change.
 */
const BulletsEditor: React.FC<{
  bullets: string[];
  onChange: (bullets: string[]) => void;
  emptyLabel: string;
}> = ({ bullets, onChange, emptyLabel }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState('');

  const addBullet = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...bullets, value]);
    setDraft('');
  };

  return (
    <div className="space-y-1.5">
      {bullets.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {bullets.map((bullet, index) => (
            <li key={`${index}-${bullet}`} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--text-muted)]" />
              <input
                type="text"
                value={bullet}
                onChange={(e) =>
                  onChange(bullets.map((entry, i) => (i === index ? e.target.value : entry)))
                }
                className="flex-1 min-w-0 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[11px] leading-relaxed text-[var(--text-primary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)] focus:bg-[var(--surface-secondary)]"
              />
              <button
                type="button"
                onClick={() => onChange(bullets.filter((_, i) => i !== index))}
                className="mt-0.5 shrink-0 text-[var(--text-muted)] hover:text-[var(--color-danger)] transition-colors"
                aria-label={t('Remove')}
              >
                <Trash2 className="h-3 w-3 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBullet();
            }
          }}
          placeholder={t('Add a bullet point')}
          className="flex-1 min-w-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
        />
        <button
          type="button"
          onClick={addBullet}
          disabled={!draft.trim()}
          className="shrink-0 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          aria-label={t('Add')}
        >
          <Plus className="h-3 w-3 shrink-0" />
        </button>
      </div>
    </div>
  );
};

/**
 * The professional links editor.
 *
 * A link belongs to the profile, so adding, editing and removing one writes
 * back to the profile. The order and the on/off switch belong to this CV:
 * the same person may show a GitHub link on one CV and not on another.
 */
const ProfessionalLinksEditor: React.FC<{
  links: CVLink[];
  update: (updates: Partial<CVProfile>) => void;
  updateLink: (id: string, changes: Partial<CVLink>) => void;
  moveLink: (id: string, direction: -1 | 1) => void;
}> = ({ links, update, updateLink, moveLink }) => {
  const { t } = useCareer();
  const [isAdding, setIsAdding] = useState(false);
  const [newKind, setNewKind] = useState('linkedin');
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleAdd = async () => {
    const url = newUrl.trim();
    if (!url) return;
    setIsBusy(true);
    setError(null);
    try {
      const created = await postProfileLink({ kind: newKind, url });
      update({
        links: [
          ...links,
          {
            id: created.id,
            kind: created.kind,
            label: cvLinkLabel(created.kind, created.label),
            url: created.url,
            enabled: true,
          },
        ],
      });
      setNewUrl('');
      setIsAdding(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('That link could not be added.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleEditUrl = async (link: CVLink, url: string) => {
    const previous = link.url;
    updateLink(link.id, { url });
    try {
      await patchProfileLink(link.id, { url });
    } catch (requestError) {
      // The URL is put back the way it was: a link that shows a URL the
      // profile does not hold would be a link that goes nowhere.
      updateLink(link.id, { url: previous });
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('That link could not be updated.')
      );
    }
  };

  const handleRemove = async (link: CVLink) => {
    const previous = links;
    update({ links: links.filter((entry) => entry.id !== link.id) });
    try {
      await deleteProfileLink(link.id);
    } catch (requestError) {
      update({ links: previous });
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('That link could not be removed.')
      );
    }
  };

  const handleRefresh = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const fromProfile = await fetchProfileLinks();
      update({
        links: fromProfile.map((link) => {
          const existing = links.find((entry) => entry.id === link.id);
          return {
            id: link.id,
            kind: link.kind,
            label: cvLinkLabel(link.kind, link.label),
            url: link.url,
            enabled: existing?.enabled ?? true,
          };
        }),
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Your links could not be loaded.')
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Professional Links')}
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isBusy}
            className="rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            {t('Refresh')}
          </button>
          <button
            type="button"
            onClick={() => setIsAdding((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <Plus className="h-3 w-3 shrink-0" />
            <span>{t('Add link')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 px-2.5 py-2 text-[11px] text-[var(--text-secondary)]"
        >
          {error}
        </div>
      )}

      {isAdding && (
        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value)}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
            >
              {CV_LINK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {cvLinkLabel(kind)}
                </option>
              ))}
            </select>
            <input
              type="url"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder="https://"
              className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={isBusy || !newUrl.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-40"
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>{t('Add')}</span>
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {t('Only http(s) links are accepted.')}
          </p>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">{t('No links yet.')}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <li
              key={link.id}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-2.5 py-2"
            >
              <input
                type="text"
                value={link.label}
                onChange={(e) => updateLink(link.id, { label: e.target.value })}
                className="w-24 shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)]"
              />
              <input
                type="url"
                value={link.url}
                onChange={(e) => updateLink(link.id, { url: e.target.value })}
                onBlur={(e) => {
                  if (e.target.value !== link.url) void handleEditUrl(link, e.target.value);
                }}
                className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)]"
              />
              <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={link.enabled}
                  onChange={(e) => updateLink(link.id, { enabled: e.target.checked })}
                  className="h-3 w-3 shrink-0 accent-[var(--accent-primary)]"
                />
                {t('Show')}
              </label>
              <button
                type="button"
                onClick={() => moveLink(link.id, -1)}
                disabled={index === 0}
                className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                aria-label={t('Move up')}
              >
                <span aria-hidden="true" className="text-[11px] leading-none">
                  ↑
                </span>
              </button>
              <button
                type="button"
                onClick={() => moveLink(link.id, 1)}
                disabled={index === links.length - 1}
                className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
                aria-label={t('Move down')}
              >
                <span aria-hidden="true" className="text-[11px] leading-none">
                  ↓
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleRemove(link)}
                className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger)]"
                aria-label={t('Remove')}
              >
                <Trash2 className="h-3 w-3 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
