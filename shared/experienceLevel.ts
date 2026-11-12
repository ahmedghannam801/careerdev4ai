/**
 * The candidate's experience level.
 *
 * WHY THIS IS SEPARATE FROM THE CAREER STATE
 * `profiles.user_type` answers "who are you right now" — student, fresh
 * graduate, working professional, career switcher, exploring. It drives admin
 * audience targeting and the AI's career grounding, and its vocabulary is
 * fixed.
 *
 * This answers a different question: "what level are you aiming at" — Student,
 * Intern, Junior, Mid, Senior, Lead. A final-year student and a fresh graduate
 * are both aiming at the Junior level; a working professional aiming at a Lead
 * role is aiming at the Lead level. Mixing the two vocabularies into one
 * column would break the admin audience filter that already reads `user_type`.
 *
 * So the experience level is its own column, with its own vocabulary, and it
 * is validated on the server exactly like the career state is.
 */

/** The vocabulary of the experience level. */
export const EXPERIENCE_LEVELS = [
  'student',
  'intern',
  'junior',
  'mid',
  'senior',
  'lead',
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** The label shown for each level, in both interface languages. */
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, { en: string; ar: string }> = {
  student: { en: 'Student', ar: 'طالب' },
  intern: { en: 'Intern', ar: 'متدرب' },
  junior: { en: 'Junior', ar: 'مبتدئ' },
  mid: { en: 'Mid-level', ar: 'مستوى متوسط' },
  senior: { en: 'Senior', ar: 'خبير' },
  lead: { en: 'Lead', ar: 'قيادي' },
};

/** True when the value is one of the platform's experience levels. */
export function isExperienceLevel(value: unknown): value is ExperienceLevel {
  return typeof value === 'string' && (EXPERIENCE_LEVELS as readonly string[]).includes(value);
}

/**
 * Reads an experience level out of an untrusted value.
 *
 * An absent value (`undefined` / `null` / an empty string) means "not set",
 * which is a legitimate state: a candidate who has not chosen a level yet.
 * Anything else that is not in the vocabulary is rejected rather than
 * silently normalised, so a bad write can never look like a good one.
 */
export function normalizeExperienceLevel(
  value: unknown
): { ok: true; value: ExperienceLevel | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') {
    return { ok: false, error: 'The experience level must be a string.' };
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return { ok: true, value: null };
  if (!isExperienceLevel(trimmed)) {
    return {
      ok: false,
      error: `The experience level must be one of: ${EXPERIENCE_LEVELS.join(', ')}.`,
    };
  }
  return { ok: true, value: trimmed };
}

/**
 * The experience level implied by a career state.
 *
 * It is only a suggestion — the candidate chooses their own level — but it
 * gives an existing account a sensible starting value instead of an empty
 * dropdown. A student is aiming at the Student level, a fresh graduate at
 * Junior, a working professional at Mid, a career switcher at Junior (they
 * are re-entering the market) and someone still exploring at Intern.
 */
export function impliedExperienceLevel(careerState: string | null | undefined): ExperienceLevel | null {
  switch (careerState) {
    case 'student':
      return 'student';
    case 'fresh_graduate':
      return 'junior';
    case 'working_professional':
      return 'mid';
    case 'career_switcher':
      return 'junior';
    case 'exploring':
      return 'intern';
    default:
      return null;
  }
}
