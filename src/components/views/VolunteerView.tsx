import React, { useMemo, useState } from 'react';
import {
  Plus,
  X,
  HeartHandshake,
  MapPin,
  CalendarDays,
  Trophy,
  Sparkles,
  Link2,
  Trash2,
  Pencil,
  Check,
} from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { VOLUNTEER_TABS } from '../../lib/routing';
import { useRouteParam } from '../../lib/useRouteParams';
import { VolunteerExperience } from '../../types/career';
import { Reveal, Stagger, StaggerItem } from '../motion/Motion';
import { VolunteerOpportunities } from '../volunteer/VolunteerOpportunities';

/**
 * The Volunteer page.
 *
 * The page has two halves. The opportunities hub shows the real
 * volunteering programmes a user can apply to, ranked for them. The record
 * below lets them capture a stint they have already done.
 *
 * A volunteer stint is its own domain: the organisation, the role taken on,
 * how long it lasted, the responsibilities, the achievements and the skills
 * it gave the user. It is deliberately NOT an employment entry, so it never
 * appears in the CV timeline.
 *
 * A stint can point at the user's EXISTING projects, which is what turns a
 * volunteering record into evidence: the project shows the work, the
 * volunteering gives it meaning.
 */

interface VolunteerViewProps {
  onNavigate?: (view: string) => void;
}

/** Splits a comma or newline separated field into a clean list. */
function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPeriod(entry: VolunteerExperience, t: (key: string) => string): string {
  if (!entry.startDate) return t('Dates not recorded');
  const start = entry.startDate;
  if (entry.isCurrent || !entry.endDate) return `${start} — ${t('Present')}`;
  return `${start} — ${entry.endDate}`;
}

interface DraftState {
  id: string | null;
  organization: string;
  role: string;
  location: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description: string;
  responsibilities: string;
  achievements: string;
  skills: string;
  projectIds: string[];
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  organization: '',
  role: '',
  location: '',
  startDate: '',
  endDate: '',
  isCurrent: false,
  description: '',
  responsibilities: '',
  achievements: '',
  skills: '',
  projectIds: [],
};

export const VolunteerView: React.FC<VolunteerViewProps> = ({ onNavigate }) => {
  const { volunteerExperiences, projects, addVolunteerExperience, updateVolunteerExperience, deleteVolunteerExperience, t } =
    useCareer();

  const [tab, setTab] = useRouteParam<'opportunities' | 'record'>('tab', VOLUNTEER_TABS, 'opportunities');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const projectTitle = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) map.set(project.id, project.title);
    return map;
  }, [projects]);

  const totalSkills = useMemo(() => {
    const names = new Set<string>();
    for (const entry of volunteerExperiences) {
      for (const skill of entry.skills) names.add(skill);
    }
    return names.size;
  }, [volunteerExperiences]);

  const openAdd = () => {
    setDraft({ ...EMPTY_DRAFT });
    setSubmitError(null);
    setShowProjectPicker(false);
  };

  const openEdit = (entry: VolunteerExperience) => {
    setDraft({
      id: entry.id,
      organization: entry.organization,
      role: entry.role,
      location: entry.location,
      startDate: entry.startDate,
      endDate: entry.endDate,
      isCurrent: entry.isCurrent,
      description: entry.description,
      responsibilities: entry.responsibilities.join('\n'),
      achievements: entry.achievements.join('\n'),
      skills: entry.skills.join('\n'),
      projectIds: entry.projectIds,
    });
    setSubmitError(null);
    setShowProjectPicker(true);
  };

  const close = () => {
    setDraft(null);
    setSubmitError(null);
    setShowProjectPicker(false);
  };

  const toggleProject = (projectId: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const linked = prev.projectIds.includes(projectId);
      return {
        ...prev,
        projectIds: linked
          ? prev.projectIds.filter((id) => id !== projectId)
          : [...prev.projectIds, projectId],
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || isSubmitting) return;

    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        organization: draft.organization.trim(),
        role: draft.role.trim(),
        location: draft.location.trim(),
        startDate: draft.startDate,
        endDate: draft.isCurrent ? '' : draft.endDate,
        isCurrent: draft.isCurrent,
        description: draft.description.trim(),
        responsibilities: splitList(draft.responsibilities),
        achievements: splitList(draft.achievements),
        skills: splitList(draft.skills),
        projectIds: draft.projectIds,
      };

      if (!payload.organization || !payload.role) {
        setSubmitError(t('An organisation and a role are required.'));
        return;
      }

      if (draft.id) {
        await updateVolunteerExperience(draft.id, payload);
      } else {
        await addVolunteerExperience(payload);
      }
      close();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : t('The volunteering record could not be saved. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entry: VolunteerExperience) => {
    try {
      await deleteVolunteerExperience(entry.id);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('The volunteering record could not be removed.')
      );
    }
  };

  return (
    <Reveal className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[var(--border-subtle)]">
        <div>
          <div className="text-xs text-[var(--text-secondary)]">{t('COMMUNITY IMPACT &amp; VOLUNTEERING')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mt-0.5 flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-[var(--color-primary-text)]" />
            {t('Volunteer Experience')}
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1.5 max-w-2xl">
            {t('Record the organisations you volunteered for, what you were responsible for and the skills it gave you — and link the projects that prove it.')}
          </p>
        </div>

        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('Add Volunteering')}</span>
        </button>
      </div>

      {/* The two halves of the page: what you can apply to, and what you
          have already done. */}
      <div className="flex items-center gap-1.5 border-b border-[var(--border-subtle)] pb-2">
        <button
          type="button"
          onClick={() => setTab('opportunities')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'opportunities'
              ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('Opportunities')}
        </button>
        <button
          type="button"
          onClick={() => setTab('record')}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'record'
              ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          {t('My volunteering')} ({volunteerExperiences.length})
        </button>
      </div>

      {tab === 'opportunities' ? (
        <VolunteerOpportunities onRecordStint={() => { setTab('record'); openAdd(); }} />
      ) : (
        <>
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t('Volunteering roles'), value: volunteerExperiences.length },
          { label: t('Organisations'), value: new Set(volunteerExperiences.map((e) => e.organization)).size },
          { label: t('Skills gained'), value: totalSkills },
          {
            label: t('Linked projects'),
            value: new Set(volunteerExperiences.flatMap((e) => e.projectIds)).size,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-4 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)]"
          >
            <div className="text-2xl font-bold font-mono text-[var(--color-primary-text)]">
              {stat.value}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      {volunteerExperiences.length === 0 ? (
        <div className="p-10 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30 text-center space-y-3">
          <HeartHandshake className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            {t('No volunteering recorded yet')}
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            {t('Add an organisation you volunteered for. Link your projects to it so the work you did is visible as evidence.')}
          </p>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{t('Add Volunteering')}</span>
          </button>
        </div>
      ) : (
        <Stagger inView gap={0.06} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {volunteerExperiences.map((entry) => (
            <StaggerItem
              key={entry.id}
              className="p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-4 flex flex-col shadow-xs hover:border-[var(--border-strong)] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* Head */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[var(--text-primary)]">{entry.role}</h3>
                  <div className="text-xs font-medium text-[var(--color-primary-text)] mt-0.5">
                    {entry.organization}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {formatPeriod(entry, t)}
                    </span>
                    {entry.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {entry.location}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(entry)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--color-primary-text)] hover:bg-[var(--surface-secondary)]"
                    title={t('Edit')}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(entry)}
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--surface-secondary)]"
                    title={t('Remove')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {entry.description && (
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {entry.description}
                </p>
              )}

              {entry.responsibilities.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
                    {t('Responsibilities')}
                  </div>
                  <ul className="space-y-1">
                    {entry.responsibilities.map((item, i) => (
                      <li
                        key={i}
                        className="text-xs text-[var(--text-secondary)] flex items-start gap-2"
                      >
                        <span className="text-[var(--color-primary-text)] font-bold mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.achievements.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1.5">
                    <Trophy className="w-3 h-3" />
                    {t('Achievements')}
                  </div>
                  <ul className="space-y-1">
                    {entry.achievements.map((item, i) => (
                      <li
                        key={i}
                        className="text-xs text-[var(--text-secondary)] flex items-start gap-2"
                      >
                        <span className="text-[var(--color-success-strong)] font-bold mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {entry.skills.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    {t('Skills gained')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.skills.map((skill) => (
                      <span
                        key={skill}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-primary)]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {entry.projectIds.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold flex items-center gap-1.5">
                    <Link2 className="w-3 h-3" />
                    {t('Evidenced by')}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {entry.projectIds.map((projectId) => (
                      <button
                        key={projectId}
                        onClick={() => onNavigate?.('projects')}
                        className="text-[11px] px-2 py-0.5 rounded bg-[var(--accent-surface)] text-[var(--color-primary-text)] hover:underline"
                        title={t('Open the project')}
                      >
                        {projectTitle.get(projectId) ?? t('Project')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      )}
        </>
      )}

      {/* Add / edit */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl my-8 p-6 rounded-2xl bg-[var(--surface-main)] border border-[var(--border-subtle)] space-y-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                {draft.id ? t('Edit volunteering') : t('Add volunteering')}
              </h2>
              <button
                onClick={close}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-secondary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('Organisation *')}
                  </span>
                  <input
                    type="text"
                    value={draft.organization}
                    onChange={(e) => setDraft({ ...draft, organization: e.target.value })}
                    placeholder={t('e.g. Red Cross, Habitat for Humanity')}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('Role *')}
                  </span>
                  <input
                    type="text"
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                    placeholder={t('e.g. Peer Mentor, Field Volunteer')}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Location')}
                </span>
                <input
                  type="text"
                  value={draft.location}
                  onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                  placeholder={t('e.g. Cairo, Egypt · Remote')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('Start date')}
                  </span>
                  <input
                    type="date"
                    value={draft.startDate}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('End date')}
                  </span>
                  <input
                    type="date"
                    value={draft.isCurrent ? '' : draft.endDate}
                    disabled={draft.isCurrent}
                    onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] disabled:opacity-50"
                  />
                </label>
                <label className="flex items-center gap-2 pb-2.5">
                  <input
                    type="checkbox"
                    checked={draft.isCurrent}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        isCurrent: e.target.checked,
                        endDate: e.target.checked ? '' : draft.endDate,
                      })
                    }
                    className="w-4 h-4 rounded border-[var(--border-subtle)] accent-[var(--accent-primary)]"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">{t('I still volunteer here')}</span>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Summary')}
                </span>
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={3}
                  placeholder={t('What did the volunteering involve?')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Responsibilities')}
                </span>
                <textarea
                  value={draft.responsibilities}
                  onChange={(e) => setDraft({ ...draft, responsibilities: e.target.value })}
                  rows={3}
                  placeholder={t('One per line, or separated by commas')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Achievements')}
                </span>
                <textarea
                  value={draft.achievements}
                  onChange={(e) => setDraft({ ...draft, achievements: e.target.value })}
                  rows={2}
                  placeholder={t('e.g. Mentored 12 students through the programme')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                  {t('Skills gained')}
                </span>
                <textarea
                  value={draft.skills}
                  onChange={(e) => setDraft({ ...draft, skills: e.target.value })}
                  rows={2}
                  placeholder={t('e.g. Communication, Facilitation, Project coordination')}
                  className="w-full px-3 py-2.5 rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
                />
              </label>

              {/* Related projects */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="block text-xs font-semibold text-[var(--text-secondary)]">
                    {t('Related projects')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowProjectPicker((prev) => !prev)}
                    className="text-[11px] text-[var(--color-primary-text)] hover:underline"
                  >
                    {showProjectPicker ? t('Hide') : `${t('Link projects')} (${draft.projectIds.length})`}
                  </button>
                </div>

                {showProjectPicker && (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/30">
                    {projects.length === 0 && (
                      <div className="text-[11px] text-[var(--text-muted)] p-2 text-center">
                        {t('You have no projects yet. Create one on the Projects page first.')}
                      </div>
                    )}
                    {projects.map((project) => {
                      const linked = draft.projectIds.includes(project.id);
                      return (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => toggleProject(project.id)}
                          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-start transition-colors ${
                            linked
                              ? 'bg-[var(--accent-surface)] text-[var(--color-primary-text)]'
                              : 'hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)]'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              linked
                                ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)] border-[var(--accent-primary)]'
                                : 'border-[var(--border-strong)]'
                            }`}
                          >
                            {linked && <Check className="w-3 h-3" />}
                          </span>
                          <span className="text-xs truncate">{project.title}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {submitError && (
                <div className="text-xs text-[var(--color-error)] p-2.5 rounded-lg bg-[var(--surface-secondary)] border border-[var(--color-error)]/30">
                  {submitError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={close}
                  className="px-3.5 py-2 rounded-lg border border-[var(--border-subtle)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--color-on-primary)] text-xs font-semibold disabled:opacity-60"
                >
                  {isSubmitting ? t('Saving…') : draft.id ? t('Save changes') : t('Add volunteering')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Reveal>
  );
};
