/**
 * Headline suggestions.
 *
 * The headline is the one line under the candidate's name, and it used to be
 * the hardest field in the studio: the assistant offered a single draft, and
 * offered nothing at all when AI writing was switched off. A candidate with
 * no allowance was left with an empty box.
 *
 * This control always has an answer. It asks the server for role-aware options
 * and, if the request fails, times out or returns nothing, it generates the
 * same options locally from the candidate's own record. Selecting an option
 * fills the headline immediately; nothing is written until the candidate
 * chooses.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Check, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { useCareer } from '../../context/CareerContext';
import { suggestCvHeadlines } from '../../lib/cvAssistApi';
import {
  generateHeadlineSuggestions,
  type HeadlineSuggestionInput,
} from '../../../shared/headlineSuggestions';

export interface HeadlineSuggestionsProps {
  /** The headline currently in the field. */
  value: string;
  /** The role the CV is aimed at. */
  targetRoleTitle: string;
  /** Puts the chosen headline into the field. */
  onApply: (text: string) => void;
}

export const HeadlineSuggestions: React.FC<HeadlineSuggestionsProps> = ({
  value,
  targetRoleTitle,
  onApply,
}) => {
  const {
    t,
    profile,
    targetRole,
    ownedSkills,
    savedRoles,
    projects,
    volunteerExperiences,
    learningItems,
    learningCatalog,
    aiPreferences,
    privacyPreferences,
  } = useCareer();

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const input = useMemo<HeadlineSuggestionInput>(() => {
    const roleSkills = [
      ...(targetRole.requiredSkills ?? []).map((skill) => skill.name),
      ...(targetRole.preferredSkills ?? []).map((skill) => skill.name),
    ];

    // Additional tracks are real choices the candidate saved. The headline
    // generator only combines them when the roles genuinely overlap.
    const primaryKey = (targetRoleTitle || targetRole.title || '').trim().toLowerCase();
    const additionalTargetRoles = savedRoles
      .map((role) => role.title)
      .filter((title) => title.trim().toLowerCase() !== primaryKey);

    const courseTitles = new Map(learningCatalog.map((course) => [course.id, course.title]));
    const training = learningItems
      .filter((item) => item.status === 'completed')
      .map((item) => courseTitles.get(item.courseId) ?? '')
      .filter(Boolean);

    return {
      targetRoleTitle: targetRoleTitle || targetRole.title || profile.currentTitle || '',
      additionalTargetRoles,
      currentTitle: value,
      skills: ownedSkills.map((skill) => skill.name),
      roleSkills,
      experience: profile.experiences.map((entry) =>
        `${entry.role}${entry.company ? ` at ${entry.company}` : ''}`
      ),
      education: profile.education.map((entry) =>
        [entry.degree, entry.field, entry.institution].filter(Boolean).join(' — ')
      ),
      projects: projects.map((entry) => entry.title),
      certifications: profile.certifications.map((entry) => entry.name),
      volunteering: volunteerExperiences.map((entry) =>
        `${entry.organization}${entry.role ? ` (${entry.role})` : ''}`
      ),
      training,
      careerGoal: profile.careerGoal,
      // The deterministic copy has English and Arabic variants. For French,
      // German and Spanish the explicit AI instruction is what makes the
      // answer match the chosen language; the local fallback stays English.
      language: aiPreferences.preferredLanguage,
    };
  }, [
    targetRoleTitle,
    targetRole,
    savedRoles,
    profile.currentTitle,
    profile.experiences,
    profile.education,
    profile.certifications,
    profile.careerGoal,
    projects,
    volunteerExperiences,
    learningItems,
    learningCatalog,
    ownedSkills,
    value,
    aiPreferences.preferredLanguage,
  ]);

  const aiAllowed =
    aiPreferences.writingAssistance && privacyPreferences.shareAnalyticsWithAi;

  const run = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNote(null);
    setSelected(null);

    // The local options are built first, so there is always something to show
    // when the network or the model does not answer.
    const local = generateHeadlineSuggestions(input);

    try {
      const response = await suggestCvHeadlines({
        targetRoleTitle: input.targetRoleTitle,
        additionalTargetRoles: [...(input.additionalTargetRoles ?? [])],
        language: input.language,
        ai: aiAllowed,
      });

      if (response.suggestions.length > 0) {
        setSuggestions(response.suggestions);
        setNote(response.fallbackReason);
      } else {
        setSuggestions(local);
        setNote(
          t('The AI returned no usable options, so locally generated suggestions are shown.')
        );
      }
    } catch (requestError) {
      // A failed request is reported, and the local options still fill the
      // list. The control never ends in a spinner or an empty panel.
      setSuggestions(local);
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Headline suggestions could not be loaded.')
      );
      setNote(
        t('Locally generated suggestions are shown instead, based on your profile.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [aiAllowed, input, t]);

  const handleOpen = () => {
    setIsOpen(true);
    if (!isLoading && suggestions.length === 0) {
      void run();
    }
  };

  const handleChoose = (suggestion: string) => {
    setSelected(suggestion);
    onApply(suggestion);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleOpen}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--color-primary-text)] transition-colors hover:bg-[var(--accent-surface)] disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3 shrink-0" />
        )}
        <span>{t('Suggest headlines')}</span>
      </button>

      {isOpen && (
        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-main)] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[var(--text-primary)]">
              {t('Choose a headline')}
            </p>
            <button
              type="button"
              onClick={() => void run()}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <RefreshCw className={`h-3 w-3 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
              <span>{t('Refresh suggestions')}</span>
            </button>
          </div>

          {isLoading && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg bg-[var(--surface-secondary)] px-2.5 py-2 text-[11px] text-[var(--text-secondary)]"
            >
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              {t('Writing headline suggestions…')}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]"
            >
              {error}
            </div>
          )}

          {note && !isLoading && (
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">{note}</p>
          )}

          {!isLoading && suggestions.length === 0 && !error && (
            <p className="text-[11px] text-[var(--text-muted)]">
              {t('No headline suggestions are available yet. Try refreshing, or write your own.')}
            </p>
          )}

          {!isLoading && suggestions.length > 0 && (
            <ul className="space-y-1.5">
              {suggestions.map((suggestion) => {
                const isChosen = selected === suggestion;
                return (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => handleChoose(suggestion)}
                      className={`flex w-full items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-start text-[11px] leading-relaxed transition-colors ${
                        isChosen
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-surface)] text-[var(--text-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-secondary)]/40 text-[var(--text-secondary)] hover:border-[var(--accent-primary)]/50 hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <span>{suggestion}</span>
                      {isChosen && (
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-primary-text)]" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected && (
            <p className="text-[10px] text-[var(--color-success-strong)]">
              {t('Headline updated. Choose another option if you prefer it.')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
