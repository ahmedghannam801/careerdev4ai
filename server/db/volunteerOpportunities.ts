/**
 * Volunteer opportunities.
 *
 * The platform could already record a volunteer stint the user had done
 * (`public.volunteer_experiences`). It had no way to show opportunities a
 * user could apply to, so the volunteer page was a form with nothing behind
 * it.
 *
 * This module reads the real catalogue in `public.volunteer_opportunities` and
 * ranks it for the signed-in user using three signals, in order of strength:
 *
 *   1. the opportunity's skills match the user's OPEN skill gaps, so it
 *      directly moves them towards their target role;
 *   2. the opportunity is tagged for the user's target role;
 *   3. the opportunity is tagged for the user's role domain.
 *
 * Ranking never removes a row. A user can always browse the full catalogue,
 * and the reason for the ranking is shown next to each opportunity so the
 * ordering is explainable rather than mysterious.
 */

import { getSupabaseServer } from './supabase';
import { getProfileDto } from './profile.ts';
import { getUserSkills } from './userSkills.ts';
import { resolveRole } from '../../shared/careerRoles.ts';
import {
  computeSkillGaps,
  normalizeSkillName,
  openSkillGaps,
  toRoleSkillRequirements,
  type RatedSkill,
} from '../../shared/skillGap.ts';

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
  /** 0..100. Higher means a stronger match for this user. */
  relevance: number;
  /** Why this opportunity was ranked where it was. Null when it is general. */
  relevanceReason: string | null;
  /** True when the opportunity addresses one of the user's open skill gaps. */
  closesGap: boolean;
  saved: boolean;
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
}

/**
 * Lists the catalogue, ranked for this user.
 */
export async function listVolunteerOpportunities(
  profileId: string
): Promise<VolunteerOpportunityDTO[]> {
  const [opportunitiesResult, savesResult] = await Promise.all([
    getSupabaseServer()
      .from('volunteer_opportunities')
      .select(
        'id, title, organization, description, category, location, is_remote, commitment, application_url, skills_gained, required_skills, role_slugs, domain_ids, verification_status, verified_at'
      )
      .eq('is_active', true)
      .order('organization', { ascending: true }),
    getSupabaseServer()
      .from('volunteer_opportunity_saves')
      .select('opportunity_id')
      .eq('profile_id', profileId),
  ]);

  if (opportunitiesResult.error) throw opportunitiesResult.error;

  const rows = (opportunitiesResult.data ?? []) as OpportunityRow[];
  const savedIds = new Set(
    ((savesResult.data ?? []) as Array<{ opportunity_id: string }>).map(
      (row) => row.opportunity_id
    )
  );

  const context = await loadUserContext(profileId);

  const ranked = rows.map((row) => {
    const relevance = scoreOpportunity(row, context);
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
      skillsGained: row.skills_gained ?? [],
      requiredSkills: row.required_skills ?? [],
      roleSlugs: row.role_slugs ?? [],
      domainIds: row.domain_ids ?? [],
      verificationStatus: row.verification_status,
      verifiedAt: row.verified_at,
      relevance: relevance.score,
      relevanceReason: relevance.reason,
      closesGap: relevance.closesGap,
      saved: savedIds.has(row.id),
    };
  });

  // Relevance first, then organisation so the order is stable.
  ranked.sort((a, b) => b.relevance - a.relevance || a.organization.localeCompare(b.organization));
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

/** The user context used to rank the catalogue. */
interface RankingContext {
  roleId: string | null;
  roleTitle: string | null;
  domainId: string | null;
  /** Normalised names of the skills the user still needs. */
  gapSkillKeys: Set<string>;
  /** The role's own requirement names, for a weaker "relevant" signal. */
  roleSkillKeys: Set<string>;
}

async function loadUserContext(profileId: string): Promise<RankingContext> {
  const empty: RankingContext = {
    roleId: null,
    roleTitle: null,
    domainId: null,
    gapSkillKeys: new Set(),
    roleSkillKeys: new Set(),
  };

  const profile = await getProfileDto(profileId).catch(() => null);
  const roleReference = profile?.targetRole ?? null;
  if (!roleReference) return empty;

  const role = resolveRole(roleReference);
  if (!role) return empty;

  const skills = await getUserSkills(profileId).catch(() => []);
  const rated: RatedSkill[] = skills
    .map((row) => ({ name: row.skill?.name ?? '', level: row.proficiency ?? 1 }))
    .filter((skill) => Boolean(skill.name));

  const requirements = toRoleSkillRequirements(role);
  const gaps = computeSkillGaps(requirements, rated);
  const open = openSkillGaps(gaps);

  return {
    roleId: role.id,
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
  if (!context.roleId) {
    return { score: 0, reason: null, closesGap: false };
  }

  const gained = (row.skills_gained ?? []).map(normalizeSkillName).filter(Boolean);
  const required = (row.required_skills ?? []).map(normalizeSkillName).filter(Boolean);
  const offered = new Set([...gained, ...required]);

  const gapHits = [...offered].filter((key) => context.gapSkillKeys.has(key));
  const roleHits = [...offered].filter((key) => context.roleSkillKeys.has(key));

  let score = 0;
  let reason: string | null = null;
  let closesGap = false;

  if (gapHits.length > 0) {
    // The strongest signal: this volunteering exercises exactly what the user
    // is missing for their target role.
    const contribution = Math.min(55, 18 + gapHits.length * 12);
    score += contribution;
    closesGap = true;
    reason = `Practises ${gapHits.length} of the skills you still need for ${context.roleTitle}.`;
  }

  if ((row.role_slugs ?? []).includes(context.roleId)) {
    score += 30;
    if (!reason) reason = `Matched to your target role, ${context.roleTitle}.`;
  }

  if (context.domainId && (row.domain_ids ?? []).includes(context.domainId)) {
    score += 15;
    if (!reason) reason = 'Matches the domain of your target role.';
  }

  if (roleHits.length > 0) {
    score += Math.min(15, roleHits.length * 5);
    if (!reason) reason = 'Uses skills this role asks for.';
  }

  return { score: Math.min(100, score), reason, closesGap };
}
