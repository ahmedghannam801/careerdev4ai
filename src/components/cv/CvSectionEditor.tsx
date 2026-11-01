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

import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Check,
  FolderGit2,
  GraduationCap,
  HeartHandshake,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Target,
  Trash2,
  Wrench,
} from 'lucide-react';
import { AiAssist } from './AiAssist';
import { HeadlineSuggestions } from './HeadlineSuggestions';
import { useCareer } from '../../context/CareerContext';
import { TARGET_ROLES } from '../../data/rolesData';
import {
  deleteProfileLink,
  patchProfileLink,
  postProfileLink,
} from '../../lib/coreApi';
import { CV_LINK_KINDS, cvLinkLabel } from '../../../shared/cvDocument';
import {
  diffProfileLink,
  hasProfileLinkChanges,
  profileLinkDraft,
  validateProfileLinkUrl,
  type ProfileLinkDraft,
} from '../../../shared/profileLinks';
import type { CVLink, CVProfile, TargetRole } from '../../types/career';

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
              <HeadlineSuggestions
                value={cv.title}
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

      {/* ---- Target Role Tracks ---- */}
      <TargetRoleTracks />

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
 * The target role tracks.
 *
 * A CV can be aimed at more than one role, and each track is a real, separate
 * career target — a Data Analyst and an HR Specialist are not a single
 * combined title. The primary target drives the roadmap and the ATS audit;
 * the additional tracks are kept in `saved_roles` and feed the headline
 * suggestions, so the assistant only proposes a combined headline when the
 * tracks are genuinely compatible.
 */
const TargetRoleTracks: React.FC = () => {
  const {
    t,
    targetRole,
    savedRoles,
    saveRole,
    removeSavedRole,
    setPrimaryTargetRole,
  } = useCareer();
  const [pendingId, setPendingId] = useState('');
  const [busyRoleId, setBusyRoleId] = useState<string | null>(null);

  const additional = savedRoles.filter((role) => role.id !== targetRole.id);
  const available = TARGET_ROLES.filter(
    (role) =>
      role.id !== targetRole.id && !additional.some((entry) => entry.id === role.id)
  );

  const handleAdd = () => {
    const role = TARGET_ROLES.find((entry) => entry.id === pendingId);
    if (!role) return;
    saveRole(role);
    setPendingId('');
  };

  const handleMakePrimary = async (role: TargetRole) => {
    if (busyRoleId) return;
    setBusyRoleId(role.id);
    const previousPrimary = targetRole;
    try {
      const changed = await setPrimaryTargetRole(role.id);
      // Keep the old primary as an additional track so promoting a role never
      // silently drops a target the candidate had added.
      if (changed && previousPrimary.id !== role.id) {
        saveRole(previousPrimary);
      }
    } finally {
      setBusyRoleId(null);
    }
  };

  return (
    <section className="p-5 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-3">
      <div>
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          {t('Target Role Tracks')}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">
          {t(
            'Add every role this CV is aimed at. Each track stays independent; the primary track drives your roadmap and ATS audit.'
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
          <Star className="h-3 w-3 shrink-0 text-[var(--accent-primary)]" />
          {targetRole.title}
          <span className="rounded-full bg-[var(--accent-primary)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-on-primary)]">
            {t('Primary')}
          </span>
        </span>

        {additional.map((role) => (
          <span
            key={role.id}
            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)]"
          >
            {role.title}
            <button
              type="button"
              onClick={() => void handleMakePrimary(role)}
              disabled={busyRoleId !== null}
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)] disabled:opacity-40"
              aria-label={`${t('Make primary')}: ${role.title}`}
              title={t('Make primary')}
            >
              {busyRoleId === role.id ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Star className="h-3 w-3 shrink-0" />
              )}
            </button>
            <button
              type="button"
              onClick={() => removeSavedRole(role.id)}
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger)]"
              aria-label={`${t('Remove')}: ${role.title}`}
            >
              <Trash2 className="h-3 w-3 shrink-0" />
            </button>
          </span>
        ))}

        {additional.length === 0 && (
          <span className="self-center text-[11px] text-[var(--text-muted)]">
            {t('No additional tracks yet.')}
          </span>
        )}
      </div>

      {available.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={pendingId}
            onChange={(event) => setPendingId(event.target.value)}
            aria-label={t('Add a target role track')}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1.5 text-[11px] text-[var(--text-primary)]"
          >
            <option value="">{t('Add another target role…')}</option>
            {available.map((role) => (
              <option key={role.id} value={role.id}>
                {role.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!pendingId}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <Plus className="h-3 w-3 shrink-0" />
            {t('Add')}
          </button>
        </div>
      )}
    </section>
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
 *
 * Each row keeps a local draft. The URL is written to the profile when the
 * field is saved or loses focus, not on every keystroke. That distinction is
 * what makes an edit persist: the old code wrote the keystroke into the CV
 * first and then compared the input against the value it had just written, so
 * the comparison was always false.
 */
const ProfessionalLinkRow: React.FC<{
  link: CVLink;
  index: number;
  total: number;
  updateLink: (id: string, changes: Partial<CVLink>) => void;
  moveLink: (id: string, direction: -1 | 1) => void;
  onRemove: (link: CVLink) => void;
}> = ({ link, index, total, updateLink, moveLink, onRemove }) => {
  const { t, refreshProfileLinks } = useCareer();
  const [draft, setDraft] = useState<ProfileLinkDraft>(() => profileLinkDraft(link));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  // A change from the profile (a refresh, or this row's own save) resets the
  // draft to the stored values. A change the candidate is still typing does
  // not touch the parent, so this effect does not run on every keystroke.
  useEffect(() => {
    setDraft(profileLinkDraft(link));
    setStatus('idle');
    setError(null);
  }, [link.id, link.label, link.url]);

  const pending = diffProfileLink({ label: link.label, url: link.url }, draft);
  const dirty = hasProfileLinkChanges(pending) || pending.urlError !== null;

  const save = async () => {
    if (status === 'saving') return;
    const diff = diffProfileLink({ label: link.label, url: link.url }, draft);
    if (diff.urlError) {
      setStatus('error');
      setError(
        diff.urlError === 'empty'
          ? t('Enter a URL for the link.')
          : t('Enter a valid http(s) URL.')
      );
      return;
    }
    if (!hasProfileLinkChanges(diff)) {
      setStatus('idle');
      setError(null);
      return;
    }

    setStatus('saving');
    setError(null);
    try {
      const updated = await patchProfileLink(link.id, diff.patch);
      updateLink(link.id, {
        label: cvLinkLabel(updated.kind, updated.label),
        url: updated.url,
      });
      // The profile is the source of truth for the URL and the label, so the
      // document projection must be given the saved row.
      await refreshProfileLinks();
      setStatus('saved');
    } catch (requestError) {
      setStatus('error');
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('That link could not be updated.')
      );
    }
  };

  const reset = () => {
    setDraft(profileLinkDraft(link));
    setStatus('idle');
    setError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void save();
    } else if (event.key === 'Escape') {
      reset();
    }
  };

  return (
    <li className="space-y-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft.label}
          onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
          onBlur={() => void save()}
          onKeyDown={handleKeyDown}
          placeholder={cvLinkLabel(link.kind)}
          aria-label={t('Link label')}
          className="w-24 shrink-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] font-semibold text-[var(--text-primary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)]"
        />
        <input
          type="url"
          value={draft.url}
          onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
          onBlur={() => void save()}
          onKeyDown={handleKeyDown}
          placeholder="https://"
          aria-label={t('Link URL')}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[11px] text-[var(--text-secondary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-subtle)]"
        />
        <label className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={link.enabled}
            onChange={(event) => updateLink(link.id, { enabled: event.target.checked })}
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
          disabled={index === total - 1}
          className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
          aria-label={t('Move down')}
        >
          <span aria-hidden="true" className="text-[11px] leading-none">
            ↓
          </span>
        </button>
        <button
          type="button"
          onClick={() => onRemove(link)}
          className="shrink-0 text-[var(--text-muted)] transition-colors hover:text-[var(--color-danger)]"
          aria-label={t('Remove')}
        >
          <Trash2 className="h-3 w-3 shrink-0" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-[10px] leading-relaxed">
          {status === 'saving' && (
            <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              {t('Saving…')}
            </span>
          )}
          {status === 'saved' && (
            <span className="inline-flex items-center gap-1 text-[var(--color-success-strong)]">
              <Check className="h-3 w-3 shrink-0" />
              {t('Saved')}
            </span>
          )}
          {status === 'error' && (
            <span role="alert" className="text-[var(--color-warning)]">
              {error}
            </span>
          )}
          {status === 'idle' && dirty && (
            <span className="text-[var(--text-muted)]">{t('Unsaved changes')}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || status === 'saving'}
          className="shrink-0 rounded-md border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-30"
        >
          {t('Save')}
        </button>
      </div>
    </li>
  );
};

const ProfessionalLinksEditor: React.FC<{
  links: CVLink[];
  update: (updates: Partial<CVProfile>) => void;
  updateLink: (id: string, changes: Partial<CVLink>) => void;
  moveLink: (id: string, direction: -1 | 1) => void;
}> = ({ links, update, updateLink, moveLink }) => {
  const { t, refreshProfileLinks } = useCareer();
  const [isAdding, setIsAdding] = useState(false);
  const [newKind, setNewKind] = useState('linkedin');
  const [newLabel, setNewLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handleAdd = async () => {
    const validation = validateProfileLinkUrl(newUrl);
    if (!validation.valid) {
      setError(
        validation.error === 'empty'
          ? t('Enter a URL for the link.')
          : t('Enter a valid http(s) URL.')
      );
      return;
    }

    setIsBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await postProfileLink({
        kind: newKind,
        label: newLabel.trim() || undefined,
        url: validation.url,
      });
      await refreshProfileLinks();
      update({
        links: [
          ...links.filter((entry) => entry.id !== created.id),
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
      setNewLabel('');
      setIsAdding(false);
      setSuccess(t('Link added.'));
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

  const handleRemove = async (link: CVLink) => {
    const previous = links;
    setError(null);
    setSuccess(null);
    update({ links: links.filter((entry) => entry.id !== link.id) });
    try {
      await deleteProfileLink(link.id);
      await refreshProfileLinks();
      setSuccess(t('Link removed.'));
    } catch (requestError) {
      // A link that is gone from the CV but still in the profile would come
      // back on the next projection, so the removal is rolled back.
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
    setSuccess(null);
    try {
      const fromProfile = await refreshProfileLinks();
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
      setSuccess(t('Links refreshed.'));
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
            onClick={() => {
              setIsAdding((value) => !value);
              setError(null);
              setSuccess(null);
            }}
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

      {success && (
        <p role="status" className="text-[11px] text-[var(--color-success-strong)]">
          {success}
        </p>
      )}

      {isAdding && (
        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newKind}
              onChange={(event) => setNewKind(event.target.value)}
              aria-label={t('Link type')}
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
            >
              {CV_LINK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {cvLinkLabel(kind)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder={t('Label (optional)')}
              aria-label={t('Link label')}
              className="w-32 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
            />
            <input
              type="url"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
              placeholder="https://"
              aria-label={t('Link URL')}
              className="min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2 py-1 text-[11px] text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={isBusy || !newUrl.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--accent-secondary)] disabled:opacity-40"
            >
              {isBusy ? (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 shrink-0" />
              )}
              <span>{t('Add')}</span>
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            {t('Only http(s) links are accepted. A bare domain such as linkedin.com/in/name is accepted.')}
          </p>
        </div>
      )}

      {links.length === 0 ? (
        <p className="text-[11px] text-[var(--text-muted)]">{t('No links yet.')}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link, index) => (
            <ProfessionalLinkRow
              key={link.id}
              link={link}
              index={index}
              total={links.length}
              updateLink={updateLink}
              moveLink={moveLink}
              onRemove={(entry) => void handleRemove(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
