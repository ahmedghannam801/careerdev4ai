// The record of a measured CV analysis.
//
// The ATS analysis belongs to the model and lives on the CV version. The
// measured analysis belongs to the platform: it is counted from the
// candidate's own document, and every run of it is kept so that a later
// analysis never erases an earlier one.
//
// Every read and write is scoped to the profile id that was verified from the
// caller's session. There is no path here that can reach another candidate's
// measurements.

import { getSupabaseServer } from './supabase.ts';

/** The shape the interface receives. */
export interface CvMeasurementDTO {
  id: string;
  cvId: string | null;
  cvVersionId: string | null;
  targetRoleTitle: string;
  jobDescription: string | null;
  overallScore: number;
  band: string;
  report: Record<string, unknown>;
  createdAt: string;
}

interface CvMeasurementRow {
  id: string;
  cv_id: string | null;
  cv_version_id: string | null;
  target_role_title: string;
  job_description: string | null;
  overall_score: number;
  band: string;
  report: Record<string, unknown> | null;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, cv_id, cv_version_id, target_role_title, job_description, overall_score, band, report, created_at';

function toDTO(row: CvMeasurementRow): CvMeasurementDTO {
  return {
    id: row.id,
    cvId: row.cv_id,
    cvVersionId: row.cv_version_id,
    targetRoleTitle: row.target_role_title,
    jobDescription: row.job_description,
    overallScore: row.overall_score,
    band: row.band,
    report: row.report ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Records a measured analysis.
 *
 * The row is written through the server, so the profile id is the verified one.
 * A measurement that is not about a stored CV is not written: the studio
 * measures the document the candidate is editing, and that document has no
 * record of its own to hang the history on.
 */
export async function createCvMeasurement(
  profileId: string,
  input: {
    cvId: string | null;
    cvVersionId: string | null;
    targetRoleTitle: string;
    jobDescription: string | null;
    overallScore: number;
    band: string;
    report: Record<string, unknown>;
  }
): Promise<CvMeasurementDTO | null> {
  if (!input.cvId) return null;

  const { data, error } = await getSupabaseServer()
    .from('cv_measurements')
    .insert({
      profile_id: profileId,
      cv_id: input.cvId,
      cv_version_id: input.cvVersionId,
      target_role_title: input.targetRoleTitle,
      job_description: input.jobDescription,
      overall_score: input.overallScore,
      band: input.band,
      report: input.report,
    })
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  return data ? toDTO(data as CvMeasurementRow) : null;
}

/** Every measurement of this candidate, newest first. */
export async function listCvMeasurements(
  profileId: string,
  options: { cvId?: string; limit?: number } = {}
): Promise<CvMeasurementDTO[]> {
  let query = getSupabaseServer()
    .from('cv_measurements')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 20, 1), 100));

  if (options.cvId) query = query.eq('cv_id', options.cvId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as CvMeasurementRow[]).map(toDTO);
}

/** One measurement of this candidate. */
export async function getCvMeasurement(
  profileId: string,
  measurementId: string
): Promise<CvMeasurementDTO | null> {
  const { data, error } = await getSupabaseServer()
    .from('cv_measurements')
    .select(SELECT_COLUMNS)
    .eq('profile_id', profileId)
    .eq('id', measurementId)
    .maybeSingle();

  if (error) throw error;
  return data ? toDTO(data as CvMeasurementRow) : null;
}
