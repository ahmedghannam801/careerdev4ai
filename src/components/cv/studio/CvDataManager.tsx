/**
 * The data behind the CV.
 *
 * A candidate used to have to leave the studio to manage their data: the
 * studio could write the words on a CV, but the experience, the education,
 * the projects, the certificates, the skills and the languages lived on the
 * profile screen, and the two were never the same screen. Adding a job meant
 * going to the profile, coming back, and filling the document in again.
 *
 * This panel is that missing half of the studio. It edits the SAME records
 * the profile screen edits — the profile is the source of truth, and this is
 * a second window onto it, not a second copy of it. A change made here is
 * visible on the profile screen immediately, and the other way round, because
 * there is only one record.
 *
 * What it offers:
 *
 *   - the personal details that appear in the header of the document;
 *   - the experience, the education, the projects, the certificates, the
 *     skills, the languages and the volunteering, each of which can be
 *     added, edited and deleted;
 *   - the ORDER of each collection, because the order is part of the
 *     document and it is stored on the server rather than re-derived from a
 *     date on every read;
 *   - a confirmation before a delete, because a delete here is a delete of
 *     the candidate's real record and not of a line on a draft.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Languages as LanguagesIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCareer } from '../../../context/CareerContext';
import { moveItem, type OrderedCollection } from '../../../lib/profileOrderApi';
import type {
  CareerProject,
  UserCertificationEntry,
  UserEducationEntry,
  UserExperienceEntry,
  UserLanguageEntry,
  VolunteerExperience,
} from '../../../types/career';
import type { SkillCategory } from '../../../../shared/careerTypes';
import type { SkillSource } from '../../../types/career';

// ---- The sections ---------------------------------------------------------

type StudioSection =
  | 'personal'
  | 'experience'
  | 'education'
  | 'projects'
  | 'certifications'
  | 'skills'
  | 'languages'
  | 'volunteering';

const SECTIONS: { id: StudioSection; label: string }[] = [
  { id: 'personal', label: 'Personal information' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'skills', label: 'Skills' },
  { id: 'languages', label: 'Languages' },
  { id: 'volunteering', label: 'Volunteering' },
];

// ---- Shared primitives ----------------------------------------------------

const inputClass =
  'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none';

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

const Field: React.FC<FieldProps> = ({ label, hint, children, className = '' }) => (
  <label className={`block space-y-1 ${className}`}>
    <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{label}</span>
    {children}
    {hint && <span className="block text-[10px] text-[var(--text-muted)]">{hint}</span>}
  </label>
);

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({ title, description, children }) => (
  <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5">
    <div>
      <h3 className="text-sm font-bold text-[var(--text-primary)]">{title}</h3>
      {description && (
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      )}
    </div>
    {children}
  </section>
);

interface ConfirmDeleteProps {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmDelete: React.FC<ConfirmDeleteProps> = ({ title, onCancel, onConfirm }) => {
  const { t } = useCareer();
  return (
  <div className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--surface-secondary)] p-3">
    <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
    <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{t('This cannot be undone.')}</p>
    <div className="mt-2.5 flex items-center gap-2">
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-lg bg-[var(--color-danger)] px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
      >
        {<Trash2 className="h-3 w-3" />}
        <span className="ms-1.5">{t('Delete')}</span>
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-main)]"
      >
        {t('Cancel')}
      </button>
    </div>
  </div>
  );
};

/**
 * The list of entries in one collection.
 *
 * The list owns the things every collection shares: the order, the edit
 * affordance, the delete confirmation, and the empty state. Each collection
 * supplies the summary of an entry and the form that edits it.
 */
interface CollectionListProps<T extends { id: string }> {
  items: T[];
  /** The one-line summary shown for a collapsed entry. */
  summary: (item: T) => string;
  /** The secondary line shown under the summary. */
  detail?: (item: T) => string | null;
  /** The form that edits one entry. */
  renderForm: (item: T, close: () => void) => React.ReactNode;
  /** Adds a new entry. */
  onAdd: () => void;
  /** Deletes an entry. */
  onDelete: (item: T) => void | Promise<void>;
  /** Moves an entry up or down. */
  onMove: (index: number, direction: -1 | 1) => void;
  /** The label of the collection, used in the empty state. */
  emptyLabel: string;
  /** True while a write is in flight. */
  busy?: boolean;
}

function CollectionList<T extends { id: string }>({
  items,
  summary,
  detail,
  renderForm,
  onAdd,
  onDelete,
  onMove,
  emptyLabel,
  busy,
}: CollectionListProps<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center">
          <p className="text-xs text-[var(--text-secondary)]">{'No entries yet'}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{'Add the first one'}</p>
        </div>
      )}

      {items.map((item, index) => {
        const isEditing = editingId === item.id;
        const isDeleting = deletingId === item.id;
        const secondary = detail?.(item) ?? null;
        return (
          <div
            key={item.id}
            className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                  {summary(item)}
                </p>
                {secondary && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                    {secondary}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMove(index, -1)}
                  disabled={index === 0 || busy}
                  title={'Move up'}
                  aria-label={'Move up'}
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)] disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(index, 1)}
                  disabled={index === items.length - 1 || busy}
                  title={'Move down'}
                  aria-label={'Move down'}
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)] disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(isEditing ? null : item.id)}
                  title={'Edit'}
                  aria-label={'Edit'}
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-main)] hover:text-[var(--text-primary)]"
                >
                  {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingId(isDeleting ? null : item.id)}
                  title={'Delete'}
                  aria-label={'Delete'}
                  className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-main)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {isDeleting && (
              <div className="mt-3">
                <ConfirmDelete
                  title={'Delete this item?'}
                  onCancel={() => setDeletingId(null)}
                  onConfirm={async () => {
                    setDeletingId(null);
                    await onDelete(item);
                  }}
                />
              </div>
            )}

            {isEditing && (
              <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
                {renderForm(item, () => setEditingId(null))}
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-subtle)] px-3 py-2.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-primary)] hover:text-[var(--color-primary-text)] disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{'Add'}</span>
      </button>
    </div>
  );
}

/** Renders a list of lines as one comma separated editable string. */
function linesToText(lines: string[] | undefined): string {
  return (lines ?? []).join('\n');
}

function textToLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Adds the scheme a person leaves off a link.
 *
 * A candidate types "linkedin.com/ahmad", not "https://linkedin.com/ahmed".
 * The server only accepts an absolute http(s) URL and refuses the whole
 * update otherwise, so the scheme is added here rather than making the
 * candidate fail a save over a detail they did not know about.
 */
function normalizeLink(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// ---- The panel ------------------------------------------------------------

export const CvDataManager: React.FC = () => {
  const {
    profile,
    reorderCvCollection,
    projects,
    volunteerExperiences,
    ownedSkills,
    addCustomSkill,
    removeSkill,
    t,
  } = useCareer();

  const [section, setSection] = useState<StudioSection>('personal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void> | void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }, []);

  /** Moves an entry and stores the new order on the server. */
  const moveAndPersist = useCallback(
    async <T extends { id: string }>(
      collection: OrderedCollection,
      items: T[],
      index: number,
      direction: -1 | 1
    ) => {
      const next = moveItem(items, index, direction);
      await reorderCvCollection(
        collection,
        next.map((item) => item.id)
      );
    },
    [reorderCvCollection]
  );

  const activeSection = useMemo(
    () => SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0],
    [section]
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      {/* The section rail. */}
      <nav className="lg:col-span-3">
        <div className="flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-start text-xs font-semibold transition-colors ${
                entry.id === section
                  ? 'bg-[var(--accent-primary)] text-[var(--color-on-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      </nav>

      {/* The editor. */}
      <div className="lg:col-span-9 space-y-4">
        {busy && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>{'Saving'}</span>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--surface-main)] px-3 py-2 text-[11px] text-[var(--text-secondary)]"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-danger)]" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--surface-main)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
            <Check className="h-3.5 w-3.5 shrink-0 text-[var(--color-success-strong)]" />
            <span>{notice}</span>
          </div>
        )}

        {section === 'personal' && <PersonalSection onSave={run} />}
        {section === 'experience' && (
          <ExperienceSection
            entries={profile.experiences}
            busy={busy}
            onSave={run}
            onMove={(index, direction) =>
              run(() =>
                moveAndPersist('experiences', profile.experiences, index, direction)
              )
            }
          />
        )}
        {section === 'education' && (
          <EducationSection
            entries={profile.education}
            busy={busy}
            onSave={run}
            onMove={(index, direction) =>
              run(() => moveAndPersist('educations', profile.education, index, direction))
            }
          />
        )}
        {section === 'projects' && (
          <ProjectsSection
            entries={projects}
            busy={busy}
            onSave={run}
            onMove={(index, direction) =>
              run(() => moveAndPersist('projects', projects, index, direction))
            }
          />
        )}
        {section === 'certifications' && (
          <CertificationsSection
            entries={profile.certifications}
            busy={busy}
            onSave={run}
            onMove={(index, direction) =>
              run(() =>
                moveAndPersist('certifications', profile.certifications, index, direction)
              )
            }
          />
        )}
        {section === 'skills' && (
          <SkillsSection
            skills={ownedSkills}
            busy={busy}
            onSave={run}
            onAddSkill={addCustomSkill}
            onRemoveSkill={removeSkill}
          />
        )}
        {section === 'languages' && (
          <LanguagesSection
            entries={profile.languages}
            busy={busy}
            onSave={run}
            onMove={(index, direction) =>
              run(() => moveAndPersist('languages', profile.languages, index, direction))
            }
          />
        )}
        {section === 'volunteering' && (
          <VolunteeringSection
            entries={volunteerExperiences}
            busy={busy}
            onSave={run}
          />
        )}

        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {t(
            'These are the same records the profile screen edits. A change made here appears there immediately, and the CV is built from them.'
          )}
        </p>
        <span className="sr-only">{activeSection.label}</span>
      </div>
    </div>
  );
};

// ---- Personal -------------------------------------------------------------

const PersonalSection: React.FC<{
  onSave: (work: () => Promise<void> | void) => Promise<void>;
}> = ({ onSave }) => {
  const { profile, updateProfile, t } = useCareer();
  const [draft, setDraft] = useState({
    name: profile.name ?? '',
    headline: profile.headline ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    location: profile.location ?? '',
    links: { ...(profile.links ?? {}) },
  });

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const setLink = (key: keyof typeof draft['links'], value: string) =>
    setDraft((previous) => ({
      ...previous,
      links: { ...previous.links, [key]: value },
    }));

  return (
    <SectionCard
      title={t('Personal information')}
      description={t(
        'These details appear at the top of the CV and on your public profile.'
      )}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('Name')}>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <Field label={t('Title')}>
          <input
            className={inputClass}
            value={draft.headline}
            onChange={(event) => set('headline', event.target.value)}
          />
        </Field>
        <Field label={t('Email')}>
          <input
            className={inputClass}
            type="email"
            value={draft.email}
            onChange={(event) => set('email', event.target.value)}
          />
        </Field>
        <Field label={t('Phone')}>
          <input
            className={inputClass}
            value={draft.phone}
            onChange={(event) => set('phone', event.target.value)}
          />
        </Field>
        <Field label={t('Location')} className="sm:col-span-2">
          <input
            className={inputClass}
            value={draft.location}
            onChange={(event) => set('location', event.target.value)}
          />
        </Field>
      </div>

      <div className="space-y-3 border-t border-[var(--border-subtle)] pt-4">
        <h4 className="text-xs font-bold text-[var(--text-primary)]">{t('Links')}</h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ['linkedin', 'LinkedIn'],
              ['github', 'GitHub'],
              ['portfolio', 'Portfolio'],
              ['personalWebsite', 'Personal website'],
              ['behance', 'Behance'],
              ['dribbble', 'Dribbble'],
              ['twitter', 'Twitter'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className={inputClass}
                value={draft.links[key] ?? ''}
                onChange={(event) => setLink(key, event.target.value)}
              />
            </Field>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          onSave(() =>
            updateProfile({
              name: draft.name.trim(),
              headline: draft.headline.trim(),
              email: draft.email.trim(),
              phone: draft.phone.trim(),
              location: draft.location.trim(),
              // The links are a keyed set and the server replaces them as a
              // whole, so every link is sent — not only the ones that were
              // edited. Sending a subset would delete the rest.
              links: Object.fromEntries(
                Object.entries(draft.links).map(([key, value]) => [
                  key,
                  normalizeLink(value ?? ''),
                ])
              ),
            })
          )
        }
        className="rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
      >
        {t('Save changes')}
      </button>
    </SectionCard>
  );
};

// ---- Experience -----------------------------------------------------------

const ExperienceSection: React.FC<{
  entries: UserExperienceEntry[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ entries, busy, onSave, onMove }) => {
  const { updateProfile, t } = useCareer();

  const blank = (): UserExperienceEntry => ({
    id: `new-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    role: '',
    company: '',
    employmentType: 'Full-time',
    location: '',
    startDate: '',
    endDate: '',
    isCurrent: false,
    description: '',
    achievements: [],
    skillsUsed: [],
  });

  const save = (entries: UserExperienceEntry[]) =>
    updateProfile({ experiences: entries });

  return (
    <SectionCard
      title={t('Experience')}
      description={t(
        'Each entry becomes a block on the CV. The order is the order they appear in.'
      )}
    >
      <CollectionList<UserExperienceEntry>
        items={entries}
        busy={busy}
        emptyLabel={t('Experience')}
        summary={(item) => item.role || t('Role')}
        detail={(item) =>
          [item.company, item.location].filter(Boolean).join(' · ') || null
        }
        onAdd={() => onSave(() => save([...entries, blank()]))}
        onDelete={(item) => onSave(() => save(entries.filter((entry) => entry.id !== item.id)))}
        onMove={onMove}
        renderForm={(item, close) => (
          <ExperienceForm
            entry={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await save(
                  entries.map((entry) => (entry.id === updated.id ? updated : entry))
                );
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const ExperienceForm: React.FC<{
  entry: UserExperienceEntry;
  onCancel: () => void;
  onSubmit: (entry: UserExperienceEntry) => void | Promise<void>;
}> = ({ entry, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState<UserExperienceEntry>(entry);

  const set = <K extends keyof UserExperienceEntry>(
    key: K,
    value: UserExperienceEntry[K]
  ) => setDraft((previous) => ({ ...previous, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Role')}>
          <input
            required
            className={inputClass}
            value={draft.role}
            onChange={(event) => set('role', event.target.value)}
          />
        </Field>
        <Field label={t('Company')}>
          <input
            required
            className={inputClass}
            value={draft.company}
            onChange={(event) => set('company', event.target.value)}
          />
        </Field>
        <Field label={t('Location')}>
          <input
            className={inputClass}
            value={draft.location}
            onChange={(event) => set('location', event.target.value)}
          />
        </Field>
        <Field label={t('Type of employment')}>
          <select
            className={inputClass}
            value={draft.employmentType}
            onChange={(event) =>
              set('employmentType', event.target.value as UserExperienceEntry['employmentType'])
            }
          >
            {['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Start date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.startDate ?? ''}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </Field>
        <Field label={t('End date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.endDate ?? ''}
            disabled={draft.isCurrent}
            onChange={(event) => set('endDate', event.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={draft.isCurrent}
          onChange={(event) => set('isCurrent', event.target.checked)}
        />
        {t('I currently work here')}
      </label>

      <Field label={t('Description')}>
        <textarea
          rows={3}
          className={inputClass}
          value={draft.description}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <Field
        label={t('Achievements')}
        hint={t('One per line. They become the bullet points on the CV.')}
      >
        <textarea
          rows={3}
          className={inputClass}
          value={linesToText(draft.achievements)}
          onChange={(event) => set('achievements', textToLines(event.target.value))}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

// ---- Education ------------------------------------------------------------

const EducationSection: React.FC<{
  entries: UserEducationEntry[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ entries, busy, onSave, onMove }) => {
  const { updateProfile, t } = useCareer();

  const blank = (): UserEducationEntry => ({
    id: `new-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    institution: '',
    degree: '',
    field: '',
    startDate: '',
    endDate: '',
    current: false,
  });

  const save = (next: UserEducationEntry[]) => updateProfile({ education: next });

  return (
    <SectionCard title={t('Education')}>
      <CollectionList<UserEducationEntry>
        items={entries}
        busy={busy}
        emptyLabel={t('Education')}
        summary={(item) => item.institution || t('Institution')}
        detail={(item) => [item.degree, item.field].filter(Boolean).join(' · ') || null}
        onAdd={() => onSave(() => save([...entries, blank()]))}
        onDelete={(item) => onSave(() => save(entries.filter((entry) => entry.id !== item.id)))}
        onMove={onMove}
        renderForm={(item, close) => (
          <EducationForm
            entry={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await save(
                  entries.map((entry) => (entry.id === updated.id ? updated : entry))
                );
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const EducationForm: React.FC<{
  entry: UserEducationEntry;
  onCancel: () => void;
  onSubmit: (entry: UserEducationEntry) => void | Promise<void>;
}> = ({ entry, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState<UserEducationEntry>(entry);

  const set = <K extends keyof UserEducationEntry>(
    key: K,
    value: UserEducationEntry[K]
  ) => setDraft((previous) => ({ ...previous, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Institution')}>
          <input
            required
            className={inputClass}
            value={draft.institution}
            onChange={(event) => set('institution', event.target.value)}
          />
        </Field>
        <Field label={t('Degree')}>
          <input
            className={inputClass}
            value={draft.degree}
            onChange={(event) => set('degree', event.target.value)}
          />
        </Field>
        <Field label={t('Field of study')}>
          <input
            className={inputClass}
            value={draft.field}
            onChange={(event) => set('field', event.target.value)}
          />
        </Field>
        <Field label={t('GPA')}>
          <input
            className={inputClass}
            value={draft.gpa ?? ''}
            onChange={(event) => set('gpa', event.target.value)}
          />
        </Field>
        <Field label={t('Start date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.startDate ?? ''}
            onChange={(event) => set('startDate', event.target.value)}
          />
        </Field>
        <Field label={t('End date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.endDate ?? ''}
            disabled={draft.current}
            onChange={(event) => set('endDate', event.target.value)}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={draft.current}
          onChange={(event) => set('current', event.target.checked)}
        />
        {t('I am studying here now')}
      </label>

      <Field label={t('Coursework')} hint={t('One per line.')}>
        <textarea
          rows={2}
          className={inputClass}
          value={linesToText(draft.coursework)}
          onChange={(event) => set('coursework', textToLines(event.target.value))}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

// ---- Projects -------------------------------------------------------------

const ProjectsSection: React.FC<{
  entries: CareerProject[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ entries, busy, onSave, onMove }) => {
  const { addProject, updateProject, deleteProject, t } = useCareer();

  return (
    <SectionCard title={t('Projects')}>
      <CollectionList<CareerProject>
        items={entries}
        busy={busy}
        emptyLabel={t('Projects')}
        summary={(item) => item.title || t('Title')}
        detail={(item) => item.goal || null}
        onAdd={() =>
          onSave(() =>
            addProject({
              title: '',
              goal: '',
              description: '',
              difficulty: 'Intermediate',
              skills: [],
              tasks: [],
              deliverables: [],
              status: 'in_progress',
            })
          )
        }
        onDelete={(item) => onSave(() => deleteProject(item.id))}
        onMove={onMove}
        renderForm={(item, close) => (
          <ProjectForm
            project={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await updateProject(item.id, updated);
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const ProjectForm: React.FC<{
  project: CareerProject;
  onCancel: () => void;
  onSubmit: (project: Partial<CareerProject>) => void | Promise<void>;
}> = ({ project, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState({
    title: project.title,
    goal: project.goal,
    description: project.description,
    repositoryUrl: project.repositoryUrl ?? '',
    status: project.status,
    difficulty: project.difficulty,
    skills: linesToText(project.skills),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          title: draft.title.trim(),
          goal: draft.goal.trim(),
          description: draft.description.trim(),
          repositoryUrl: draft.repositoryUrl.trim() || undefined,
          status: draft.status,
          difficulty: draft.difficulty,
          skills: textToLines(draft.skills),
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Title')}>
          <input
            required
            className={inputClass}
            value={draft.title}
            onChange={(event) => setDraft((p) => ({ ...p, title: event.target.value }))}
          />
        </Field>
        <Field label={t('Status')}>
          <select
            className={inputClass}
            value={draft.status}
            onChange={(event) =>
              setDraft((p) => ({ ...p, status: event.target.value as CareerProject['status'] }))
            }
          >
            {['planned', 'in_progress', 'completed', 'published'].map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('Goal')} className="sm:col-span-2">
          <input
            className={inputClass}
            value={draft.goal}
            onChange={(event) => setDraft((p) => ({ ...p, goal: event.target.value }))}
          />
        </Field>
        <Field label={t('Repository')} className="sm:col-span-2">
          <input
            className={inputClass}
            value={draft.repositoryUrl}
            onChange={(event) =>
              setDraft((p) => ({ ...p, repositoryUrl: event.target.value }))
            }
          />
        </Field>
      </div>

      <Field label={t('Description')}>
        <textarea
          rows={3}
          className={inputClass}
          value={draft.description}
          onChange={(event) => setDraft((p) => ({ ...p, description: event.target.value }))}
        />
      </Field>

      <Field label={t('Skills')} hint={t('One per line.')}>
        <textarea
          rows={2}
          className={inputClass}
          value={draft.skills}
          onChange={(event) => setDraft((p) => ({ ...p, skills: event.target.value }))}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

// ---- Certifications -------------------------------------------------------

const CertificationsSection: React.FC<{
  entries: UserCertificationEntry[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ entries, busy, onSave, onMove }) => {
  const { updateProfile, t } = useCareer();

  const blank = (): UserCertificationEntry => ({
    id: `new-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    name: '',
    provider: '',
    issueDate: '',
  });

  const save = (next: UserCertificationEntry[]) => updateProfile({ certifications: next });

  return (
    <SectionCard title={t('Certifications')}>
      <CollectionList<UserCertificationEntry>
        items={entries}
        busy={busy}
        emptyLabel={t('Certifications')}
        summary={(item) => item.name || t('Name')}
        detail={(item) => item.provider || null}
        onAdd={() => onSave(() => save([...entries, blank()]))}
        onDelete={(item) => onSave(() => save(entries.filter((entry) => entry.id !== item.id)))}
        onMove={onMove}
        renderForm={(item, close) => (
          <CertificationForm
            entry={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await save(
                  entries.map((entry) => (entry.id === updated.id ? updated : entry))
                );
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const CertificationForm: React.FC<{
  entry: UserCertificationEntry;
  onCancel: () => void;
  onSubmit: (entry: UserCertificationEntry) => void | Promise<void>;
}> = ({ entry, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState<UserCertificationEntry>(entry);

  const set = <K extends keyof UserCertificationEntry>(
    key: K,
    value: UserCertificationEntry[K]
  ) => setDraft((previous) => ({ ...previous, [key]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Name')}>
          <input
            required
            className={inputClass}
            value={draft.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </Field>
        <Field label={t('Provider')}>
          <input
            className={inputClass}
            value={draft.provider}
            onChange={(event) => set('provider', event.target.value)}
          />
        </Field>
        <Field label={t('Issue date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.issueDate ?? ''}
            onChange={(event) => set('issueDate', event.target.value)}
          />
        </Field>
        <Field label={t('Expiry date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.expiryDate ?? ''}
            onChange={(event) => set('expiryDate', event.target.value)}
          />
        </Field>
      </div>

      <Field label={t('Description')}>
        <textarea
          rows={2}
          className={inputClass}
          value={draft.description ?? ''}
          onChange={(event) => set('description', event.target.value)}
        />
      </Field>

      <Field label={t('Credential URL')}>
        <input
          className={inputClass}
          value={draft.credentialUrl ?? ''}
          onChange={(event) => set('credentialUrl', event.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

// ---- Skills ---------------------------------------------------------------

const SkillsSection: React.FC<{
  skills: Array<{ name: string; level: number }>;
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onAddSkill: (skill: {
    name: string;
    category: SkillCategory;
    currentLevel: number;
    targetLevel: number;
    source: SkillSource;
    evidenceIds: string[];
  }) => void;
  onRemoveSkill: (skillId: string) => void;
}> = ({ skills, busy, onSave, onAddSkill, onRemoveSkill }) => {
  const { t } = useCareer();
  const [name, setName] = useState('');
  const [level, setLevel] = useState(3);
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <SectionCard
      title={t('Skills')}
      description={t(
        'Only the skills on this list can be written on a CV, and only the ones you rated are yours to claim.'
      )}
    >
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onAddSkill({
            name: trimmed,
            category: 'technical',
            currentLevel: level,
            targetLevel: Math.min(5, level + 1),
            source: 'self_reported',
            evidenceIds: [],
          });
          setName('');
        }}
      >
        <Field label={t('Name')} className="min-w-[12rem] flex-1">
          <input
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('Add the first one')}
          />
        </Field>
        <Field label={t('Level')} className="w-28">
          <select
            className={inputClass}
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-2 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {t('Add')}
        </button>
      </form>

      <div className="space-y-2">
        {skills.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--border-subtle)] px-4 py-6 text-center text-[11px] text-[var(--text-muted)]">
            {'No entries yet'}
          </p>
        )}
        {skills.map((skill) => (
          <div
            key={skill.name}
            className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {skill.name}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">{skill.level}/5</span>
            </div>
            <button
              type="button"
              onClick={() => setDeleting(deleting === skill.name ? null : skill.name)}
              title={t('Delete')}
              aria-label={t('Delete')}
              className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-main)] hover:text-[var(--color-danger)]"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {deleting === skill.name && (
              <div className="basis-full">
                <ConfirmDelete
                  title={t('Delete this item?')}
                  onCancel={() => setDeleting(null)}
                  onConfirm={() => {
                    setDeleting(null);
                    onSave(() => onRemoveSkill(skill.name));
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

// ---- Languages ------------------------------------------------------------

const LanguagesSection: React.FC<{
  entries: UserLanguageEntry[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => void;
}> = ({ entries, busy, onSave, onMove }) => {
  const { updateProfile, t } = useCareer();

  const blank = (): UserLanguageEntry => ({
    id: `new-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    language: '',
    proficiency: 'Professional',
  });

  const save = (next: UserLanguageEntry[]) => updateProfile({ languages: next });

  return (
    <SectionCard title={t('Languages')}>
      <CollectionList<UserLanguageEntry>
        items={entries}
        busy={busy}
        emptyLabel={t('Languages')}
        summary={(item) => item.language || t('Name')}
        detail={(item) => item.proficiency}
        onAdd={() => onSave(() => save([...entries, blank()]))}
        onDelete={(item) => onSave(() => save(entries.filter((entry) => entry.id !== item.id)))}
        onMove={onMove}
        renderForm={(item, close) => (
          <LanguageForm
            entry={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await save(
                  entries.map((entry) => (entry.id === updated.id ? updated : entry))
                );
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const LanguageForm: React.FC<{
  entry: UserLanguageEntry;
  onCancel: () => void;
  onSubmit: (entry: UserLanguageEntry) => void | Promise<void>;
}> = ({ entry, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState<UserLanguageEntry>(entry);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Name')}>
          <input
            required
            className={inputClass}
            value={draft.language}
            onChange={(event) => setDraft((p) => ({ ...p, language: event.target.value }))}
          />
        </Field>
        <Field label={t('Proficiency')}>
          <select
            className={inputClass}
            value={draft.proficiency}
            onChange={(event) =>
              setDraft((p) => ({
                ...p,
                proficiency: event.target.value as UserLanguageEntry['proficiency'],
              }))
            }
          >
            {['Native', 'Fluent', 'Professional', 'Conversational', 'Basic'].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

// ---- Volunteering ---------------------------------------------------------

const VolunteeringSection: React.FC<{
  entries: VolunteerExperience[];
  busy: boolean;
  onSave: (work: () => Promise<void> | void) => Promise<void>;
}> = ({ entries, busy, onSave }) => {
  const { addVolunteerExperience, updateVolunteerExperience, deleteVolunteerExperience, t } =
    useCareer();

  return (
    <SectionCard title={t('Volunteering')}>
      <CollectionList<VolunteerExperience>
        items={entries}
        busy={busy}
        emptyLabel={t('Volunteering')}
        summary={(item) => item.organization || t('Organization')}
        detail={(item) => item.role || null}
        onAdd={() =>
          onSave(async () => {
            await addVolunteerExperience({
              organization: '',
              role: '',
              location: '',
              startDate: '',
              endDate: '',
              isCurrent: false,
              description: '',
              responsibilities: [],
              achievements: [],
              skills: [],
              projectIds: [],
            });
          })
        }
        onDelete={(item) => onSave(() => deleteVolunteerExperience(item.id))}
        onMove={() => {
          // The volunteer stints keep the order they were created in. They
          // have no stored order of their own, so the buttons are disabled
          // rather than offering a move that would not survive a reload.
        }}
        renderForm={(item, close) => (
          <VolunteeringForm
            entry={item}
            onCancel={close}
            onSubmit={(updated) =>
              onSave(async () => {
                await updateVolunteerExperience(item.id, updated);
                close();
              })
            }
          />
        )}
      />
    </SectionCard>
  );
};

const VolunteeringForm: React.FC<{
  entry: VolunteerExperience;
  onCancel: () => void;
  onSubmit: (entry: Partial<VolunteerExperience>) => void | Promise<void>;
}> = ({ entry, onCancel, onSubmit }) => {
  const { t } = useCareer();
  const [draft, setDraft] = useState({
    organization: entry.organization,
    role: entry.role,
    location: entry.location,
    startDate: entry.startDate,
    endDate: entry.endDate,
    isCurrent: entry.isCurrent,
    description: entry.description,
    responsibilities: linesToText(entry.responsibilities),
    achievements: linesToText(entry.achievements),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit({
          organization: draft.organization.trim(),
          role: draft.role.trim(),
          location: draft.location.trim(),
          startDate: draft.startDate,
          endDate: draft.endDate,
          isCurrent: draft.isCurrent,
          description: draft.description.trim(),
          responsibilities: textToLines(draft.responsibilities),
          achievements: textToLines(draft.achievements),
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('Organization')}>
          <input
            required
            className={inputClass}
            value={draft.organization}
            onChange={(event) => setDraft((p) => ({ ...p, organization: event.target.value }))}
          />
        </Field>
        <Field label={t('Role')}>
          <input
            className={inputClass}
            value={draft.role}
            onChange={(event) => setDraft((p) => ({ ...p, role: event.target.value }))}
          />
        </Field>
        <Field label={t('Start date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.startDate ?? ''}
            onChange={(event) => setDraft((p) => ({ ...p, startDate: event.target.value }))}
          />
        </Field>
        <Field label={t('End date')}>
          <input
            className={inputClass}
            type="month"
            value={draft.endDate ?? ''}
            disabled={draft.isCurrent}
            onChange={(event) => setDraft((p) => ({ ...p, endDate: event.target.value }))}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={draft.isCurrent}
          onChange={(event) => setDraft((p) => ({ ...p, isCurrent: event.target.checked }))}
        />
        {t('I currently work here')}
      </label>

      <Field label={t('Description')}>
        <textarea
          rows={2}
          className={inputClass}
          value={draft.description}
          onChange={(event) => setDraft((p) => ({ ...p, description: event.target.value }))}
        />
      </Field>

      <Field label={t('Responsibilities')} hint={t('One per line.')}>
        <textarea
          rows={2}
          className={inputClass}
          value={draft.responsibilities}
          onChange={(event) =>
            setDraft((p) => ({ ...p, responsibilities: event.target.value }))
          }
        />
      </Field>

      <Field label={t('Achievements')} hint={t('One per line.')}>
        <textarea
          rows={2}
          className={inputClass}
          value={draft.achievements}
          onChange={(event) => setDraft((p) => ({ ...p, achievements: event.target.value }))}
        />
      </Field>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-lg bg-[var(--accent-primary)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-on-primary)] transition-opacity hover:opacity-90"
        >
          {t('Save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {t('Cancel')}
        </button>
      </div>
    </form>
  );
};

export { LanguagesIcon };
