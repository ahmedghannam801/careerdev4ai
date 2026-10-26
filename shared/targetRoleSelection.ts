/**
 * Hierarchical target-role selection — domain → specialisation.
 *
 * The platform already owns a two-level career taxonomy: `CAREER_DOMAINS`
 * (the top level) and the role catalogue (the second level, where every role
 * declares the `domainId` it belongs to). This module is the ONE place that
 * knows how to read that hierarchy, so the frontend and the API validate a
 * target-role selection the same way.
 *
 * Nothing here invents new career data: the specialisations ARE the catalogue
 * roles, and the domain of a specialisation is the role's own `domainId`.
 * That keeps the hierarchy free of duplicate taxonomies.
 *
 * Persistence note: a user's selected target role is stored on
 * `public.profiles.target_role` as the role's canonical title, exactly as
 * before this module existed. The parent domain is therefore not a second
 * stored fact — it is derived from the role through the catalogue, which is
 * the single source of truth for the hierarchy. Existing users therefore keep
 * their target role (and gain its domain) with no migration and no data reset.
 */

import { CAREER_DOMAINS, getCareerDomain, type CareerDomainId } from './careerDomains.ts';
import { CAREER_ROLES, findRoleById, findRoleByTitle, getRolesByDomain } from './careerRoles.ts';
import type { TargetRole } from './careerTypes.ts';

/** The reasons a target-role selection can be rejected. */
export type TargetRoleSelectionErrorCode =
  | 'missing_domain'
  | 'invalid_domain'
  | 'missing_specialization'
  | 'invalid_specialization'
  | 'domain_mismatch';

export interface TargetRoleSelectionError {
  code: TargetRoleSelectionErrorCode;
  message: string;
}

export type TargetRoleSelectionResult =
  | { ok: true; role: TargetRole; domainId: CareerDomainId }
  | { ok: false; error: TargetRoleSelectionError };

/** The raw input a caller may submit for a hierarchical target-role choice. */
export interface TargetRoleSelectionInput {
  /** Level 1 — the career domain slug, e.g. "business". */
  domainId?: string | null;
  /** Level 2 — the specialisation, given as a catalogue role id or title. */
  specializationId?: string | null;
  /** Level 2 — the specialisation title, when the caller has no role id. */
  specializationTitle?: string | null;
}

const ERRORS: Record<TargetRoleSelectionErrorCode, string> = {
  missing_domain: 'A career domain must be selected.',
  invalid_domain: 'The selected career domain is not part of the career taxonomy.',
  missing_specialization: 'A career specialisation must be selected.',
  invalid_specialization: 'The selected career specialisation is not part of the career taxonomy.',
  domain_mismatch:
    'The selected specialisation does not belong to the selected career domain.',
};

/** True when the value is one of the platform's career domain slugs. */
export function isCareerDomainId(value: string | null | undefined): value is CareerDomainId {
  return !!value && CAREER_DOMAINS.some((domain) => domain.slug === value);
}

/**
 * The specialisations available under a domain.
 *
 * This is the catalogue filtered by domain — never a separate list — so a
 * track can never be duplicated between the hierarchy and the catalogue.
 */
export function getCareerSpecializations(domainId: string | null | undefined): TargetRole[] {
  if (!isCareerDomainId(domainId)) return [];
  return getRolesByDomain(domainId);
}

/** Every domain that actually has at least one specialisation. */
export function getSelectableCareerDomains(): CareerDomainId[] {
  return CAREER_DOMAINS
    .filter((domain) => getRolesByDomain(domain.slug).length > 0)
    .map((domain) => domain.slug);
}

/**
 * Resolves a specialisation reference to a catalogue role.
 *
 * The reference may be a role id (the canonical form) or a role title (the
 * form the profile column has always stored).
 */
export function resolveSpecialization(
  specializationId: string | null | undefined,
  specializationTitle?: string | null
): TargetRole | undefined {
  const byId = findRoleById(specializationId ?? undefined);
  if (byId) return byId;
  const byTitle = findRoleByTitle(specializationTitle ?? specializationId ?? undefined);
  if (byTitle) return byTitle;
  return undefined;
}

/**
 * Validates a hierarchical target-role selection.
 *
 * A selection is valid only when BOTH levels are valid and the specialisation
 * genuinely belongs to the selected domain. An empty selection, an unknown
 * domain, an unknown specialisation and a specialisation from another domain
 * are all rejected.
 */
export function validateTargetRoleSelection(
  input: TargetRoleSelectionInput
): TargetRoleSelectionResult {
  const domainId = input.domainId?.trim() ?? '';
  if (!domainId) {
    return { ok: false, error: { code: 'missing_domain', message: ERRORS.missing_domain } };
  }
  if (!isCareerDomainId(domainId)) {
    return { ok: false, error: { code: 'invalid_domain', message: ERRORS.invalid_domain } };
  }

  const reference = input.specializationId?.trim() || input.specializationTitle?.trim() || '';
  if (!reference) {
    return {
      ok: false,
      error: { code: 'missing_specialization', message: ERRORS.missing_specialization },
    };
  }

  const role = resolveSpecialization(input.specializationId, input.specializationTitle);
  if (!role) {
    return {
      ok: false,
      error: { code: 'invalid_specialization', message: ERRORS.invalid_specialization },
    };
  }
  if (role.domainId !== domainId) {
    return { ok: false, error: { code: 'domain_mismatch', message: ERRORS.domain_mismatch } };
  }

  return { ok: true, role, domainId };
}

/**
 * The domain a persisted target-role reference belongs to.
 *
 * The profile stores the role's canonical title, so the parent domain is
 * recovered from the catalogue entry. `null` means the stored value is not a
 * catalogue role (a legacy free-text value) and therefore has no domain.
 */
export function resolveTargetRoleDomain(
  reference: string | null | undefined
): CareerDomainId | null {
  if (!reference) return null;
  const role = findRoleById(reference) ?? findRoleByTitle(reference);
  return role?.domainId ?? null;
}

/** The domain label for a persisted target-role reference. */
export function resolveTargetRoleDomainLabel(reference: string | null | undefined): string | null {
  const domainId = resolveTargetRoleDomain(reference);
  if (!domainId) return null;
  return getCareerDomain(domainId)?.label ?? null;
}

/**
 * The catalogue role a persisted target-role reference points at.
 *
 * Used by the API to attach the domain to a profile response without the
 * client having to re-resolve the title.
 */
export function resolveTargetRole(reference: string | null | undefined): TargetRole | undefined {
  if (!reference) return undefined;
  return findRoleById(reference) ?? findRoleByTitle(reference);
}

/**
 * A stable string for a target-role selection.
 *
 * Used as a cache key and as the identity of "the user chose this track", so
 * a domain change is always visible as a change of selection.
 */
export function targetRoleSelectionKey(domainId: string, roleId: string): string {
  return `${domainId}:${roleId}`;
}

/** Total number of specialisations across every domain. */
export const TOTAL_SPECIALIZATIONS = CAREER_ROLES.length;
