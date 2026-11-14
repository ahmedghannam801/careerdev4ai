/**
 * Matching an opportunity to the candidate — and telling them honestly what
 * it is.
 *
 * WHY THIS MODULE EXISTS
 * The Opportunities page showed a Data Analyst a construction site-operations
 * role and an emergency-care course, put "I volunteered here" on internships
 * and fellowships, listed an NGO's home page as a live vacancy, said
 * "practises 1 of the skills you still need" without saying which skill, and
 * showed Catchafire and UNICEF Egypt twice.
 *
 * Each of those is a different kind of lie:
 *
 *   - an unrelated role is not a match, whatever the keyword overlap says;
 *   - the action differs per kind, so one button cannot serve all of them;
 *   - an organisation's careers page is a directory, not a vacancy;
 *   - "1 of the skills you still need" is useless without the skill's name;
 *   - the same listing twice makes the catalogue look bigger than it is.
 *
 * The rules live here so every screen — the Opportunities page, the Career
 * Journey, the dashboard — applies the same ones.
 */

/**
 * The career domains the platform knows, and the words that name them.
 *
 * The keys are the platform's own domain slugs, so the candidate's target
 * role gives the track directly and the vocabulary never drifts from the
 * catalogue.
 *
 * A candidate's track is one of these; an opportunity that names none of them
 * and shares no skill with the candidate's gaps is not a match.
 */
export const CAREER_TRACK_KEYWORDS: Record<string, readonly string[]> = {
  data: [
    'data',
    'analytics',
    'analyst',
    'sql',
    'tableau',
    'power bi',
    'powerbi',
    'excel',
    'statistics',
    'statistical',
    'dashboard',
    'business intelligence',
    'insight',
    'machine learning',
    'data science',
  ],
  technology: [
    'software',
    'developer',
    'development',
    'web',
    'frontend',
    'front-end',
    'backend',
    'back-end',
    'full stack',
    'fullstack',
    'devops',
    'cloud',
    'qa',
    'testing',
    'cyber',
    'mobile',
    'programming',
    'coding',
    'api',
    'database',
    'network',
  ],
  engineering: [
    'mechanical',
    'civil',
    'electrical',
    'chemical',
    'construction',
    'site operations',
    'manufacturing',
    'industrial',
    'structural',
    'autocad',
    'solidworks',
    'plant',
  ],
  business: [
    'business',
    'management',
    'consulting',
    'strategy',
    'entrepreneur',
    'project management',
    'business development',
  ],
  healthcare: [
    'health',
    'medical',
    'clinical',
    'nursing',
    'nurse',
    'pharmacy',
    'critical care',
    'emergency',
    'patient',
    'hospital',
    'therapy',
    'public health',
    'care',
  ],
  'human-resources': [
    'hr',
    'human resources',
    'recruitment',
    'talent',
    'people operations',
    'staffing',
  ],
  marketing: [
    'marketing',
    'seo',
    'content',
    'brand',
    'social media',
    'advertising',
    'campaign',
  ],
  sales: [
    'sales',
    'business development',
    'account management',
    'lead generation',
    'b2b',
  ],
  finance: [
    'finance',
    'financial',
    'accounting',
    'audit',
    'tax',
    'treasury',
    'banking',
    'investment',
  ],
  legal: ['legal', 'law', 'contract', 'litigation', 'paralegal', 'attorney'],
  education: ['teaching', 'teacher', 'tutor', 'curriculum', 'classroom', 'school'],
  design: ['design', 'ux', 'ui', 'graphic', 'figma', 'illustrator', 'photoshop', 'typography'],
  product: ['product management', 'product owner', 'agile', 'scrum', 'roadmap'],
  operations: [
    'operations',
    'supply chain',
    'logistics',
    'procurement',
    'warehouse',
    'quality assurance',
  ],
  security: ['security', 'cybersecurity', 'infosec', 'soc analyst', 'penetration testing'],
};

/**
 * The vocabulary that belongs to a domain but is shared with another one.
 *
 * "Engineering" alone is not a signal: a data analyst who wants to build
 * pipelines is engineering. The words here are deliberately cross-domain and
 * are therefore never used on their own to reject an opportunity.
 */
const SHARED_DOMAIN_WORDS = new Set([
  'engineering',
  'engineer',
  'research',
  'analysis',
  'analytics',
  'project',
  'management',
  'training',
  'internship',
  'programme',
  'program',
  'care',
  'content',
  'campaign',
]);

/**
 * True when the text says the word, as a word.
 *
 * "bi" must not match "combine" and "it" must not match "wait". A phrase is
 * matched as a phrase.
 */
export function containsWord(text: string, word: string): boolean {
  const needle = word.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/** An opportunity, as the matcher needs to see it. */
export interface MatchableOpportunity {
  title: string;
  description?: string | null;
  organization?: string | null;
  kind?: string | null;
  tags?: readonly string[] | null;
  skillsGained?: readonly string[] | null;
  requiredSkills?: readonly string[] | null;
  roleSlugs?: readonly string[] | null;
  domainIds?: readonly string[] | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  deadline?: string | null;
  isActive?: boolean | null;
}

/**
 * What an opportunity actually is, from the candidate's point of view.
 *
 *   active      a specific opening, with a deadline and a way to apply;
 *   directory   an organisation's careers page, which posts openings later;
 *   expired     an opening whose deadline has passed.
 */
export type OpportunityListing = 'active' | 'directory' | 'expired';

/**
 * The URL without the noise that makes two listings look different.
 *
 * "https://www.unicef.org/careers?ref=tw" and "https://unicef.org/careers"
 * are the same page, and so are "http://" and "https://".
 */
export function canonicalUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.hostname.replace(/^www\./, '')}${path}`.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

/**
 * The identity of an opportunity listing.
 *
 * Two rows are the same listing when they are the same organisation, the same
 * title and the same page. The organisation and the title are what a reader
 * would use to tell them apart, so they come first.
 */
export function opportunityKey(opportunity: {
  organization?: string | null;
  title: string;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
}): string {
  const organization = (opportunity.organization ?? '').trim().toLowerCase();
  const title = opportunity.title.trim().toLowerCase();
  const url = canonicalUrl(opportunity.applicationUrl) || canonicalUrl(opportunity.sourceUrl);
  return `${organization}|${title}|${url}`;
}

/**
 * Removes the duplicate listings.
 *
 * The first occurrence wins, so the catalogue's own order decides which
 * record is kept.
 */
export function dedupeOpportunities<T extends MatchableOpportunity & {
  organization?: string | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
}>(opportunities: readonly T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const opportunity of opportunities) {
    const key = opportunityKey(opportunity);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(opportunity);
  }
  return kept;
}

/**
 * True when a deadline has passed.
 */
export function isExpired(
  opportunity: { deadline?: string | null; isActive?: boolean | null },
  now: Date = new Date()
): boolean {
  if (opportunity.isActive === false) return true;
  const deadline = opportunity.deadline?.trim();
  if (!deadline) return false;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < now.getTime();
}

/**
 * True when the row is an organisation's careers page rather than a vacancy.
 *
 * A directory has no specific opening, no deadline and no direct application
 * link. Listing it as a live opportunity is what made "Opportunities" look
 * full of things the candidate could not apply to.
 */
export function isOrganizationDirectory(opportunity: {
  title?: string | null;
  deadline?: string | null;
  applicationUrl?: string | null;
  sourceUrl?: string | null;
  kind?: string | null;
}): boolean {
  if (opportunity.deadline?.trim()) return false;

  // A specific programme has a deadline even when the deadline is open-ended.
  const title = (opportunity.title ?? '').trim().toLowerCase();
  const looksLikeAPage =
    /(^|\b)(careers?|jobs?|vacancies|opportunit(y|ies)|work with us|join us)\b/.test(title) &&
    !/\b(programme|program|internship|fellowship|competition|scholarship|volunteer)\b/.test(title);
  if (looksLikeAPage) return true;

  // A bare home page is a directory.
  const url = canonicalUrl(opportunity.applicationUrl) || canonicalUrl(opportunity.sourceUrl);
  if (!url) return true;
  return !/[/?#]/.test(url) && !/\/(careers?|jobs?|vacancies)\b/.test(url);
}

/**
 * Classifies the listing.
 */
export function opportunityListing(
  opportunity: {
    title?: string | null;
    deadline?: string | null;
    applicationUrl?: string | null;
    sourceUrl?: string | null;
    kind?: string | null;
    isActive?: boolean | null;
  },
  now: Date = new Date()
): OpportunityListing {
  if (isExpired(opportunity, now)) return 'expired';
  if (isOrganizationDirectory(opportunity)) return 'directory';
  return 'active';
}

/** The action a candidate takes for a kind of opportunity. */
export interface OpportunityCta {
  /** The button's label. */
  label: string;
  /** The label once the candidate has recorded it. */
  doneLabel: string;
  /** The states the candidate can move through. */
  statuses: readonly string[];
  /** The state the card starts in. */
  initialStatus: string;
}

const CTA_BY_KIND: Record<string, OpportunityCta> = {
  internship: {
    label: 'Apply / Record Application',
    doneLabel: 'Application recorded',
    statuses: ['Applied'],
    initialStatus: 'Applied',
  },
  competition: {
    label: 'Join / Record Participation',
    doneLabel: 'Participation recorded',
    statuses: ['Participated'],
    initialStatus: 'Participated',
  },
  fellowship: {
    label: 'Apply / Track Fellowship',
    doneLabel: 'Fellowship tracked',
    statuses: ['Applied', 'Accepted', 'Completed'],
    initialStatus: 'Applied',
  },
  academic: {
    label: 'Enroll / Track Programme',
    doneLabel: 'Enrolment tracked',
    statuses: ['Enrolled', 'Completed'],
    initialStatus: 'Enrolled',
  },
  volunteering: {
    label: 'I volunteered here',
    doneLabel: 'Volunteering recorded',
    statuses: ['Volunteered'],
    initialStatus: 'Volunteered',
  },
};

/** The default CTA, for a kind the platform does not know. */
export const DEFAULT_OPPORTUNITY_CTA: OpportunityCta = {
  label: 'Record this',
  doneLabel: 'Recorded',
  statuses: ['Recorded'],
  initialStatus: 'Recorded',
};

/**
 * The action and the states that belong to this kind of opportunity.
 *
 * "I volunteered here" on a fellowship is not a label problem: it tells the
 * candidate the wrong thing about what recording it will do to their
 * pipeline.
 */
export function opportunityCta(kind: string | null | undefined): OpportunityCta {
  const key = (kind ?? '').trim().toLowerCase();
  return CTA_BY_KIND[key] ?? DEFAULT_OPPORTUNITY_CTA;
}

/**
 * The words that describe the opportunity.
 */
export function opportunityText(opportunity: MatchableOpportunity): string {
  return [
    opportunity.title,
    opportunity.description,
    opportunity.organization,
    (opportunity.tags ?? []).join(' '),
    (opportunity.skillsGained ?? []).join(' '),
    (opportunity.requiredSkills ?? []).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * The candidate's own words: their gaps and their target role.
 */
export interface CandidateMatchContext {
  /** The skills the candidate still needs. */
  gapSkills: readonly string[];
  /** The candidate's target role title. */
  targetRoleTitle?: string | null;
  /** The candidate's career track. */
  track?: string | null;
}

/**
 * The gaps this opportunity actually practises.
 *
 * The card used to say "practises 1 of the skills you still need" and leave
 * the reader to guess which one. The name is the whole value of the badge.
 */
export function matchedGapSkills(
  opportunity: MatchableOpportunity,
  gapSkills: readonly string[]
): string[] {
  const practised = [
    ...(opportunity.skillsGained ?? []),
    ...(opportunity.requiredSkills ?? []),
    ...(opportunity.tags ?? []),
  ]
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);

  if (practised.length === 0) return [];

  const matched: string[] = [];
  for (const gap of gapSkills) {
    const needle = gap.trim().toLowerCase();
    if (!needle) continue;
    const hit = practised.some(
      (skill) =>
        skill === needle ||
        skill.includes(needle) ||
        needle.includes(skill) ||
        // "data analysis" and "data analyst" are the same area.
        needle.replace(/s$/, '') === skill.replace(/s$/, '')
    );
    if (hit && !matched.includes(gap)) matched.push(gap);
  }
  return matched;
}

/**
 * True when the opportunity belongs to the candidate's field.
 *
 * The rule is deliberately strict in both directions:
 *
 *   - an opportunity that names the candidate's own track is a match;
 *   - an opportunity that practises one of the candidate's gaps is a match;
 *   - an opportunity that names a DIFFERENT track explicitly is not a match,
 *     however many words it shares with the candidate's role — that is how a
 *     construction role ended up in front of a Data Analyst;
 *   - an opportunity that says nothing about its field is a match only when
 *     it practises one of the candidate's gaps.
 */
export function matchesCandidate(
  opportunity: MatchableOpportunity,
  context: CandidateMatchContext
): boolean {
  const gaps = matchedGapSkills(opportunity, context.gapSkills);
  if (gaps.length > 0) return true;

  const text = opportunityText(opportunity);

  // The candidate's own role is the strongest signal.
  const role = (context.targetRoleTitle ?? '').trim().toLowerCase();
  if (role && role.length > 2 && containsWord(text, role)) return true;

  const track = (context.track ?? '').trim().toLowerCase();
  if (!track) return false;

  const own = CAREER_TRACK_KEYWORDS[track] ?? [];
  if (own.some((word) => containsWord(text, word))) return true;

  // Does it name a track the candidate is not in?
  for (const [otherTrack, words] of Object.entries(CAREER_TRACK_KEYWORDS)) {
    if (otherTrack === track) continue;
    const explicit = words.some(
      (word) =>
        !SHARED_DOMAIN_WORDS.has(word.trim()) && containsWord(text, word)
    );
    if (explicit) return false;
  }

  return false;
}
