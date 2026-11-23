// Semantic job matching, and the reason a posting scored what it scored.
//
// WHAT THIS ADDS
// --------------
// The platform already explains a match with five weighted factors: the
// required skills, the preferred skills, the experience, the education and
// the location. Each one is exact — it compares what the candidate's record
// says with what the posting says, name by name.
//
// That is precise, and it is blind. A posting that asks for "Postgres" and a
// candidate who writes "PostgreSQL" do not match. A posting that asks for
// "Figma" and a candidate who writes "UI design" do not match. Neither
// mismatch is a fact about the candidate's fit; they are facts about
// spelling.
//
// The semantic score is a sixth factor that compares the MEANING of the
// posting with the meaning of the candidate's record. It is never the whole
// score, and it never overrides the evidence a candidate can read for
// themselves: it carries a smaller weight than the exact factors, and it is
// always shown with its reason.
//
// WHY IT IS EXPLAINABLE
// ---------------------
// A cosine distance on its own is a number nobody can act on. So the reason
// this module produces names the terms that drove the score: the skills the
// posting mentions that the candidate's record also shows, and the closest
// terms even when the wording differs. The candidate sees "your React and
// TypeScript experience lines up with this posting's frontend work", not
// "0.83".
//
// THE COST
// --------
// Embeddings are a paid model call. They are made once per posting and once
// per candidate and then stored, so the repeated search costs nothing. A
// search with nothing embedded simply has no semantic factor, and the exact
// factors carry the whole score — the product is never worse than it was.

import { getSupabaseServer } from '../db/supabase.ts';
import type { LiveJob } from '../../shared/jobs.ts';
import {
  SEMANTIC_MATCH_WEIGHT,
  compareTerms,
  describeSemanticMatch,
  type SemanticFactorBreakdown,
} from '../../shared/jobMatching.ts';
import {
  EMBEDDING_MODEL,
  embedText,
  embedTexts,
  isEmbeddingConfigured,
  jobEmbeddingText,
  profileEmbeddingText,
  toVectorLiteral,
} from '../ai/embeddings.ts';

/* -------------------------------------------------------------------------- */
/* The factor                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The semantic factor, as the other factors are written.
 *
 * It is the shared type, so the server and the interface describe the factor
 * the same way.
 */
export type SemanticMatchFactor = SemanticFactorBreakdown;

/* -------------------------------------------------------------------------- */
/* The vectors                                                                 */
/* -------------------------------------------------------------------------- */

/** The key a posting is stored under. */
export function jobKeyFor(job: LiveJob): string {
  return job.id;
}

/**
 * The vectors of the postings that are already stored.
 *
 * Only the postings that have one are returned. A posting without a vector
 * simply has no semantic score.
 */
export async function storedJobVectors(jobKeys: readonly string[]): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>();
  if (!jobKeys.length) return result;

  const { data, error } = await getSupabaseServer()
    .from('job_embeddings')
    .select('job_key, embedding')
    .in('job_key', jobKeys.slice(0, 200));

  if (error) {
    console.error('Could not read the stored job vectors:', error.message);
    return result;
  }

  for (const row of (data ?? []) as Array<{ job_key: string; embedding: number[] | null }>) {
    if (Array.isArray(row.embedding)) result.set(row.job_key, row.embedding);
  }

  return result;
}

/**
 * Embeds the postings that do not have a vector yet and stores them.
 *
 * The postings that already have one are left alone, so the repeated search
 * costs nothing. A posting whose vector cannot be built is skipped rather
 * than stored empty.
 */
export async function embedAndStoreJobs(jobs: readonly LiveJob[]): Promise<number> {
  if (!isEmbeddingConfigured() || !jobs.length) return 0;

  const keys = jobs.map(jobKeyFor);
  const stored = await storedJobVectors(keys);
  const missing = jobs.filter((job) => !stored.has(jobKeyFor(job)));
  if (!missing.length) return 0;

  const texts = missing.map((job) => jobEmbeddingText(job));
  const vectors = await embedTexts(texts);
  if (!vectors.length) return 0;

  const rows = missing.slice(0, vectors.length).map((job, index) => ({
    job_key: jobKeyFor(job),
    title: job.title,
    company: job.company,
    embedding: toVectorLiteral(vectors[index]),
    source_text: texts[index],
    model: EMBEDDING_MODEL,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await getSupabaseServer()
    .from('job_embeddings')
    .upsert(rows, { onConflict: 'job_key' });

  if (error) {
    console.error('Could not store the job vectors:', error.message);
    return 0;
  }

  return rows.length;
}

/** The candidate's stored vector. */
export async function storedProfileVector(profileId: string): Promise<number[] | null> {
  const { data, error } = await getSupabaseServer()
    .from('profile_embeddings')
    .select('embedding')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (error) {
    console.error('Could not read the stored profile vector:', error.message);
    return null;
  }

  const embedding = (data as { embedding: number[] | null } | null)?.embedding;
  return Array.isArray(embedding) ? embedding : null;
}

/**
 * Embeds the candidate's record and stores the vector.
 *
 * The vector is replaced when it is older than the record it describes, so a
 * candidate who learns a new skill gets a new vector rather than a stale one.
 */
export async function embedAndStoreProfile(
  profileId: string,
  profile: {
    headline?: string | null;
    skillNames?: readonly string[];
    targetRoleTitles?: readonly string[];
    experienceLevel?: string | null;
    educationLevel?: string | null;
    location?: string | null;
  }
): Promise<number[] | null> {
  if (!isEmbeddingConfigured()) return null;

  const text = profileEmbeddingText(profile);
  if (!text.trim()) return null;

  const vector = await embedText(text);
  if (!vector) return null;

  const { error } = await getSupabaseServer()
    .from('profile_embeddings')
    .upsert(
      {
        profile_id: profileId,
        embedding: toVectorLiteral(vector),
        source_text: text,
        model: EMBEDDING_MODEL,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    );

  if (error) {
    console.error('Could not store the profile vector:', error.message);
    return null;
  }

  return vector;
}

/* -------------------------------------------------------------------------- */
/* The comparison                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Compares the candidate's vector with the postings' vectors.
 *
 * The distance is computed by Postgres, which owns the index. The candidate's
 * vector is passed in as a bound parameter, so nothing the browser sends can
 * become part of the statement.
 */
export async function semanticSimilarities(
  candidateVector: readonly number[],
  jobKeys: readonly string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!jobKeys.length) return result;

  const { data, error } = await getSupabaseServer().rpc('match_jobs_semantically', {
    candidate_embedding: toVectorLiteral(candidateVector),
    match_count: Math.min(jobKeys.length, 100),
    min_similarity: 0,
  });

  if (error) {
    console.error('Could not read the semantic matches:', error.message);
    return result;
  }

  for (const row of (data ?? []) as Array<{ job_key: string; similarity: number }>) {
    result.set(row.job_key, Number(row.similarity));
  }

  return result;
}

/**
 * The semantic factor for one posting.
 *
 * Returns `null` when there is nothing to compare, so the caller can leave
 * the factor out rather than show a score of zero for a comparison that was
 * never made. A missing score is honest; a made-up one is not.
 */
export async function semanticFactorFor(
  job: LiveJob,
  candidateVector: readonly number[] | null,
  candidateText: string,
  catalogue: Iterable<string>
): Promise<SemanticMatchFactor | null> {
  if (!candidateVector) return null;

  const stored = await storedJobVectors([jobKeyFor(job)]);
  const jobVector = stored.get(jobKeyFor(job));
  if (!jobVector) return null;

  const similarities = await semanticSimilarities(candidateVector, [jobKeyFor(job)]);
  const similarity = similarities.get(jobKeyFor(job));
  if (typeof similarity !== 'number' || !Number.isFinite(similarity)) return null;

  const { matched, missing } = compareTerms(job.description ?? job.title, candidateText, catalogue);
  const score = Math.max(0, Math.min(100, Math.round(similarity * 100)));

  return {
    factor: 'semantic',
    score,
    weight: SEMANTIC_MATCH_WEIGHT,
    contribution: (SEMANTIC_MATCH_WEIGHT * score) / 100,
    evaluated: true,
    reason: describeSemanticMatch(similarity, matched, missing),
    matched,
    missing,
  };
}

/**
 * The semantic factor for each of the postings.
 *
 * The whole search is embedded in one batch and compared in one query, so the
 * cost is one model call and one database round trip however many postings
 * came back.
 *
 * A failure anywhere here leaves every posting without a semantic factor. The
 * exact factors still carry the whole score, so a candidate sees a complete
 * explanation either way.
 */
/**
 * How many postings one search may embed and compare.
 *
 * A search can now return postings from several boards at once, and embedding
 * every one of them on the first search would make that search wait for a
 * model call per batch of text. The cap keeps the semantic factor on the
 * postings a candidate is most likely to read, and every posting beyond it
 * keeps the exact factors, which is the same answer the product gave before
 * the factor existed. Vectors are stored, so a posting pays this once.
 */
const MAX_SEMANTIC_JOBS = 40;

export async function semanticFactorsFor(
  jobs: readonly LiveJob[],
  profileId: string,
  profile: {
    headline?: string | null;
    skillNames?: readonly string[];
    targetRoleTitles?: readonly string[];
    experienceLevel?: string | null;
    educationLevel?: string | null;
    location?: string | null;
  },
  catalogue: readonly string[]
): Promise<Map<string, SemanticMatchFactor>> {
  const factors = new Map<string, SemanticMatchFactor>();
  if (!jobs.length || !isEmbeddingConfigured()) return factors;

  const considered = jobs.slice(0, MAX_SEMANTIC_JOBS);

  try {
    // Embed the postings that do not have a vector yet. A failure here is not
    // fatal: the postings that already have one can still be compared.
    await embedAndStoreJobs(considered);

    const candidateVector =
      (await storedProfileVector(profileId)) ?? (await embedAndStoreProfile(profileId, profile));
    if (!candidateVector) return factors;

    const jobKeys = considered.map(jobKeyFor);
    const similarities = await semanticSimilarities(candidateVector, jobKeys);
    if (!similarities.size) return factors;

    const candidateText = profileEmbeddingText(profile);

    for (const job of considered) {
      const similarity = similarities.get(jobKeyFor(job));
      if (typeof similarity !== 'number' || !Number.isFinite(similarity)) continue;

      const { matched, missing } = compareTerms(
        job.description ?? job.title,
        candidateText,
        catalogue
      );
      const score = Math.max(0, Math.min(100, Math.round(similarity * 100)));

      factors.set(jobKeyFor(job), {
        factor: 'semantic',
        score,
        weight: SEMANTIC_MATCH_WEIGHT,
        contribution: (SEMANTIC_MATCH_WEIGHT * score) / 100,
        evaluated: true,
        reason: describeSemanticMatch(similarity, matched, missing),
        matched,
        missing,
      });
    }
  } catch (error) {
    // The semantic factor is an addition, never a requirement. A failure
    // leaves the exact factors to carry the score, exactly as before.
    console.error('Semantic matching failed:', error instanceof Error ? error.message : error);
  }

  return factors;
}
