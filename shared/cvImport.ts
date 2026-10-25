/**
 * Plans the fill-only part of a CV import.
 *
 * Import is deliberately conservative: a value the user already has is never
 * overwritten, and the counts returned here describe what was actually put in
 * the request. The caller only adds these counts to the import result after
 * the request succeeds, so a failed request cannot be reported as "added".
 */
import { normalizeProfileUrl } from './urls.ts';

export interface PersonalImportLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  personalWebsite?: string;
  behance?: string;
  dribbble?: string;
  twitter?: string;
}

export interface PersonalImportProfile {
  name?: string | null;
  currentTitle?: string | null;
  headline?: string | null;
  location?: string | null;
  phone?: string | null;
  professionalSummary?: string | null;
  links?: PersonalImportLinks | null;
}

export interface PersonalImportCv {
  fullName?: string | null;
  title?: string | null;
  location?: string | null;
  phone?: string | null;
  summary?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
}

export interface PersonalImportUpdates {
  name?: string;
  currentTitle?: string;
  headline?: string;
  location?: string;
  phone?: string;
  professionalSummary?: string;
  links?: PersonalImportLinks;
}

export interface PersonalImportPlan {
  updates: PersonalImportUpdates;
  imported: number;
  skipped: number;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasLink(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function planPersonalImport(
  profile: PersonalImportProfile,
  cv: PersonalImportCv
): PersonalImportPlan {
  const updates: PersonalImportUpdates = {};
  let imported = 0;
  let skipped = 0;

  const fillText = (
    cvValue: string | null | undefined,
    profileValue: string | null | undefined,
    field: 'name' | 'currentTitle' | 'location' | 'phone' | 'professionalSummary'
  ) => {
    if (!hasText(cvValue)) return;
    if (hasText(profileValue)) {
      skipped += 1;
      return;
    }
    updates[field] = cvValue.trim();
    imported += 1;
  };

  fillText(cv.fullName, profile.name, 'name');
  fillText(cv.title, profile.currentTitle, 'currentTitle');
  fillText(cv.location, profile.location, 'location');
  fillText(cv.phone, profile.phone, 'phone');
  fillText(cv.summary, profile.professionalSummary, 'professionalSummary');

  if (updates.currentTitle && !hasText(profile.headline)) {
    updates.headline = updates.currentTitle;
  }

  const links: PersonalImportLinks = { ...(profile.links ?? {}) };
  let linksChanged = false;

  const fillLink = (kind: 'linkedin' | 'github' | 'personalWebsite', cvValue: string | null | undefined) => {
    if (!hasLink(cvValue)) return;
    if (hasLink(links[kind])) {
      skipped += 1;
      return;
    }
    const normalized = normalizeProfileUrl(cvValue);
    if (!normalized) {
      skipped += 1;
      return;
    }
    links[kind] = normalized;
    linksChanged = true;
    imported += 1;
  };

  fillLink('linkedin', cv.linkedin);
  fillLink('github', cv.github);
  fillLink('personalWebsite', cv.website);

  if (linksChanged) updates.links = links;

  return { updates, imported, skipped };
}
