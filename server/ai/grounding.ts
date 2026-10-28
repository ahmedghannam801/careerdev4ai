/**
 * Grounding: checking model output against the user's real record.
 *
 * The import pipeline is safe by construction — the CV parser is
 * deterministic and never calls a model. Everything the model writes, however,
 * was previously unverified: an ATS "suggested text" block, a cover letter, a
 * professional summary. A model asked to improve a CV will happily write
 * "Led a team of 12 at Acme Corp, lifting revenue 35%", and nothing in the
 * application ever compared that against the user's actual record.
 *
 * This module closes that hole. It builds a profile of the entities the user
 * really has (companies, institutions, organisations, roles, skills,
 * certificates, project names, the numbers that appear in their own
 * descriptions) and then checks a model-produced string against it.
 *
 * The check is deliberately conservative. It only flags a phrase when the
 * phrase looks like a concrete claim — a capitalised name, a percentage, a
 * money amount, a URL — and that phrase does not appear in the real record.
 * Generic career vocabulary ("Led a team", "Delivered projects", "Improved
 * processes") is not flagged, because those are descriptions of work rather
 * than claims about facts.
 *
 * When a string does fail the check, the caller does not have to throw the
 * whole response away. `stripUngroundedSentences` removes only the offending
 * sentences and reports what was removed, so the user keeps the useful part
 * and sees that the rest was not accepted.
 */

/** A noun phrase that reads like a named entity. */
export interface UngroundedClaim {
  /** The phrase that could not be found in the user's record. */
  claim: string;
  /** Why it was treated as a factual claim. */
  kind: 'entity' | 'metric' | 'url';
}

/** Everything the user really has, as a searchable record. */
export interface GroundingProfile {
  /** Employer names, universities, volunteering organisations. */
  organisations: string[];
  /** Job titles the user has held. */
  roles: string[];
  /** Skill names from the user's ratings. */
  skills: string[];
  /** Certificate names the user holds. */
  certifications: string[];
  /** Project names the user has created. */
  projects: string[];
  /** Numbers that appear in the user's own descriptions and achievements. */
  metrics: string[];
}

/**
 * A metric: a number with a unit that makes a claim about the world.
 *
 * The trailing lookahead matters. A `\b` cannot follow "%" because both "%"
 * and the space after it are non-word characters, so a `\b` there would
 * silently stop the pattern from ever matching.
 */
const METRIC_PATTERN = /\d+(?:[.,]\d+)?\s*(?:%|percent|x\b|£|\$|€)/gi;

/**
 * Career vocabulary that is not a factual claim.
 *
 * These words start a sentence or sit in a section heading, so they look like
 * capitalised entities but say nothing about the user.
 */
const GENERIC_TERMS = new Set(
  [
    'a', 'an', 'the', 'and', 'or', 'but', 'with', 'for', 'from', 'to', 'of', 'in', 'on', 'at', 'by',
    'this', 'that', 'these', 'those', 'my', 'our', 'your', 'their', 'his', 'her', 'its',
    'i', 'we', 'you', 'they', 'he', 'she',
    'name', 'title', 'role', 'company', 'employer', 'team', 'teams', 'client', 'clients',
    'project', 'projects', 'work', 'worked', 'working', 'experience', 'experiences',
    'education', 'skills', 'skill', 'certifications', 'certification', 'courses', 'course',
    'summary', 'profile', 'contact', 'details', 'responsibilities', 'objective', 'objectives',
    'section', 'sections', 'present', 'current', 'previous', 'full', 'part', 'remote', 'hybrid',
    'on-site', 'onsite', 'january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'key', 'main', 'core', 'additional', 'other', 'others', 'preferred', 'desirable',
    'requirements', 'responsibility', 'duties', 'skills', 'tools', 'technologies',
    'achievements', 'awards', 'honours', 'honors', 'volunteer', 'volunteering',
    'reference', 'references', 'availability', 'location', 'email', 'phone', 'website',
    'i am', 'we are', 'led', 'managed', 'delivered', 'developed', 'designed', 'built',
  ].map((term) => term.toLowerCase())
);

/**
 * Builds the grounding profile from the user's real records.
 */
export function buildGroundingProfile(input: {
  organisations?: string[];
  roles?: string[];
  skills?: string[];
  certifications?: string[];
  projects?: string[];
  /** Free text the user wrote: descriptions, achievements, responsibilities. */
  freeText?: string[];
}): GroundingProfile {
  const metrics = new Set<string>();
  for (const text of input.freeText ?? []) {
    for (const match of text.matchAll(METRIC_PATTERN)) {
      const value = match[0].trim();
      if (value && /\d/.test(value)) metrics.add(value.toLowerCase());
    }
  }

  return {
    organisations: unique(input.organisations ?? []),
    roles: unique(input.roles ?? []),
    skills: unique(input.skills ?? []),
    certifications: unique(input.certifications ?? []),
    projects: unique(input.projects ?? []),
    metrics: Array.from(metrics),
  };
}

/**
 * Checks a model-produced string against the user's record.
 *
 * Returns every claim that could not be found. An empty array means the
 * string is grounded.
 */
export function findUngroundedClaims(
  text: string,
  profile: GroundingProfile
): UngroundedClaim[] {
  if (!text || !text.trim()) return [];

  const haystack = buildHaystack(profile);
  const claims: UngroundedClaim[] = [];

  // --- URLs -------------------------------------------------------------
  for (const match of text.matchAll(/https?:\/\/[^\s<>()"']+/gi)) {
    const url = match[0].replace(/[.,;:]$/, '');
    if (!haystack.includes(url.toLowerCase())) {
      claims.push({ claim: url, kind: 'url' });
    }
  }

  // --- Metrics ----------------------------------------------------------
  for (const match of text.matchAll(METRIC_PATTERN)) {
    const metric = match[0].trim().toLowerCase();
    const known = profile.metrics.some(
      (value) =>
        value === metric ||
        value.replace(/\s+/g, '') === metric.replace(/\s+/g, '')
    );
    if (!known) {
      claims.push({ claim: match[0].trim(), kind: 'metric' });
    }
  }

  // --- Named entities ---------------------------------------------------
  // A capitalised run of one to four words. A run that starts a sentence is
  // usually just an ordinary verb ("Led", "Studied"), so a single
  // sentence-initial word is never treated as a name on its own.
  for (const match of text.matchAll(/\b([A-Z][A-Za-z&'.-]*(?:\s+[A-Z][A-Za-z&'.-]*){0,3})\b/g)) {
    const phrase = match[1].trim();
    if (!phrase || phrase.length < 3) continue;
    if (GENERIC_TERMS.has(phrase.toLowerCase())) continue;
    // A phrase that is entirely generic words is not a claim.
    const words = phrase.toLowerCase().split(/\s+/);
    if (words.every((word) => GENERIC_TERMS.has(word))) continue;
    // A lone capitalised word at the start of a sentence is ordinary prose.
    if (words.length === 1 && startsSentence(text, match.index ?? 0)) continue;
    if (haystack.includes(phrase.toLowerCase())) continue;
    // The word may be part of a longer known entity, e.g. "Acme" inside
    // "Acme Corporation".
    if (isPartOfKnownEntity(phrase, profile)) continue;
    claims.push({ claim: phrase, kind: 'entity' });
  }

  // De-duplicate, keeping the first occurrence of each claim.
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = claim.claim.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Removes the sentences that contain an ungrounded claim.
 *
 * The text is split on sentence boundaries, so only the offending sentence is
 * lost. The function reports what was removed so the caller can tell the user
 * instead of silently changing their document.
 */
export function stripUngroundedSentences(
  text: string,
  profile: GroundingProfile
): { text: string; removed: UngroundedClaim[] } {
  if (!text || !text.trim()) return { text: text ?? '', removed: [] };

  const sentences = text.match(/[^.!?\n]+[.!?]*\n?/g) ?? [text];
  const kept: string[] = [];
  const removed: UngroundedClaim[] = [];

  for (const sentence of sentences) {
    const claims = findUngroundedClaims(sentence, profile);
    if (claims.length > 0) {
      removed.push(...claims);
      continue;
    }
    kept.push(sentence);
  }

  if (removed.length === 0) return { text, removed: [] };

  return {
    text: kept.join('').replace(/\n{3,}/g, '\n\n').trim(),
    removed,
  };
}

/**
 * Builds the prompt rules that keep a model from inventing facts.
 *
 * These are appended to the system instruction of every route that writes
 * user-facing prose.
 */
export function groundingRules(): string {
  return [
    'GROUNDING RULES (these override any request to be creative):',
    '- Use ONLY the candidate data provided. Never invent a company, organisation, university, job title, project, client, metric, percentage, certification or course that is not in that data.',
    '- Never invent dates, numbers or achievements. If the data does not contain a metric, describe the work without a number.',
    '- If the candidate data does not contain enough to write the requested section, say exactly what is missing and stop. Do not fill the gap with an example.',
    '- Prefer rewriting what exists over creating new content. The candidate must be able to stand behind every sentence you produce.',
  ].join('\n');
}

/** Lower-cased haystack of everything the user really has. */
function buildHaystack(profile: GroundingProfile): string {
  return [
    ...profile.organisations,
    ...profile.roles,
    ...profile.skills,
    ...profile.certifications,
    ...profile.projects,
    ...profile.metrics,
  ]
    .join(' \n ')
    .toLowerCase();
}

/**
 * True when the phrase is a prefix of, or contained in, a known entity.
 *
 * "Acme" is part of "Acme Corporation", so it must not be flagged on its own.
 */
function isPartOfKnownEntity(phrase: string, profile: GroundingProfile): boolean {
  const needle = phrase.toLowerCase();
  const all = [
    ...profile.organisations,
    ...profile.roles,
    ...profile.skills,
    ...profile.certifications,
    ...profile.projects,
  ];
  return all.some(
    (entity) => entity.toLowerCase().includes(needle) && entity.toLowerCase() !== needle
  );
}

/**
 * True when the position sits at the start of a sentence.
 *
 * A capitalised word there is almost always ordinary prose, not a name.
 */
function startsSentence(text: string, index: number): boolean {
  const before = text.slice(0, index).trimEnd();
  if (before.length === 0) return true;
  const last = before[before.length - 1];
  return last === '.' || last === '!' || last === '?' || last === ':' || last === '\n';
}

/** Removes duplicates and empty entries, preserving order. */
function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
