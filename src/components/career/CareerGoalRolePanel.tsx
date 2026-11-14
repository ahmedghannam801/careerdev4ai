import React, { useMemo, useState } from 'react';
import { ChevronDown, Compass, Save, Sparkles, Target, TrendingUp, UserCircle2 } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { useToast } from '../toast/ToastProvider';
import { CAREER_DOMAINS, getCareerDomainLabel, type CareerDomainId } from '../../../shared/careerDomains';
import { getCareerSpecializations } from '../../../shared/targetRoleSelection';
import {
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
  type ExperienceLevel,
} from '../../../shared/experienceLevel';
import {
  CAREER_STATUSES,
  CAREER_STATUS_LABELS,
  TARGET_OPPORTUNITY_TYPES,
  TARGET_OPPORTUNITY_TYPE_LABELS,
  type CareerStatus,
  type EducationStatus,
  type TargetOpportunityType,
} from '../../../shared/careerIdentity';
import { TargetRolePicker } from './TargetRolePicker';
import type { CareerGoal, TargetRole } from '../../types/career';

/**
 * The career goal and target role, edited in ONE place.
 *
 * THE SAME PANEL IS MOUNTED IN BOTH THE PROFILE PAGE AND THE SETTINGS PAGE.
 *
 * That is the whole point of this component. When the two screens each had
 * their own controls, they could disagree — the Profile page showed the role
 * the Settings page had already replaced, and the platform's own idea of the
 * target lagged behind both. One component, mounted twice, driven by one
 * writer (`saveCareerTarget`), means a change made in either place is
 * immediately true in both.
 *
 * The fields are the three axes of a career target:
 *   - THE TRACK   — the career domain (level 1 of the taxonomy).
 *   - THE ROLE    — the specialisation inside that track (level 2).
 *   - THE LEVEL   — the rung of the ladder the candidate is aiming at.
 *
 * plus the goal, which is the "why".
 */

const CAREER_GOAL_OPTIONS: Array<{ value: CareerGoal; label: string }> = [
  { value: 'get_first_job', label: 'Land a first full-time role' },
  { value: 'get_internship', label: 'Secure an internship' },
  { value: 'switch_career', label: 'Switch careers' },
  { value: 'get_promoted', label: 'Get promoted' },
  { value: 'become_specialist', label: 'Become a domain specialist' },
  { value: 'become_manager', label: 'Move into management' },
  { value: 'build_portfolio', label: 'Build a verifiable portfolio' },
  { value: 'freelance', label: 'Go freelance' },
  { value: 'explore_careers', label: 'Explore career options' },
  { value: 'custom', label: 'Reach a custom goal' },
];

export interface CareerGoalRolePanelProps {
  /**
   * A short explanation shown under the heading. The Profile page and the
   * Settings page use it to say WHY this block matters here.
   */
  description?: string;
  /** The id of the heading, so a label can point at it. */
  headingId?: string;
  className?: string;
}

export const CareerGoalRolePanel: React.FC<CareerGoalRolePanelProps> = ({
  description,
  headingId,
  className = '',
}) => {
  const {
    t,
    targetRole,
    experienceLevel,
    saveCareerTarget,
    saveCareerIdentity,
    careerIdentity,
    profile,
  } = useCareer();
  const { showToast } = useToast();

  // The track the panel is editing.
  //
  // It follows the candidate's role until they pick a different track by
  // hand. The override exists because the track is a FILTER for the role
  // list: without it, choosing a track while a role was already set would be
  // immediately overwritten by that role's own domain, and the select would
  // snap straight back.
  const [trackOverride, setTrackOverride] = useState<CareerDomainId | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The current role is typed before it is saved, so the field does not fight
  // the candidate's typing while the write is in flight.
  const [roleDraft, setRoleDraft] = useState<string | null>(null);
  // The headline is typed before it is saved, for the same reason as the role.
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);

  const currentTrackId =
    trackOverride ?? (targetRole?.domainId as CareerDomainId | undefined) ?? null;

  const specialisations = useMemo(
    () => (currentTrackId ? getCareerSpecializations(currentTrackId) : []),
    [currentTrackId]
  );

  const handleSave = async (changes: {
    roleId?: string | null;
    experienceLevel?: ExperienceLevel | null;
    careerGoal?: CareerGoal | null;
  }) => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const ok = await saveCareerTarget(changes);
      if (ok) {
        setNotice(t('Saved. Everything on the platform now uses this target.'));
        // The toast says WHAT changed across the platform, not just that
        // something was saved. A role change moves the roadmap, the
        // readiness figure and the CV's target all at once, and the
        // candidate deserves to be told that.
        if (changes.roleId) {
          showToast({
            title: t('Target role updated'),
            description: t(
              'Your roadmap, skill gaps, role readiness and CV target were rebuilt for the new role.',
            ),
            variant: 'success',
          });
        } else if (changes.experienceLevel !== undefined) {
          showToast({
            title: t('Experience level updated'),
            description: t('Your roadmap and skill gaps were recalculated for the new level.'),
            variant: 'success',
          });
        } else {
          showToast({
            title: t('Career goal updated'),
            description: t('Your plan now reflects the goal you chose.'),
            variant: 'success',
          });
        }
        // The notice is a confirmation, not a message that stays on screen.
        window.setTimeout(() => setNotice(null), 4000);
      } else {
        setNotice(t('Could not save that change. Please try again.'));
      }
    } catch {
      setNotice(t('Could not save that change. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleGoalChange = async (value: string) => {
    const goal = value as CareerGoal;
    if (goal === profile.careerGoal) return;
    await handleSave({ careerGoal: goal });
  };

  const handleLevelChange = async (value: string) => {
    const level = (value === '' ? null : (value as ExperienceLevel));
    await handleSave({ experienceLevel: level });
  };

  const handleRolePick = async (role: TargetRole) => {
    setShowPicker(false);
    setTrackOverride(role.domainId as CareerDomainId);
    await handleSave({ roleId: role.id });
  };

  const handleTrackChange = async (value: string) => {
    const next = value === '' ? null : (value as CareerDomainId);
    setTrackOverride(next);
    // Changing the track alone does not change the role — the role is the
    // specific choice inside the track, and the track is a function of the
    // role in the database. The candidate picks the role next; the list below
    // narrows to the new track.
    if (next && currentTrackId && next !== currentTrackId) {
      setShowPicker(true);
    }
  };

  /**
   * Saves one part of the career identity.
   *
   * The identity is written through ONE writer (`saveCareerIdentity`), which
   * is what makes a change here immediately true on every screen. The
   * identity's own vocabulary is used, so no screen has to remember which
   * column a field lives in.
   */
  const handleIdentityChange = async (changes: {
    currentStatus?: CareerStatus | null;
    currentRole?: string | null;
    educationStatus?: EducationStatus | null;
    expectedGraduationYear?: number | null;
    targetOpportunityType?: TargetOpportunityType | null;
    professionalHeadline?: string | null;
  }) => {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const ok = await saveCareerIdentity(changes);
      if (ok) {
        setNotice(t('Saved. Everything on the platform now uses this identity.'));
        window.setTimeout(() => setNotice(null), 4000);
      } else {
        setNotice(t('Could not save that change. Please try again.'));
      }
    } catch {
      setNotice(t('Could not save that change. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (value: string) => {
    await handleIdentityChange({ currentStatus: value === '' ? null : (value as CareerStatus) });
  };

  const handleRoleBlur = async () => {
    const draft = roleDraft;
    if (draft === null) return;
    setRoleDraft(null);
    const next = draft.trim();
    const current = profile.currentTitle?.trim() ?? '';
    if (next === current) return;
    await handleIdentityChange({ currentRole: next });
  };

  const handleEducationStatusChange = async (value: string) => {
    await handleIdentityChange({
      educationStatus: value === '' ? null : (value as EducationStatus),
    });
  };

  const handleGraduationYearChange = async (value: string) => {
    const year = value.trim() === '' ? null : Number(value);
    if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2200)) return;
    await handleIdentityChange({ expectedGraduationYear: year });
  };

  const handleOpportunityTypeChange = async (value: string) => {
    if (!TARGET_OPPORTUNITY_TYPES.includes(value as TargetOpportunityType)) return;
    await handleIdentityChange({ targetOpportunityType: value as TargetOpportunityType });
  };

  const handleHeadlineBlur = async () => {
    const draft = headlineDraft;
    if (draft === null) return;
    setHeadlineDraft(null);
    const next = draft.trim();
    const current = profile.headline?.trim() ?? '';
    if (next === current) return;
    await handleIdentityChange({ professionalHeadline: next });
  };

  const labelClass =
    'block text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold mb-1.5';
  const selectClass =
    'w-full rounded-xl bg-[var(--surface-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] px-3 py-2.5 focus:outline-none focus:border-[var(--accent-primary)]';

  return (
    <section
      id={headingId}
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-5 ${className}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--accent-surface)]/60 flex items-center justify-center shrink-0">
          <Target className="w-4 h-4 text-[var(--color-primary-text)]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--text-primary)]">
            {t('Career Goal & Target Role')}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {description ??
              t(
                'This is the target the whole platform measures you against — your roadmap, skill gaps, learning plan and job matches all follow it.'
              )}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* WHERE THE CANDIDATE IS NOW ------------------------------------- */}
        {/* These are the axes of the candidate's SITUATION, as opposed to the
            axes of their TARGET below. They are separate fields on purpose:
            "Student" and "Junior Data Analyst" describe two different things,
            and a platform that merges them ends up planning an internship
            hunt for a working professional. */}
        <div className="md:col-span-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <UserCircle2 className="h-4 w-4 text-[var(--color-primary-text)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
              {t('Where you are now')}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="career-status-select">
                {t('Current status')}
              </label>
              <select
                id="career-status-select"
                className={selectClass}
                value={careerIdentity.currentStatus ?? ''}
                onChange={(e) => void handleStatusChange(e.target.value)}
                disabled={saving}
              >
                <option value="">{t('Not set')}</option>
                {CAREER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(CAREER_STATUS_LABELS[status])}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {t('Who you are right now. It decides which goal fits you.')}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="current-role-input">
                {t('Current job title')}
              </label>
              <input
                id="current-role-input"
                type="text"
                className={selectClass}
                value={roleDraft ?? profile.currentTitle ?? ''}
                onChange={(e) => setRoleDraft(e.target.value)}
                onBlur={() => void handleRoleBlur()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                placeholder={t('Leave empty if you are a student')}
                disabled={saving}
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {t('Your title as it is today. Students leave this empty.')}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="education-status-select">
                {t('Education status')}
              </label>
              <select
                id="education-status-select"
                className={selectClass}
                value={careerIdentity.educationStatus}
                onChange={(e) => void handleEducationStatusChange(e.target.value)}
                disabled={saving}
              >
                <option value="not_set">{t('Not set')}</option>
                <option value="currently_studying">{t('Currently studying')}</option>
                <option value="graduated">{t('Graduated')}</option>
              </select>
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {t(
                  'If your graduation year is still in the future, you are marked as studying automatically.',
                )}
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="graduation-year-input">
                {t('Expected graduation year')}
              </label>
              <input
                id="graduation-year-input"
                type="number"
                min={1900}
                max={2200}
                className={selectClass}
                value={profile.expectedGraduationYear ?? ''}
                onChange={(e) => void handleGraduationYearChange(e.target.value)}
                placeholder={t('For example 2028')}
                disabled={saving}
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
                {t('A year in the future always means you are still studying.')}
              </p>
            </div>
          </div>
        </div>

        {/* THE GOAL */}
        <div>
          <label className={labelClass} htmlFor="career-goal-select">
            {t('Career goal')}
          </label>
          <select
            id="career-goal-select"
            className={selectClass}
            value={profile.careerGoal ?? 'explore_careers'}
            onChange={(e) => void handleGoalChange(e.target.value)}
            disabled={saving}
          >
            {CAREER_GOAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </div>

        {/* THE KIND OF OPENING */}
        {/* This is not the goal and not the role. A candidate can be aiming at
            "Data Analyst" as a role and still want an internship rather than a
            full-time entry-level job, and the CV summary, the live jobs and
            the opportunities all have to say the same thing about which one
            it is. */}
        <div>
          <label className={labelClass} htmlFor="target-opportunity-type-select">
            {t('Target opportunity type')}
          </label>
          <select
            id="target-opportunity-type-select"
            className={selectClass}
            value={careerIdentity.targetOpportunityType}
            onChange={(e) => void handleOpportunityTypeChange(e.target.value)}
            disabled={saving}
          >
            {TARGET_OPPORTUNITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(TARGET_OPPORTUNITY_TYPE_LABELS[type])}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {t(
              'Your CV summary, live jobs and opportunities all use this exact choice.',
            )}
          </p>
        </div>

        {/* THE HEADLINE */}
        {/* The headline is what the candidate calls themselves. It is NOT the
            current job title: a student has no job title, and putting
            "Aspiring Data Analyst" in that field made the platform claim they
            were employed. */}
        <div>
          <label className={labelClass} htmlFor="professional-headline-input">
            {t('Professional headline')}
          </label>
          <input
            id="professional-headline-input"
            type="text"
            className={selectClass}
            value={headlineDraft ?? profile.headline ?? ''}
            onChange={(e) => setHeadlineDraft(e.target.value)}
            onBlur={() => void handleHeadlineBlur()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder={t('e.g. Aspiring Data Analyst')}
            disabled={saving}
          />
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {t(
              'Your own line about yourself. It sits at the top of your CV, separately from your job title.',
            )}
          </p>
        </div>

        {/* THE LEVEL */}
        <div>
          <label className={labelClass} htmlFor="experience-level-select">
            {t('Experience level')}
          </label>
          <select
            id="experience-level-select"
            className={selectClass}
            value={experienceLevel ?? ''}
            onChange={(e) => void handleLevelChange(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('Not set')}</option>
            {EXPERIENCE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(EXPERIENCE_LEVEL_LABELS[level].en)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {t('The level you are aiming at. It tells the platform which rung to write for.')}
          </p>
        </div>

        {/* THE TRACK */}
        <div>
          <label className={labelClass} htmlFor="career-track-select">
            {t('Career track')}
          </label>
          <select
            id="career-track-select"
            className={selectClass}
            value={currentTrackId ?? ''}
            onChange={(e) => void handleTrackChange(e.target.value)}
            disabled={saving}
          >
            <option value="">{t('Choose a track')}</option>
            {CAREER_DOMAINS.map((domain) => (
              <option key={domain.slug} value={domain.slug}>
                {t(domain.label)}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {t('The field your target role sits in. It narrows the role list below.')}
          </p>
        </div>

        {/* THE ROLE */}
        <div>
          <label className={labelClass} htmlFor="target-role-select">
            {t('Target job title')}
          </label>
          {currentTrackId && specialisations.length > 0 ? (
            <select
              id="target-role-select"
              className={selectClass}
              // The value is the candidate's role only while that role is in
              // the track being shown. After the track changes, the old role
              // is no longer one of the options, and the select says so
              // rather than showing a value that is not on the list.
              value={
                targetRole && specialisations.some((entry) => entry.id === targetRole.id)
                  ? targetRole.id
                  : ''
              }
              onChange={(e) => {
                const role = specialisations.find((entry) => entry.id === e.target.value);
                if (role) void handleRolePick(role);
              }}
              disabled={saving}
            >
              <option value="">{t('Choose a role')}</option>
              {specialisations.map((role) => (
                <option key={role.id} value={role.id}>
                  {t(role.title)}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              id="target-role-select"
              onClick={() => setShowPicker(true)}
              className={`${selectClass} flex items-center justify-between text-start`}
              disabled={saving}
            >
              <span className={targetRole ? '' : 'text-[var(--text-muted)]'}>
                {targetRole ? t(targetRole.title) : t('Choose a role')}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>
          )}
          <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
            {targetRole
              ? `${t('Current track:')} ${getCareerDomainLabel(currentTrackId)}`
              : t('No target role yet — pick one and the platform will plan around it.')}
          </p>
        </div>
      </div>

      {/* THE CURRENT TARGET, SUMMARISED */}
      <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 p-3.5">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-3.5 h-3.5 text-[var(--color-primary-text)]" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
            {t('Your current target')}
          </span>
        </div>
        {targetRole ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="font-bold text-[var(--text-primary)]">{t(targetRole.title)}</span>
            <span className="text-[var(--text-secondary)]">
              {t(getCareerDomainLabel(currentTrackId))}
            </span>
            {experienceLevel && (
              <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                <TrendingUp className="w-3 h-3" />
                {t(EXPERIENCE_LEVEL_LABELS[experienceLevel].en)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">
            {t(
              'You have not chosen a target role yet. Until you do, the roadmap, the skill gaps and the job matches stay generic.'
            )}
          </p>
        )}
      </div>

      {/* THE FULL PICKER — for the candidate who wants to search everything */}
      {showPicker && (
        <div className="mt-4 rounded-xl border border-[var(--border-subtle)] p-3.5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] font-bold">
              {t('Browse every role')}
            </div>
            <button
              type="button"
              onClick={() => setShowPicker(false)}
              className="text-[11px] text-[var(--color-primary-text)] hover:underline"
            >
              {t('Close')}
            </button>
          </div>
          <TargetRolePicker
            selectedRoleId={targetRole?.id ?? null}
            onSelect={(role) => void handleRolePick(role)}
            initialDomainId={currentTrackId}
          />
        </div>
      )}

      {/* THE STATUS LINE — every change here is saved the moment it is made */}
      <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--text-muted)] min-h-4">
        {saving ? (
          <>
            <Sparkles className="w-3 h-3 animate-pulse text-[var(--color-primary-text)]" />
            <span>{t('Saving...')}</span>
          </>
        ) : notice ? (
          <>
            <Save className="w-3 h-3 text-[var(--color-success-strong)]" />
            <span className="text-[var(--color-success-strong)]">{notice}</span>
          </>
        ) : (
          <span>{t('Changes are saved as you make them — and everywhere on the platform updates at once.')}</span>
        )}
      </div>
    </section>
  );
};
