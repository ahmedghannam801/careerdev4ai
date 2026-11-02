/**
 * Opportunities & Activities.
 *
 * The platform began with a volunteering catalogue. It now serves the wider
 * ecosystem a student or graduate browses: volunteering, student activities,
 * youth programmes, career development, competitions, entrepreneurship,
 * fellowships, internships, academic and technology programmes.
 *
 * Ranking uses the user's own signals, in order of strength:
 *
 *   1. the opportunity's skills match the user's OPEN skill gaps;
 *   2. it is tagged for the user's target role (or one of their saved roles);
 *   3. it matches a skill the user's roadmap is working on;
 *   4. its interest tags match the user's target industry or the subjects they
 *      are already learning;
 *   5. its audience matches the user's account type;
 *   6. it is a local Egypt / Arabic programme.
 *
 * Ranking never removes a live row. Expired rows are hidden because they are
 * no longer actionable; the full live catalogue is always browsable.
 */

import { getSupabaseServer } from './supabase';
import { getProfileDto } from './profile.ts';
import { getPreferences } from './preferences.ts';
import { getUserSkills } from './userSkills.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import {
  computeSkillGaps,
  normalizeSkillName,
  openSkillGaps,
  toRoleSkillRequirements,
  type RatedSkill,
} from '../../shared/skillGap.ts';
import {
  isLiveOpportunity,
  isOpportunityAudience,
  isOpportunityKind,
  isOpportunityVerificationStatus,
  isParticipationMode,
  kindForCategory,
  type OpportunityAudience,
  type OpportunityKind,
  type ParticipationMode,
} from '../../shared/opportunities.ts';

export interface VolunteerOpportunityDTO {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: string;
  location: string;
  isRemote: boolean;
  commitment: string | null;
  applicationUrl: string;
  skillsGained: string[];
  requiredSkills: string[];
  roleSlugs: string[];
  domainIds: string[];
  verificationStatus: string;
  verifiedAt: string | null;
  /** Where the opportunity is based: 'Egypt', 'Global', ... */
  country: string;
  /** Languages the programme runs in. */
  languages: string[];
  /** 'ongoing' | 'program' | 'remote' | 'event'. */
  opportunityType: string;
  /** An application deadline, when the organisation publishes one. */
  deadline: string | null;
  /** The broader ecosystem category. */
  kind: OpportunityKind;
  /** How a participant takes part. */
  participationMode: ParticipationMode;
  /** Who the opportunity is aimed at. */
  audiences: OpportunityAudience[];
  /** The organisation's published eligibility, when it states one. */
  eligibility: string | null;
  /** The organisation's own catalogue/source page. */
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  organizationType: string | null;
  /** Interest filters such as technology, business, hr, data, ai. */
  tags: string[];
  isFeatured: boolean;
  /** 0..100. Higher means a stronger match for this user. */
  relevance: number;
  /** Why this opportunity was ranked where it was. Null when it is general. */
  relevanceReason: string | null;
  /** True when the opportunity addresses one of the user's open skill gaps. */
  closesGap: boolean;
  saved: boolean;
  /** True while the deadline is in the future (or the programme is rolling). */
  live: boolean;
}

interface OpportunityRow {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: string;
  location: string;
  is_remote: boolean;
  commitment: string | null;
  application_url: string;
  skills_gained: string[] | null;
  required_skills: string[] | null;
  role_slugs: string[] | null;
  domain_ids: string[] | null;
  verification_status: string;
  verified_at: string | null;
  country: string | null;
  languages: string[] | null;
  opportunity_type: string | null;
  deadline: string | null;
  opportunity_kind: string | null;
  participation_mode: string | null;
  audience: string[] | null;
  eligibility: string | null;
  source_url: string | null;
  thumbnail_url: string | null;
  organization_type: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  is_active: boolean;
}

const OPPORTUNITY_COLUMNS =
  'id, title, organization, description, category, location, is_remote, commitment, application_url, skills_gained, required_skills, role_slugs, domain_ids, verification_status, verified_at, country, languages, opportunity_type, deadline, opportunity_kind, participation_mode, audience, eligibility, source_url, thumbnail_url, organization_type, tags, is_featured, is_active';

function toOpportunity(
  row: OpportunityRow,
  savedIds: Set<string>,
  relevance: { score: number; reason: string | null; closesGap: boolean } = {
    score: 0,
    reason: null,
    closesGap: false,
  }
): VolunteerOpportunityDTO {
  const kind: OpportunityKind =
    row.opportunity_kind && isOpportunityKind(row.opportunity_kind)
      ? row.opportunity_kind
      : kindForCategory(row.category);
  const participationMode: ParticipationMode =
    row.participation_mode && isParticipationMode(row.participation_mode)
      ? row.participation_mode
      : row.is_remote
        ? 'online'
        : 'onsite';

  return {
    id: row.id,
    title: row.title,
    organization: row.organization,
    description: row.description,
    category: row.category,
    location: row.location,
    isRemote: row.is_remote,
    commitment: row.commitment,
    applicationUrl: row.application_url,
    skillsGained: Array.from(new Set(row.skills_gained ?? [])),
    requiredSkills: Array.from(new Set(row.required_skills ?? [])),
    roleSlugs: Array.from(new Set(row.role_slugs ?? [])),
    domainIds: Array.from(new Set(row.domain_ids ?? [])),
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    country: row.country ?? 'Global',
    languages: Array.from(new Set(row.languages ?? [])),
    opportunityType: row.opportunity_type ?? 'ongoing',
    deadline: row.deadline,
    kind,
    participationMode,
    audiences: Array.from(new Set((row.audience ?? []).filter(isOpportunityAudience))),
    eligibility: row.eligibility,
    sourceUrl: row.source_url ?? row.application_url,
    thumbnailUrl: row.thumbnail_url,
    organizationType: row.organization_type,
    tags: Array.from(new Set((row.tags ?? []).map(normalizeTag).filter(Boolean))),
    isFeatured: Boolean(row.is_featured),
    relevance: relevance.score,
    relevanceReason: relevance.reason,
    closesGap: relevance.closesGap,
    saved: savedIds.has(row.id),
    live: isLiveOpportunity({ isActive: row.is_active, deadline: row.deadline }),
  };
}

/** Lowercases and folds the few synonyms the older catalogue used. */
function normalizeTag(value: string): string {
  const tag = (value ?? '').trim().toLowerCase().replace(/&/g, 'and');
  if (!tag) return '';
  if (tag === 'human-resources' || tag === 'human resources' || tag === 'people') return 'hr';
  if (tag === 'software' || tag === 'engineering' || tag === 'tech') return 'technology';
  if (tag === 'analytics') return 'data';
  if (tag === 'growth' || tag === 'public-relations' || tag === 'public relations') {
    return tag === 'public-relations' || tag === 'public relations' ? 'pr' : 'marketing';
  }
  if (tag === 'startup' || tag === 'startups') return 'entrepreneurship';
  if (tag === 'competition' || tag === 'hackathon') return 'competitions';
  if (tag === 'internship') return 'internships';
  if (tag === 'student-activities' || tag === 'student activity') return 'student-activities';
  return tag;
}

/** Maps a profile's human-readable industry onto the catalogue's tags. */
function industryTags(value: string | null): string[] {
  const industry = (value ?? '').toLowerCase();
  if (!industry) return [];
  const tags: string[] = [];
  if (industry.includes('technology') || industry.includes('software')) tags.push('technology');
  if (industry.includes('data') || industry.includes('analytics')) tags.push('data');
  if (industry.includes('ai') || industry.includes('artificial')) tags.push('ai');
  if (industry.includes('human resources') || industry.includes('people')) tags.push('hr');
  if (industry.includes('business') || industry.includes('management')) tags.push('business');
  if (industry.includes('marketing') || industry.includes('growth')) tags.push('marketing');
  if (industry.includes('finance') || industry.includes('accounting')) tags.push('finance');
  if (industry.includes('education') || industry.includes('training')) tags.push('education');
  if (industry.includes('health')) tags.push('healthcare');
  if (industry.includes('design') || industry.includes('creative')) tags.push('design');
  return tags;
}

/** Maps a learning catalogue category onto the same tags. */
function categoryTags(value: string | null): string[] {
  const category = (value ?? '').toLowerCase();
  if (!category) return [];
  const tags: string[] = [];
  if (category.includes('data') || category.includes('sql') || category.includes('analytics')) {
    tags.push('data');
  }
  if (
    category.includes('web') ||
    category.includes('programming') ||
    category.includes('software') ||
    category.includes('cloud') ||
    category.includes('cyber')
  ) {
    tags.push('technology');
  }
  if (category.includes('ai') || category.includes('machine learning')) tags.push('ai');
  if (category.includes('marketing') || category.includes('seo') || category.includes('social')) {
    tags.push('marketing');
  }
  if (category.includes('business') || category.includes('management')) tags.push('business');
  if (category.includes('hr') || category.includes('human')) tags.push('hr');
  if (category.includes('design')) tags.push('design');
  return tags;
}

/** The user context used to rank the catalogue. */
interface RankingContext {
  roleIds: Set<string>;
  roleTitle: string | null;
  domainId: string | null;
  /** The interface language, so the reason is written in the user's language. */
  language: 'en' | 'ar';
  /** Normalised names of the skills the user still needs. */
  gapSkillKeys: Set<string>;
  /** The role's own requirement names, for a weaker "relevant" signal. */
  roleSkillKeys: Set<string>;
  /** Skills the user's current roadmap is working on. */
  roadmapSkillKeys: Set<string>;
  /** Interest tags inferred from the target industry and current learning. */
  interestTags: Set<string>;
  /** The audiences the account type corresponds to. */
  audienceKeys: Set<OpportunityAudience>;
}

async function loadRoadmapSkillKeys(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseServer();
  const keys = new Set<string>();
  try {
    const { data: roadmaps } = await supabase
      .from('roadmaps')
      .select('id')
      .eq('profile_id', profileId);
    const roadmapIds = ((roadmaps ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (roadmapIds.length === 0) return keys;

    const { data: phases } = await supabase
      .from('roadmap_phases')
      .select('id')
      .in('roadmap_id', roadmapIds);
    const phaseIds = ((phases ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (phaseIds.length === 0) return keys;

    const { data: milestones } = await supabase
      .from('roadmap_milestones')
      .select('id')
      .in('phase_id', phaseIds);
    const milestoneIds = ((milestones ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (milestoneIds.length === 0) return keys;

    const { data: tasks } = await supabase
      .from('roadmap_tasks')
      .select('skill_name, skill_names')
      .in('milestone_id', milestoneIds);
    for (const task of (tasks ?? []) as Array<{
      skill_name: string | null;
      skill_names: string[] | null;
    }>) {
      for (const name of [task.skill_name, ...(task.skill_names ?? [])]) {
        if (name) keys.add(normalizeSkillName(name));
      }
    }
  } catch {
    // Ranking stays useful without roadmap history.
  }
  return keys;
}

async function loadLearningInterestTags(profileId: string): Promise<Set<string>> {
  const supabase = getSupabaseServer();
  const tags = new Set<string>();
  try {
    const { data: items } = await supabase
      .from('user_learning_items')
      .select('course_id, status')
      .eq('profile_id', profileId);
    const rows = (items ?? []) as Array<{ course_id: string; status: string }>;
    const courseIds = rows.map((row) => row.course_id);
    if (courseIds.length === 0) return tags;
    const { data: courses } = await supabase
      .from('courses')
      .select('id, category')
      .in('id', courseIds);
    for (const course of (courses ?? []) as Array<{ category: string }>) {
      for (const tag of categoryTags(course.category)) tags.add(tag);
    }
    // Completed learning is a stronger interest than a dismissed course; the
    // tag set is the same either way, so it is only used as a light signal.
  } catch {
    // Ignore: interest matching is a bonus, not a gate.
  }
  return tags;
}

function audienceForUserType(userType: string | null): Set<OpportunityAudience> {
  const result = new Set<OpportunityAudience>();
  switch ((userType ?? '').toLowerCase()) {
    case 'student':
      result.add('university_students');
      break;
    case 'fresh_graduate':
    case 'graduate':
      result.add('fresh_graduates');
      break;
    case 'working_professional':
    case 'working':
    case 'career_switcher':
    case 'career_shift':
      result.add('professionals');
      break;
    case 'exploring':
      result.add('youth');
      break;
    default:
      break;
  }
  return result;
}

async function loadUserContext(profileId: string): Promise<RankingContext> {
  const [preferences, profile, skills, roadmapSkillKeys, learningTags, savedRolesResult] =
    await Promise.all([
      getPreferences(profileId).catch(() => null),
      getProfileDto(profileId).catch(() => null),
      getUserSkills(profileId).catch(() => []),
      loadRoadmapSkillKeys(profileId),
      loadLearningInterestTags(profileId),
      getSupabaseServer()
        .from('saved_roles')
        .select('role_id, title')
        .eq('profile_id', profileId)
        .then((result) => result.data ?? []),
    ]);

  const language: 'en' | 'ar' = preferences?.language === 'ar' ? 'ar' : 'en';
  const empty: RankingContext = {
    roleIds: new Set(),
    roleTitle: null,
    domainId: null,
    language,
    gapSkillKeys: new Set(),
    roleSkillKeys: new Set(),
    roadmapSkillKeys,
    interestTags: new Set([...industryTags(profile?.targetIndustry ?? null), ...learningTags]),
    audienceKeys: audienceForUserType(profile?.userType ?? null),
  };

  const roleReference = profile?.targetRole ?? null;
  const role = roleReference ? resolveRole(roleReference) : null;

  const roleIds = new Set<string>();
  if (role) roleIds.add(role.id);
  for (const saved of savedRolesResult as Array<{ role_id: string }>) {
    if (saved.role_id) roleIds.add(saved.role_id);
  }

  if (!role) {
    return { ...empty, roleIds };
  }

  const rated: RatedSkill[] = (skills as Array<{ skill?: { name?: string }; proficiency?: number }>)
    .map((row) => ({ name: row.skill?.name ?? '', level: row.proficiency ?? 1 }))
    .filter((skill) => Boolean(skill.name));

  const requirements = toRoleSkillRequirements(role);
  const gaps = computeSkillGaps(requirements, rated);
  const open = openSkillGaps(gaps);

  return {
    ...empty,
    roleIds,
    roleTitle: role.title,
    domainId: role.domainId ?? null,
    gapSkillKeys: new Set(open.map((gap) => normalizeSkillName(gap.name))),
    roleSkillKeys: new Set(
      requirements.requiredSkills.map((skill) => normalizeSkillName(skill.name))
    ),
  };
}

/**
 * Scores one opportunity against the user's context.
 *
 * The score is a sum of independent signals, capped at 100. The reason names
 * the strongest signal that fired, so the UI can explain the ordering.
 */
function scoreOpportunity(
  row: OpportunityRow,
  context: RankingContext
): { score: number; reason: string | null; closesGap: boolean } {
  const gained = (row.skills_gained ?? []).map(normalizeSkillName).filter(Boolean);
  const required = (row.required_skills ?? []).map(normalizeSkillName).filter(Boolean);
  const offered = new Set([...gained, ...required]);

  const gapHits = [...offered].filter((key) => context.gapSkillKeys.has(key));
  const roleHits = [...offered].filter((key) => context.roleSkillKeys.has(key));
  const roadmapHits = [...offered].filter((key) => context.roadmapSkillKeys.has(key));
  const rowTags = new Set((row.tags ?? []).map(normalizeTag).filter(Boolean));
  const interestHits = [...rowTags].filter((tag) => context.interestTags.has(tag));
  const audienceHits = (row.audience ?? []).filter((audience) =>
    context.audienceKeys.has(audience as OpportunityAudience)
  );

  let score = 0;
  let reason: string | null = null;
  let closesGap = false;
  const arabic = context.language === 'ar';

  if (gapHits.length > 0) {
    // The strongest signal: this opportunity exercises exactly what the user
    // is missing for their target role.
    const contribution = Math.min(55, 18 + gapHits.length * 12);
    score += contribution;
    closesGap = true;
    reason = arabic
      ? `تتيح لك التدرّب على مهارات ما زلت تحتاجها لدور ${context.roleTitle ?? ''}.`
      : `Practises ${gapHits.length} of the skills you still need${
          context.roleTitle ? ` for ${context.roleTitle}` : ''
        }.`;
  }

  if (roadmapHits.length > 0) {
    score += Math.min(24, 10 + roadmapHits.length * 7);
    if (!reason) {
      reason = arabic
        ? 'يخدم مهارة يعمل عليها خطتك الحالية.'
        : 'Advances a skill your current roadmap is working on.';
    }
  }

  const roleMatch = [...context.roleIds].some((roleId) =>
    (row.role_slugs ?? []).includes(roleId)
  );
  if (roleMatch) {
    score += 30;
    if (!reason) {
      reason = arabic
        ? `مرتبطة بدورك المستهدف${context.roleTitle ? `: ${context.roleTitle}` : ''}.`
        : `Matched to your target role${context.roleTitle ? `, ${context.roleTitle}` : ''}.`;
    }
  }

  if (context.domainId && (row.domain_ids ?? []).includes(context.domainId)) {
    score += 15;
    if (!reason) {
      reason = arabic
        ? 'تقع في مجال دورك المستهدف.'
        : 'Matches the domain of your target role.';
    }
  }

  if (roleHits.length > 0) {
    score += Math.min(15, roleHits.length * 5);
    if (!reason) {
      reason = arabic ? 'تستخدم مهارات يطلبها هذا الدور.' : 'Uses skills this role asks for.';
    }
  }

  if (interestHits.length > 0) {
    score += Math.min(16, 6 + interestHits.length * 4);
    if (!reason) {
      reason = arabic
        ? 'يتوافق مع مجال اهتمامك وما تتعلمه حاليًا.'
        : 'Matches your field of interest and what you are already learning.';
    }
  }

  if (audienceHits.length > 0) {
    score += 8;
    if (!reason) {
      reason = arabic
        ? 'موجه للفئة التي تنتمي إليها.'
        : 'Aimed at your stage of study or career.';
    }
  }

  // Local relevance. The platform is built for beginners in Egypt and the
  // Arab region, so an Egypt-based programme is easier to act on than a
  // global one, and an Arabic-language programme is easier to join. This is
  // a tie-breaker: it never outweighs a real skill or role match.
  if ((row.country ?? 'Global') === 'Egypt') {
    score += 10;
    if (!reason) {
      reason = arabic
        ? 'برنامج في مصر يمكنك الانضمام إليه محليًا.'
        : 'An Egypt-based programme you can join locally.';
    }
  } else if ((row.languages ?? []).includes('Arabic')) {
    score += 5;
    if (!reason) {
      reason = arabic
        ? 'متاح بالعربية، فتبدأ دون حاجز لغوي.'
        : 'Available in Arabic, so you can start without a language barrier.';
    }
  }

  if (row.is_featured) score += 2;

  return { score: Math.min(100, score), reason, closesGap };
}

/**
 * Lists the live catalogue, ranked for this user.
 *
 * Expired rows are excluded: a deadline in the past is not an opportunity. An
 * inactive row is excluded for the same reason. Nothing else is hidden.
 */
export async function listVolunteerOpportunities(
  profileId: string
): Promise<VolunteerOpportunityDTO[]> {
  const [opportunitiesResult, savesResult] = await Promise.all([
    getSupabaseServer()
      .from('volunteer_opportunities')
      .select(OPPORTUNITY_COLUMNS)
      .eq('is_active', true)
      // The catalogue is scoped to what this product offers: opportunities in
      // Egypt and opportunities that can be done online or hybrid from
      // anywhere. An on-site role in another country is not actionable here.
      .or('country.eq.Egypt,is_remote.eq.true,participation_mode.eq.online,participation_mode.eq.hybrid')
      .order('is_featured', { ascending: false })
      .order('organization', { ascending: true }),
    getSupabaseServer()
      .from('volunteer_opportunity_saves')
      .select('opportunity_id')
      .eq('profile_id', profileId),
  ]);

  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const rows = ((opportunitiesResult.data ?? []) as OpportunityRow[]).filter((row) =>
    isLiveOpportunity({ isActive: row.is_active, deadline: row.deadline })
  );
  const savedIds = new Set(
    ((savesResult.data ?? []) as Array<{ opportunity_id: string }>).map(
      (row) => row.opportunity_id
    )
  );

  const context = await loadUserContext(profileId);

  const ranked = rows.map((row) => {
    const relevance = scoreOpportunity(row, context);
    return toOpportunity(row, savedIds, relevance);
  });

  // Relevance first, then a featured tie-break, then organisation so the order
  // is stable.
  ranked.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      Number(b.isFeatured) - Number(a.isFeatured) ||
      a.organization.localeCompare(b.organization)
  );
  return ranked;
}

/** Saves an opportunity for the user. */
export async function saveVolunteerOpportunity(
  profileId: string,
  opportunityId: string
): Promise<boolean> {
  const { error } = await getSupabaseServer()
    .from('volunteer_opportunity_saves')
    .upsert(
      { profile_id: profileId, opportunity_id: opportunityId },
      { onConflict: 'profile_id,opportunity_id' }
    );
  if (error) throw error;
  return true;
}

/** Removes a saved opportunity. */
export async function unsaveVolunteerOpportunity(
  profileId: string,
  opportunityId: string
): Promise<boolean> {
  const { error } = await getSupabaseServer()
    .from('volunteer_opportunity_saves')
    .delete()
    .eq('profile_id', profileId)
    .eq('opportunity_id', opportunityId);
  if (error) throw error;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Administration                                                             */
/* -------------------------------------------------------------------------- */

/** The whole catalogue, including inactive and expired rows, for an admin. */
export async function listOpportunitiesForAdmin(): Promise<VolunteerOpportunityDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('volunteer_opportunities')
    .select(OPPORTUNITY_COLUMNS)
    .order('is_active', { ascending: false })
    .order('organization', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as OpportunityRow[]).map((row) => toOpportunity(row, new Set()));
}

export interface AdminOpportunityPatch {
  isActive?: boolean;
  verificationStatus?: string;
  verifiedAt?: string | null;
  isFeatured?: boolean;
  deadline?: string | null;
  kind?: OpportunityKind;
  participationMode?: ParticipationMode;
  audiences?: OpportunityAudience[];
  eligibility?: string | null;
  sourceUrl?: string | null;
  thumbnailUrl?: string | null;
  organizationType?: string | null;
  tags?: string[];
  title?: string;
  description?: string;
  location?: string;
  commitment?: string | null;
}

export async function updateOpportunityForAdmin(
  id: string,
  patch: AdminOpportunityPatch
): Promise<VolunteerOpportunityDTO | null> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.verificationStatus !== undefined) {
    if (!isOpportunityVerificationStatus(patch.verificationStatus)) {
      throw new Error('Unknown verification status');
    }
    update.verification_status = patch.verificationStatus;
  }
  if (patch.verifiedAt !== undefined) update.verified_at = patch.verifiedAt;
  if (patch.isFeatured !== undefined) update.is_featured = patch.isFeatured;
  if (patch.deadline !== undefined) update.deadline = patch.deadline;
  if (patch.kind !== undefined) {
    if (!isOpportunityKind(patch.kind)) throw new Error('Unknown opportunity kind');
    update.opportunity_kind = patch.kind;
  }
  if (patch.participationMode !== undefined) {
    if (!isParticipationMode(patch.participationMode)) {
      throw new Error('Unknown participation mode');
    }
    update.participation_mode = patch.participationMode;
  }
  if (patch.audiences !== undefined) {
    update.audience = patch.audiences.filter(isOpportunityAudience);
  }
  if (patch.eligibility !== undefined) update.eligibility = patch.eligibility;
  if (patch.sourceUrl !== undefined) update.source_url = patch.sourceUrl;
  if (patch.thumbnailUrl !== undefined) update.thumbnail_url = patch.thumbnailUrl;
  if (patch.organizationType !== undefined) {
    update.organization_type = patch.organizationType;
  }
  if (patch.tags !== undefined) update.tags = patch.tags.map(normalizeTag).filter(Boolean);
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.location !== undefined) update.location = patch.location;
  if (patch.commitment !== undefined) update.commitment = patch.commitment;

  const { data, error } = await getSupabaseServer()
    .from('volunteer_opportunities')
    .update(update)
    .eq('id', id)
    .select(OPPORTUNITY_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toOpportunity(data as OpportunityRow, new Set()) : null;
}
