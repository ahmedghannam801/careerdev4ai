import type { TargetOpportunityType } from './careerIdentity.ts';
import type { TargetRole } from './careerTypes.ts';
import type { ExperienceLevel } from './experienceLevel.ts';
import type { JobSkillSource, LiveJob } from './jobs.ts';
import { normalizeSkillKey } from './skillNormalizer.ts';
import { createSkillLookup, skillNameVariants } from './skillMatching.ts';

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
export interface JobMatchBreakdown {
  score: number; factors: MatchFactorBreakdown[];
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
function makeFactor(factor: JobMatchFactor, score: number, evaluated: boolean, reason: string, matched: string[] = [], missing: string[] = []): MatchFactorBreakdown {
  const weight = JOB_MATCH_WEIGHTS[factor]; return { factor, score, weight, contribution: weight * score / 100, evaluated, reason, matched, missing };
}
export function explainJobMatch(job: LiveJob, candidate: JobMatchCandidate, catalogue: Iterable<string>, roles: readonly TargetRole[]): JobMatchBreakdown {
  const sets = skillSet(job, catalogue, roles); const lookup = createSkillLookup(candidate.skillNames);
  const reqMatch = sets.required.names.filter((s) => lookup.has(s)); const reqMiss = sets.required.names.filter((s) => !lookup.has(s));
  const prefMatch = sets.preferred.filter((s) => lookup.has(s)); const prefMiss = sets.preferred.filter((s) => !lookup.has(s));
  const jobSeniority = detectJobSeniority(job); const candidateBand = deriveCandidateBand(candidate);
  const distance = jobSeniority && candidateBand ? Math.abs(levelOrder[jobSeniority] - levelOrder[candidateBand]) : null;
  const reqEdu = educationLevelFromText(job.minEducation ?? ''); const ci = candidate.educationLevel ? eduOrder.indexOf(candidate.educationLevel) : -1; const ri = reqEdu ? eduOrder.indexOf(reqEdu) : -1;
  const countryMatch = Boolean(job.country && candidate.country && job.country.toLowerCase() === candidate.country.toLowerCase());
  const cityMatch = Boolean(job.location && candidate.city && job.location.toLowerCase().includes(candidate.city.toLowerCase()));
  const locKnown = job.isRemote === true || countryMatch || cityMatch;
  const factors = [
    makeFactor('requiredSkills', sets.required.names.length ? Math.round(reqMatch.length / sets.required.names.length * 100) : 0, sets.required.names.length > 0, `${reqMatch.length} of ${sets.required.names.length} required skills match.`, reqMatch, reqMiss),
    makeFactor('preferredSkills', sets.preferred.length ? Math.round(prefMatch.length / sets.preferred.length * 100) : 0, sets.preferred.length > 0, `${prefMatch.length} of ${sets.preferred.length} preferred skills match.`, prefMatch, prefMiss),
    makeFactor('experience', distance === null ? 0 : Math.max(0, 100 - distance * 30), distance !== null, distance === null ? 'Seniority information is not stated.' : `The posting asks for ${jobSeniority}; your target band is ${candidateBand}.`),
    makeFactor('education', ri < 0 || ci < 0 ? 0 : ci >= ri ? 100 : Math.max(0, 100 - (ri - ci) * 40), ri >= 0 && ci >= 0, ri < 0 ? 'The posting does not state an education requirement.' : ci < 0 ? 'Your profile does not state your education level.' : `The posting asks for ${reqEdu}; your profile shows ${candidate.educationLevel}.`),
    makeFactor('location', !locKnown ? 0 : job.isRemote ? 100 : countryMatch || cityMatch ? 100 : 0, locKnown, !locKnown ? 'Location information is not stated.' : job.isRemote ? 'This posting is remote.' : countryMatch || cityMatch ? 'The posting and profile share a location.' : 'The posting location differs from your profile.'),
  ];
  return { score: Math.round(factors.reduce((sum, f) => sum + f.contribution, 0)), factors, requiredSkills: { matched: reqMatch, missing: reqMiss, source: sets.required.source }, preferredSkills: { matched: prefMatch, missing: prefMiss, source: sets.preferred.length ? 'role_catalogue' : 'none' }, jobSeniority, candidateBand };
}
