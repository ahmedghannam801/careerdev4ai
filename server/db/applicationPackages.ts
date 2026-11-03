import { getSupabaseServer } from './supabase';

export interface ApplicationPackageDTO {
  id: string;
  profileId: string;
  jobTitle: string | null;
  company: string | null;
  jobDescription: string;
  analysis: unknown;
  matchAnalysis: unknown;
  matchScore: number;
  language: string | null;
  sourceCvId: string | null;
  tailoredCvId: string | null;
  tailoredCvVersionId: string | null;
  coverLetterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApplicationPackageInput {
  jobTitle?: string | null;
  company?: string | null;
  jobDescription: string;
  analysis: unknown;
  matchAnalysis: unknown;
  matchScore: number;
  language?: string | null;
  sourceCvId?: string | null;
  tailoredCvId?: string | null;
  tailoredCvVersionId?: string | null;
  coverLetterId?: string | null;
}

export type UpdateApplicationPackageInput = Partial<
  Pick<CreateApplicationPackageInput,
    | 'jobTitle'
    | 'company'
    | 'analysis'
    | 'matchAnalysis'
    | 'matchScore'
    | 'language'
    | 'sourceCvId'
    | 'tailoredCvId'
    | 'tailoredCvVersionId'
    | 'coverLetterId'
  >
>;

interface ApplicationPackageRow {
  id: string;
  profile_id: string;
  job_title: string | null;
  company: string | null;
  job_description: string;
  analysis: unknown;
  match_analysis: unknown;
  match_score: number;
  language: string | null;
  source_cv_id: string | null;
  tailored_cv_id: string | null;
  tailored_cv_version_id: string | null;
  cover_letter_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, profile_id, job_title, company, job_description, analysis, match_analysis, match_score, language, source_cv_id, tailored_cv_id, tailored_cv_version_id, cover_letter_id, created_at, updated_at';

function toDTO(row: ApplicationPackageRow): ApplicationPackageDTO {
  return {
    id: row.id,
    profileId: row.profile_id,
    jobTitle: row.job_title,
    company: row.company,
    jobDescription: row.job_description,
    analysis: row.analysis,
    matchAnalysis: row.match_analysis,
    matchScore: row.match_score,
    language: row.language,
    sourceCvId: row.source_cv_id,
    tailoredCvId: row.tailored_cv_id,
    tailoredCvVersionId: row.tailored_cv_version_id,
    coverLetterId: row.cover_letter_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Lists only packages owned by the authenticated profile. */
export async function listApplicationPackages(profileId: string): Promise<ApplicationPackageDTO[]> {
  const { data, error } = await getSupabaseServer()
    .from('application_packages')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ApplicationPackageRow[]).map(toDTO);
}

/** Creates a package for the authenticated profile. Ownership is never caller-supplied. */
export async function createApplicationPackage(
  profileId: string,
  input: CreateApplicationPackageInput
): Promise<ApplicationPackageDTO> {
  const { data, error } = await getSupabaseServer()
    .from('application_packages')
    .insert({
      profile_id: profileId,
      job_title: input.jobTitle ?? null,
      company: input.company ?? null,
      job_description: input.jobDescription,
      analysis: input.analysis,
      match_analysis: input.matchAnalysis,
      match_score: input.matchScore,
      language: input.language ?? null,
      source_cv_id: input.sourceCvId ?? null,
      tailored_cv_id: input.tailoredCvId ?? null,
      tailored_cv_version_id: input.tailoredCvVersionId ?? null,
      cover_letter_id: input.coverLetterId ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return toDTO(data as ApplicationPackageRow);
}

/** Updates only a row owned by the authenticated profile. */
export async function updateApplicationPackage(
  profileId: string,
  packageId: string,
  input: UpdateApplicationPackageInput
): Promise<ApplicationPackageDTO | null> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.jobTitle !== undefined) patch.job_title = input.jobTitle;
  if (input.company !== undefined) patch.company = input.company;
  if (input.analysis !== undefined) patch.analysis = input.analysis;
  if (input.matchAnalysis !== undefined) patch.match_analysis = input.matchAnalysis;
  if (input.matchScore !== undefined) patch.match_score = input.matchScore;
  if (input.language !== undefined) patch.language = input.language;
  if (input.sourceCvId !== undefined) patch.source_cv_id = input.sourceCvId;
  if (input.tailoredCvId !== undefined) patch.tailored_cv_id = input.tailoredCvId;
  if (input.tailoredCvVersionId !== undefined) patch.tailored_cv_version_id = input.tailoredCvVersionId;
  if (input.coverLetterId !== undefined) patch.cover_letter_id = input.coverLetterId;
  const { data, error } = await getSupabaseServer()
    .from('application_packages')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', packageId)
    .select(SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toDTO(data as ApplicationPackageRow) : null;
}
