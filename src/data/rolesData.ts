/**
 * The career role catalogue.
 *
 * The catalogue itself now lives in `shared/careerRoles.ts` so that the
 * frontend and the API resolve exactly the same roles. This module stays as
 * the frontend's import path — `import { TARGET_ROLES } from '../data/rolesData'`
 * — so no existing consumer has to change.
 */

export {
  TARGET_ROLES,
  CAREER_ROLES,
  findRoleById,
  findRoleByTitle,
  resolveRole,
  getRolesByDomain,
  CATALOG_SKILL_NAMES,
} from '../../shared/careerRoles.ts';

export { CAREER_DOMAINS, getCareerDomain, getCareerDomainLabel } from '../../shared/careerDomains.ts';

export type { CareerDomain, CareerDomainId } from '../../shared/careerDomains.ts';

export {
  searchCareerCatalog,
  scoreRole,
  scoreDomain,
  suggestClosestRole,
  normalizeSearchText,
} from '../../shared/careerSearch.ts';

export type { CareerSearchMatch, CareerSearchResult } from '../../shared/careerSearch.ts';
