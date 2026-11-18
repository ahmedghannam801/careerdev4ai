import type { TargetOpportunityType } from './careerIdentity.ts';
import type { TargetRole } from './careerTypes.ts';
import type { ExperienceLevel } from './experienceLevel.ts';
import type { JobSkillSource, LiveJob } from './jobs.ts';
import { normalizeSkillKey } from './skillNormalizer.ts';
import { createSkillLookup, canonicalSkillKey, skillNameVariants } from './skillMatching.ts';

export const REQUIRED_SKILLS_WEIGHT = 40;
export const PREFERRED_SKILLS_WEIGHT = 15;
export const EXPERIENCE_SENIORITY_WEIGHT = 20;
export const EDUCATION_WEIGHT = 10;
export const LOCATION_WORK_TYPE_WEIGHT = 15;
export const JOB_MATCH_WEIGHTS = {
  requiredSkills: REQUIRED_SKILLS_WEIGHT,
  preferredSkills: PREFERRED_SKILLS_WEIGHT,
  experience: EXPERIENCE_SENIORITY_WEIGHT,
  education: EDUCATION_WEIGHT,
  location: LOCATION_WORK_TYPE_WEIGHT,
} as const;
export type JobMatchFactor = keyof typeof JOB_MATCH_WEIGHTS;

/**
 * The semantic factor.
 *
 * It is kept apart from the exact factors because it works differently: the
 * exact factors compare what the candidate's record says with what the
 * posting says, name by name, while this one compares the meaning of the two.
 * It is named here so both sides agree on it, and the weight lives with the
 * server that computes it.
 */
export type SemanticJobMatchFactor = 'semantic';
export type AnyJobMatchFactor = JobMatchFactor | SemanticJobMatchFactor;

/**
 * The weight of the semantic factor, out of a hundred.
 *
 * The five exact factors weigh a hundred between them. When the semantic
 * factor joins them they share the rest, so the total is still a hundred and
 * two postings are still comparable.
 */
export const SEMANTIC_MATCH_WEIGHT = 15;

/** The weight the exact factors share between them when the semantic one joins. */
export const EXACT_MATCH_TOTAL = 100 - SEMANTIC_MATCH_WEIGHT;

/**
 * Scales the exact weights to share a smaller total.
 *
 * They keep their proportions — a candidate who compares two postings sees
 * the same ranking among the exact factors whichever way the semantic factor
 * is set.
 */
export function scaleExactWeights<T extends Record<string, number>>(weights: T): Record<string, number> {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { ...weights };

  const scaled: Record<string, number> = {};
  for (const [key, value] of Object.entries(weights)) {
    scaled[key] = (value / total) * EXACT_MATCH_TOTAL;
  }
  return scaled;
}

export type JobSeniority = 'student' | 'intern' | 'junior' | 'mid' | 'senior' | 'lead';
export type CandidateSeniorityBand = 'student' | 'intern' | 'entry' | 'professional' | 'senior';
export type EducationLevel = 'high_school' | 'bachelor' | 'master' | 'doctorate';
export interface JobMatchCandidate {
  skillNames: readonly string[];
  experienceLevel: ExperienceLevel | null;
  targetOpportunityType: TargetOpportunityType | null;
  educationLevel: EducationLevel | null;
  country: string | null;
  city: string | null;
}
export interface MatchFactorBreakdown {
  factor: JobMatchFactor; score: number; weight: number; contribution: number; evaluated: boolean; reason: string; matched: string[]; missing: string[];
}
/** The semantic factor, as the exact factors are written. */
export interface SemanticFactorBreakdown {
  factor: 'semantic'; score: number; weight: number; contribution: number; evaluated: boolean; reason: string; matched: string[]; missing: string[];
}

/**
 * Finds the terms the two texts have in common, and the terms only one has.
 *
 * The terms come from the platform's own skill catalogue, so a term is a
 * skill the platform knows about rather than any word that happened to
 * appear. A term is only counted when it is written in the text, so nothing
 * is inferred that the posting does not say.
 *
 * Both texts are canonicalised with the platform's own skill rules first, so
 * "Node.js" in a posting and "node js" in a record are the same skill —
 * which is the whole reason the semantic factor exists.
 */
export function compareTerms(
  postingText: string,
  candidateText: string,
  catalogue: Iterable<string>
): { matched: string[]; missing: string[] } {
  const posting = canonicalSkillKey(postingText);
  const candidate = canonicalSkillKey(candidateText);

  const matched: string[] = [];
  const missing: string[] = [];

  for (const raw of new Set(catalogue)) {
    const variants = skillNameVariants(raw).filter((variant) => variant.length >= 3);
    if (!variants.length) continue;

    const inPosting = variants.some((variant) => posting.includes(variant));
    if (!inPosting) continue;

    const inCandidate = variants.some((variant) => candidate.includes(variant));
    if (inCandidate) matched.push(raw);
    else missing.push(raw);
  }

  return { matched, missing };
}

/**
 * Writes the reason the semantic factor carries.
 *
 * The reason names the terms that drove the score. When there are no shared
 * terms the reason says what the similarity was instead, because a number
 * with no explanation is not an explanation.
 */
export function describeSemanticMatch(
  similarity: number,
  matched: string[],
  missing: string[]
): string {
  if (!matched.length) {
    return `The posting reads like ${Math.round(similarity * 100)}% similar work, but it names no skill from your record in the same words.`;
  }

  const shared = matched.slice(0, 4).join(', ');
  const extra = matched.length > 4 ? ` and ${matched.length - 4} more` : '';
  const gap = missing.length
    ? ` The posting also asks for ${missing.slice(0, 3).join(', ')}, which your record does not show.`
    : '';

  return `Your experience with ${shared}${extra} lines up with what this posting describes.${gap}`;
}
export interface JobMatchBreakdown {
  score: number; factors: MatchFactorBreakdown[];
  /** The semantic factor, when one was computed. Absent when it was not. */
  semantic?: SemanticFactorBreakdown;
  requiredSkills: { matched: string[]; missing: string[]; source: JobSkillSource };
  preferredSkills: { matched: string[]; missing: string[]; source: 'role_catalogue' | 'none' };
  jobSeniority: JobSeniority | null; candidateBand: CandidateSeniorityBand | null;
}
function resolveRequired(job: LiveJob, skills: Iterable<string>): { names: string[]; source: JobSkillSource } {
  if (job.requiredSkills.length) return { names: job.requiredSkills, source: job.skillSource };
  const text = (job.description ?? '').toLowerCase();
  const names = [...new Set(skills)].filter((name) => name.length >= 3 && skillNameVariants(name).some((variant) => variant.length >= 3 && text.includes(variant.toLowerCase())));
  return { names, source: names.length ? 'description' : 'none' };
}
function roleFor(title: string, roles: readonly TargetRole[]): TargetRole | undefined {
  const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2 && !['senior','junior','lead','intern','entry','level'].includes(x));
  const jobTokens = new Set(tokens(title));
  return roles.map((role) => ({ role, score: new Set([...tokens(role.title), ...role.aliases.flatMap(tokens)].filter((x) => jobTokens.has(x))).size }))
    .filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score)[0]?.role;
}
function skillSet(job: LiveJob, catalogue: Iterable<string>, roles: readonly TargetRole[]) {
  const required = resolveRequired(job, catalogue);
  const requiredKeys = new Set(required.names.map(normalizeSkillKey));
  const preferred = [...new Map((roleFor(job.title, roles)?.preferredSkills ?? []).map((skill) => [normalizeSkillKey(skill.name), skill.name])).values()].filter((name) => !requiredKeys.has(normalizeSkillKey(name)));
  return { required, preferred };
}
export function deriveCandidateBand(candidate: Pick<JobMatchCandidate, 'experienceLevel' | 'targetOpportunityType'>): CandidateSeniorityBand | null {
  if (candidate.experienceLevel === 'senior' || candidate.experienceLevel === 'lead') return 'senior';
  if (candidate.targetOpportunityType === 'internship') return 'intern';
  if (candidate.targetOpportunityType === 'full_time_entry') return 'entry';
  if (candidate.experienceLevel === 'student') return 'student';
  if (candidate.experienceLevel === 'intern') return 'intern';
  if (candidate.experienceLevel === 'junior') return 'entry';
  if (candidate.experienceLevel === 'mid') return 'professional';
  return null;
}
export function detectJobSeniority(job: Pick<LiveJob, 'title' | 'requiredExperience' | 'isInternship'>): JobSeniority | null {
  const title = job.title.toLowerCase();
  if (/\b(lead|head of|principal|chief|director)\b/.test(title)) return 'lead';
  if (/\b(senior|sr\.?|snr|staff|expert|iii|iv)\b/.test(title)) return 'senior';
  if (/\b(junior|jr\.?|entry[- ]level|graduate|fresher|trainee|associate)\b/.test(title)) return 'junior';
  if (/\b(student)\b/.test(title)) return 'student';
  if (/\bintern(ship)?\b/.test(title) || job.isInternship) return 'intern';
  if (/\b(mid[- ]?level|intermediate)\b/.test(title)) return 'mid';
  const years = (job.requiredExperience ?? '').match(/(\d+)\s*\+?\s*(?:years?|yrs?)/i);
  if (!years) return null;
  const n = Number(years[1]); return n >= 10 ? 'lead' : n >= 6 ? 'senior' : n >= 3 ? 'mid' : 'junior';
}
export function shouldFilterSeniorJob(role: JobSeniority | null, band: CandidateSeniorityBand | null): boolean {
  return Boolean(band && ['student','intern','entry'].includes(band) && (role === 'senior' || role === 'lead'));
}
export function educationLevelFromText(value: string): EducationLevel | null {
  const s = value.toLowerCase();
  return /ph\.?d|doctorate|doctoral/.test(s) ? 'doctorate' : /master|\bmba\b|\bmsc\b|\bma\b/.test(s) ? 'master' : /bachelor|\bbsc\b|\bba\b|undergraduate/.test(s) ? 'bachelor' : /high school|secondary|diploma/.test(s) ? 'high_school' : null;
}
const eduOrder: EducationLevel[] = ['high_school','bachelor','master','doctorate'];
const levelOrder: Record<CandidateSeniorityBand | JobSeniority, number> = { student:0, intern:1, entry:2, junior:2, professional:3, mid:3, senior:4, lead:5 };
/**
 * Explains how well a vacancy fits the candidate.
 *
 * The five exact factors always carry the answer. The semantic factor, when
 * one was computed, joins them and takes a share of the total from them; the
 * exact factors keep their proportions, so the ranking among them does not
 * change.
 *
 * A semantic factor that was not computed is left out entirely rather than
 * shown as a zero, because a comparison that was never made is not a
 * comparison that failed.
 */
export function explainJobMatch(
  job: LiveJob,
  candidate: JobMatchCandidate,
  catalogue: Iterable<string>,
  roles: readonly TargetRole[],
  semantic?: SemanticFactorBreakdown | null
): JobMatchBreakdown {
  const sets = skillSet(job, catalogue, roles); const lookup = createSkillLookup(candidate.skillNames);
  const reqMatch = sets.required.names.filter((s) => lookup.has(s)); const reqMiss = sets.required.names.filter((s) => !lookup.has(s));
  const prefMatch = sets.preferred.filter((s) => lookup.has(s)); const prefMiss = sets.preferred.filter((s) => !lookup.has(s));
  const jobSeniority = detectJobSeniority(job); const candidateBand = deriveCandidateBand(candidate);
  const distance = jobSeniority && candidateBand ? Math.abs(levelOrder[jobSeniority] - levelOrder[candidateBand]) : null;
  const reqEdu = educationLevelFromText(job.minEducation ?? ''); const ci = candidate.educationLevel ? eduOrder.indexOf(candidate.educationLevel) : -1; const ri = reqEdu ? eduOrder.indexOf(reqEdu) : -1;
  const countryMatch = Boolean(job.country && candidate.country && job.country.toLowerCase() === candidate.country.toLowerCase());
  const cityMatch = Boolean(job.location && candidate.city && job.location.toLowerCase().includes(candidate.city.toLowerCase()));
  const locKnown = job.isRemote === true || countryMatch || cityMatch;

  // When the semantic factor joins them, the exact factors share the rest.
  const weights = semantic ? scaleExactWeights(JOB_MATCH_WEIGHTS) : JOB_MATCH_WEIGHTS;

  const makeScaled = (factor: JobMatchFactor, score: number, evaluated: boolean, reason: string, matched: string[] = [], missing: string[] = []): MatchFactorBreakdown => {
    const weight = weights[factor];
    return { factor, score, weight, contribution: weight * score / 100, evaluated, reason, matched, missing };
  };

  const factors = [
    makeScaled('requiredSkills', sets.required.names.length ? Math.round(reqMatch.length / sets.required.names.length * 100) : 0, sets.required.names.length > 0, `${reqMatch.length} of ${sets.required.names.length} required skills match.`, reqMatch, reqMiss),
    makeScaled('preferredSkills', sets.preferred.length ? Math.round(prefMatch.length / sets.preferred.length * 100) : 0, sets.preferred.length > 0, `${prefMatch.length} of ${sets.preferred.length} preferred skills match.`, prefMatch, prefMiss),
    makeScaled('experience', distance === null ? 0 : Math.max(0, 100 - distance * 30), distance !== null, distance === null ? 'Seniority information is not stated.' : `The posting asks for ${jobSeniority}; your target band is ${candidateBand}.`),
    makeScaled('education', ri < 0 || ci < 0 ? 0 : ci >= ri ? 100 : Math.max(0, 100 - (ri - ci) * 40), ri >= 0 && ci >= 0, ri < 0 ? 'The posting does not state an education requirement.' : ci < 0 ? 'Your profile does not state your education level.' : `The posting asks for ${reqEdu}; your profile shows ${candidate.educationLevel}.`),
    makeScaled('location', !locKnown ? 0 : job.isRemote ? 100 : countryMatch || cityMatch ? 100 : 0, locKnown, !locKnown ? 'Location information is not stated.' : job.isRemote ? 'This posting is remote.' : countryMatch || cityMatch ? 'The posting and profile share a location.' : 'The posting location differs from your profile.'),
  ];

  const semanticFactor = semantic && semantic.evaluated ? semantic : undefined;
  const total = factors.reduce((sum, f) => sum + f.contribution, 0) + (semanticFactor?.contribution ?? 0);

  return {
    score: Math.round(total),
    factors,
    ...(semanticFactor ? { semantic: semanticFactor } : {}),
    requiredSkills: { matched: reqMatch, missing: reqMiss, source: sets.required.source },
    preferredSkills: { matched: prefMatch, missing: prefMiss, source: sets.preferred.length ? 'role_catalogue' : 'none' },
    jobSeniority,
    candidateBand,
  };
}
