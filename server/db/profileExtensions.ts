// Server persistence for the profile extension tables:
//   public.profile_certifications
//   public.profile_languages
//   public.profile_links
//   public.profile_career_identity
//
// These hold the multi-value parts of the profile that do not fit in the
// single-value columns of public.profiles.
//
// Ownership: profile_id = auth.users.id; the id is always the verified
// Supabase user id, never a client-supplied value.
import { getSupabaseServer } from './supabase';
import {
  DateValidationError,
  normalizeDateValue,
  validateIssueDates,
} from './dates';

// ---- certifications ----

export interface CertificationDTO {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  url: string | null;
  credentialId: string | null;
}

export interface CreateCertificationInput {
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  url?: string;
  credentialId?: string;
}

export type UpdateCertificationInput = Partial<CreateCertificationInput>;

interface CertificationRow {
  id: string;
  name: string;
  issuer: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  url: string | null;
  credential_id: string | null;
}

const CERT_COLUMNS = 'id, name, issuer, issue_date, expiry_date, url, credential_id';

function toCertification(row: CertificationRow): CertificationDTO {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    issueDate: row.issue_date,
    expiryDate: row.expiry_date,
    url: row.url,
    credentialId: row.credential_id,
  };
}

export async function listCertifications(profileId: string): Promise<CertificationDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('profile_certifications')
    .select(CERT_COLUMNS)
    .eq('profile_id', profileId)
    .order('issue_date', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as CertificationRow[]).map(toCertification);
}

export async function createCertification(
  profileId: string,
  input: CreateCertificationInput
): Promise<CertificationDTO> {
  // A certificate that expires before it was issued is a contradiction. A
  // certificate issued years ago is not — that is the ordinary case.
  const issueProblem = validateIssueDates(input.issueDate, input.expiryDate);
  if (issueProblem) throw new DateValidationError(issueProblem);
  const { data, error } = await getSupabaseServer()
    .from('profile_certifications')
    .insert({
      profile_id: profileId,
      name: input.name,
      issuer: input.issuer ?? null,
      issue_date: input.issueDate ? normalizeDateValue(input.issueDate).date : null,
      expiry_date: input.expiryDate ? normalizeDateValue(input.expiryDate).date : null,
      url: input.url ?? null,
      credential_id: input.credentialId ?? null,
    })
    .select(CERT_COLUMNS)
    .single();
  if (error) throw error;
  return toCertification(data as CertificationRow);
}

export async function updateCertification(
  profileId: string,
  certificationId: string,
  updates: UpdateCertificationInput
): Promise<CertificationDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.issuer !== undefined) patch.issuer = updates.issuer ?? null;
  if (updates.issueDate !== undefined) {
    patch.issue_date = updates.issueDate ? normalizeDateValue(updates.issueDate).date : null;
  }
  if (updates.expiryDate !== undefined) {
    patch.expiry_date = updates.expiryDate ? normalizeDateValue(updates.expiryDate).date : null;
  }
  if (updates.url !== undefined) patch.url = updates.url ?? null;
  if (updates.credentialId !== undefined) patch.credential_id = updates.credentialId ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  // The issue and expiry dates are checked against the record as it will be
  // after the change, not against the patch alone.
  if (updates.issueDate !== undefined || updates.expiryDate !== undefined) {
    const { data: current, error: readError } = await getSupabaseServer()
      .from('profile_certifications')
      .select('issue_date, expiry_date')
      .eq('profile_id', profileId)
      .eq('id', certificationId)
      .maybeSingle();
    if (readError) throw readError;
    if (current) {
      const row = current as { issue_date: string | null; expiry_date: string | null };
      const issueDate = patch.issue_date !== undefined ? patch.issue_date : row.issue_date;
      const expiryDate = patch.expiry_date !== undefined ? patch.expiry_date : row.expiry_date;
      const issueProblem = validateIssueDates(issueDate, expiryDate);
      if (issueProblem) throw new DateValidationError(issueProblem);
    }
  }

  const { data, error } = await getSupabaseServer()
    .from('profile_certifications')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', certificationId)
    .select(CERT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toCertification(data as CertificationRow) : null;
}

export async function deleteCertification(
  profileId: string,
  certificationId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('profile_certifications')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', certificationId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// ---- languages ----

export type LanguageProficiency =
  | 'Native'
  | 'Fluent'
  | 'Professional'
  | 'Conversational'
  | 'Basic';

export const LANGUAGE_PROFICIENCIES: LanguageProficiency[] = [
  'Native',
  'Fluent',
  'Professional',
  'Conversational',
  'Basic',
];

export interface LanguageDTO {
  id: string;
  name: string;
  proficiency: string | null;
}

export interface CreateLanguageInput {
  name: string;
  proficiency?: LanguageProficiency;
}

export type UpdateLanguageInput = Partial<CreateLanguageInput>;

interface LanguageRow {
  id: string;
  name: string;
  proficiency: string | null;
}

const LANG_COLUMNS = 'id, name, proficiency';

function toLanguage(row: LanguageRow): LanguageDTO {
  return { id: row.id, name: row.name, proficiency: row.proficiency };
}

export async function listLanguages(profileId: string): Promise<LanguageDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('profile_languages')
    .select(LANG_COLUMNS)
    .eq('profile_id', profileId)
    .order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as LanguageRow[]).map(toLanguage);
}

export async function createLanguage(
  profileId: string,
  input: CreateLanguageInput
): Promise<LanguageDTO> {
  const { data, error } = await getSupabaseServer()
    .from('profile_languages')
    .insert({
      profile_id: profileId,
      name: input.name,
      proficiency: input.proficiency ?? null,
    })
    .select(LANG_COLUMNS)
    .single();
  if (error) throw error;
  return toLanguage(data as LanguageRow);
}

export async function updateLanguage(
  profileId: string,
  languageId: string,
  updates: UpdateLanguageInput
): Promise<LanguageDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.proficiency !== undefined) patch.proficiency = updates.proficiency ?? null;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('profile_languages')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', languageId)
    .select(LANG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toLanguage(data as LanguageRow) : null;
}

export async function deleteLanguage(
  profileId: string,
  languageId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('profile_languages')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', languageId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// ---- links ----

export interface ProfileLinkDTO {
  id: string;
  kind: string;
  label: string | null;
  url: string;
}

export interface CreateProfileLinkInput {
  kind: string;
  label?: string;
  url: string;
}

export type UpdateProfileLinkInput = Partial<CreateProfileLinkInput>;

interface ProfileLinkRow {
  id: string;
  kind: string;
  label: string | null;
  url: string;
}

const LINK_COLUMNS = 'id, kind, label, url';

function toProfileLink(row: ProfileLinkRow): ProfileLinkDTO {
  return { id: row.id, kind: row.kind, label: row.label, url: row.url };
}

export async function listProfileLinks(profileId: string): Promise<ProfileLinkDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('profile_links')
    .select(LINK_COLUMNS)
    .eq('profile_id', profileId)
    .order('kind', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ProfileLinkRow[]).map(toProfileLink);
}

export async function createProfileLink(
  profileId: string,
  input: CreateProfileLinkInput
): Promise<ProfileLinkDTO> {
  // Upsert on the (profile_id, kind) unique key: re-creating a link the user
  // already has updates it instead of failing with a duplicate-key error.
  const { data, error } = await getSupabaseServer()
    .from('profile_links')
    .upsert(
      {
        profile_id: profileId,
        kind: input.kind,
        label: input.label ?? null,
        url: input.url,
      },
      { onConflict: 'profile_id,kind' }
    )
    .select(LINK_COLUMNS)
    .single();
  if (error) throw error;
  return toProfileLink(data as ProfileLinkRow);
}

export async function updateProfileLink(
  profileId: string,
  linkId: string,
  updates: UpdateProfileLinkInput
): Promise<ProfileLinkDTO | null> {
  const patch: Record<string, unknown> = {};
  if (updates.kind !== undefined) patch.kind = updates.kind;
  if (updates.label !== undefined) patch.label = updates.label ?? null;
  if (updates.url !== undefined) patch.url = updates.url;
  // Remove keys whose value is undefined — the Supabase client would otherwise
  // send them as NULL, which violates NOT NULL columns.
  for (const key of Object.keys(patch)) {
    if (patch[key] === undefined) delete patch[key];
  }
  if (Object.keys(patch).length === 0) return null;

  const { data, error } = await getSupabaseServer()
    .from('profile_links')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', linkId)
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toProfileLink(data as ProfileLinkRow) : null;
}

export async function deleteProfileLink(
  profileId: string,
  linkId: string
): Promise<boolean> {
  const { data, error } = await getSupabaseServer()
    .from('profile_links')
    .delete()
    .eq('profile_id', profileId)
    .eq('id', linkId)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}

// ---- career identity ----

export interface CareerIdentityDTO {
  id: string;
  whoYouAre: string | null;
  whereYoureGoing: string | null;
  why: string | null;
  whatYoureMissing: string | null;
  whatYoureBuilding: string | null;
  howYourePresenting: string | null;
  whereApplying: string | null;
}

export interface CareerIdentityInput {
  whoYouAre?: string;
  whereYoureGoing?: string;
  why?: string;
  whatYoureMissing?: string;
  whatYoureBuilding?: string;
  howYourePresenting?: string;
  whereApplying?: string;
}

interface CareerIdentityRow {
  id: string;
  who_you_are: string | null;
  where_youre_going: string | null;
  why: string | null;
  what_youre_missing: string | null;
  what_youre_building: string | null;
  how_youre_presenting: string | null;
  where_applying: string | null;
}

const IDENTITY_COLUMNS =
  'id, who_you_are, where_youre_going, why, what_youre_missing, what_youre_building, how_youre_presenting, where_applying';

function toCareerIdentity(row: CareerIdentityRow): CareerIdentityDTO {
  return {
    id: row.id,
    whoYouAre: row.who_you_are,
    whereYoureGoing: row.where_youre_going,
    why: row.why,
    whatYoureMissing: row.what_youre_missing,
    whatYoureBuilding: row.what_youre_building,
    howYourePresenting: row.how_youre_presenting,
    whereApplying: row.where_applying,
  };
}

export async function getCareerIdentity(
  profileId: string
): Promise<CareerIdentityDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('profile_career_identity')
    .select(IDENTITY_COLUMNS)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data ? toCareerIdentity(data as CareerIdentityRow) : null;
}

/** Upserts the single career-identity row for the profile (1:1). */
export async function saveCareerIdentity(
  profileId: string,
  input: CareerIdentityInput
): Promise<CareerIdentityDTO> {
  const patch: Record<string, unknown> = {};
  if (input.whoYouAre !== undefined) patch.who_you_are = input.whoYouAre ?? null;
  if (input.whereYoureGoing !== undefined) patch.where_youre_going = input.whereYoureGoing ?? null;
  if (input.why !== undefined) patch.why = input.why ?? null;
  if (input.whatYoureMissing !== undefined) patch.what_youre_missing = input.whatYoureMissing ?? null;
  if (input.whatYoureBuilding !== undefined) patch.what_youre_building = input.whatYoureBuilding ?? null;
  if (input.howYourePresenting !== undefined)
    patch.how_youre_presenting = input.howYourePresenting ?? null;
  if (input.whereApplying !== undefined) patch.where_applying = input.whereApplying ?? null;

  const { data, error } = await getSupabaseServer()
    .from('profile_career_identity')
    .upsert({ profile_id: profileId, ...patch }, { onConflict: 'profile_id' })
    .select(IDENTITY_COLUMNS)
    .single();
  if (error) throw error;
  return toCareerIdentity(data as CareerIdentityRow);
}
